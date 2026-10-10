/**
 * Read-only reconciliation of DEV's missing paid-order customer-change guard.
 * Run: node --experimental-strip-types scripts/test-post-payment-customer-change-guard-reconciliation.ts
 *
 * Production's live pg_get_functiondef hashes were captured on 7 Oct 2026.
 * This script checks the exact candidate definitions and the app decision
 * path. Runtime database/role behavior must be tested after DEV installation.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decidePostPaymentSave,
  type PostPaymentSaveClassification,
} from "../src/engines/orders/post-payment-customer-change.ts";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = read(
  "supabase/migrations/20261007120100_restore_actor_bound_post_payment_customer_change.sql",
);
const actorBinding = read(
  "supabase/migrations/20260923200000_rpc_actor_binding_and_payment_write_lock.sql",
);
const actions = read("src/workspaces/owner/orders/actions.ts");
const definitions = [
  ...migration.matchAll(/execute \$definition\$\n([\s\S]*?);\n\$definition\$/g),
].map((match) => `${match[1]}\n`);
assert.equal(
  definitions.length,
  2,
  "candidate creates exactly the two guard functions",
);

const [implementation, wrapper] = definitions;
function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}
assert.equal(
  md5(implementation),
  "b3664b493ea538c6b1377dab2a02f1d0",
  "implementation must exactly match live Production pg_get_functiondef",
);
assert.equal(
  md5(wrapper),
  "08232ed19d748c02dcf4ba6ac5380442",
  "actor-bound wrapper must exactly match live Production pg_get_functiondef",
);
assert.match(migration, /partially installed/);
assert.match(migration, /differs from approved Production definitions/);
assert.match(migration, /else\s*execute \$definition\$/);

// Authentication and spoofed-actor protection are in the public wrapper.
assert.match(wrapper, /v_actor := public\._bind_rpc_actor\(p_actor_staff_id\)/);
assert.match(
  wrapper,
  /public\._guard_post_payment_customer_change_impl\(\s*p_order_id,\s*v_actor,\s*p_override/,
);
assert.doesNotMatch(
  wrapper,
  /public\._guard_post_payment_customer_change_impl\(\s*p_order_id,\s*p_actor_staff_id/,
);
assert.match(actorBinding, /v_uid := auth\.uid\(\)/);
assert.match(actorBinding, /p_claimed_staff_id is distinct from v_staff_id/);
assert.match(actorBinding, /raise exception 'Not authorized'/);
assert.match(actorBinding, /raise exception 'Not authenticated'/);
assert.match(
  migration,
  /revoke all on function public\._guard_post_payment_customer_change_impl[\s\S]*?from public, anon, authenticated/,
);
assert.match(
  migration,
  /grant execute on function public\._guard_post_payment_customer_change_impl[\s\S]*?to service_role/,
);
assert.match(
  migration,
  /grant execute on function public\.guard_post_payment_customer_change[\s\S]*?to public, anon, authenticated, service_role/,
);
assert.doesNotMatch(
  migration,
  /\balter table\b|\bcreate trigger\b|\bdrop table\b/i,
);

// Production's private implementation enforces roles and the one-time rule.
assert.match(
  implementation,
  /v_role not in \('owner', 'manager', 'customer_operations'\)/,
);
assert.match(implementation, /if v_role not in \('owner', 'manager'\) then/);
assert.match(
  implementation,
  /if coalesce\(order_row\.post_payment_customer_change_count, 0\) >= 1 then/,
);
assert.match(implementation, /post_payment_customer_change_count = 1/);
assert.match(
  implementation,
  /post_payment_change_override_by = p_actor_staff_id/,
);
assert.match(implementation, /for update/);
assert.match(implementation, /if p_order_id is null then/);
assert.match(implementation, /if p_actor_staff_id is null then/);
assert.match(
  implementation,
  /if not found then\s*raise exception 'Order not found'/,
);
assert.match(
  implementation,
  /where o\.id = p_order_id\s*and o\.customer_id is null/,
);
assert.match(
  implementation,
  /if order_row\.status is distinct from 'paid' then\s*return jsonb_build_object\(\s*'outcome', 'not_applicable'/,
);
assert.match(implementation, /'post_payment_customer_change_override'/);
assert.match(implementation, /'post_payment_customer_change'/);

// Guard consumption and all staff mutations now share one transaction.
const save = actions.slice(
  actions.indexOf("export async function saveOrderWorkspaceAction"),
  actions.indexOf("export async function markConfirmationSentAction"),
);
assert.match(save, /"save_guest_order_workspace_atomic"/);
assert.doesNotMatch(save, /\.from\("orders"\)\s*\.update/);
const amendment = readFileSync(
  "supabase/migrations/20261010104124_cake_size_order_amendment_safety.sql",
  "utf8",
);
assert.match(
  amendment,
  /public\.guard_post_payment_customer_change\(o\.id,actor,override_requested\)/,
);
assert.match(amendment, /public\._bind_rpc_actor\(p_actor_staff_id\)/);
assert.match(
  amendment,
  /set constraints public\.orders_size_availability_final/,
);

const customerChange: PostPaymentSaveClassification = {
  existingCakeLineAltered: false,
  newCakeLineAdded: false,
  pickupOrFulfilmentChanged: true,
  customerFacingChange: true,
};
const existingCakeChange: PostPaymentSaveClassification = {
  ...customerChange,
  existingCakeLineAltered: true,
};
const staffOnly: PostPaymentSaveClassification = {
  ...customerChange,
  customerFacingChange: false,
};
function decision(input: {
  status: string;
  changeCount: number;
  role: "owner" | "manager" | "customer_operations" | "bakery";
  override: boolean;
  classification?: PostPaymentSaveClassification;
}) {
  return decidePostPaymentSave({
    ...input,
    classification: input.classification ?? customerChange,
  });
}

assert.deepEqual(
  decision({
    status: "paid",
    changeCount: 0,
    role: "customer_operations",
    override: false,
  }),
  { action: "consume" },
);
assert.deepEqual(
  decision({ status: "paid", changeCount: 1, role: "owner", override: true }),
  { action: "override" },
);
assert.deepEqual(
  decision({ status: "paid", changeCount: 1, role: "manager", override: true }),
  { action: "override" },
);
assert.equal(
  decision({
    status: "paid",
    changeCount: 1,
    role: "customer_operations",
    override: true,
  }).action,
  "block_override_role",
);
assert.equal(
  decision({ status: "paid", changeCount: 1, role: "owner", override: false })
    .action,
  "block_used",
);
assert.equal(
  decision({
    status: "paid",
    changeCount: 0,
    role: "owner",
    override: false,
    classification: existingCakeChange,
  }).action,
  "block_cake_line",
);
assert.equal(
  decision({
    status: "paid",
    changeCount: 0,
    role: "owner",
    override: true,
    classification: existingCakeChange,
  }).action,
  "override",
);
assert.equal(
  decision({ status: "paid", changeCount: 0, role: "bakery", override: true })
    .action,
  "block_override_role",
);
assert.equal(
  decision({
    status: "paid",
    changeCount: 0,
    role: "owner",
    override: false,
    classification: staffOnly,
  }).action,
  "allow_staff_only",
);
assert.equal(
  decision({
    status: "awaiting_payment",
    changeCount: 0,
    role: "owner",
    override: false,
  }).action,
  "allow_unpaid",
);

console.log(
  "PASS post-payment customer-change guard reconciliation (static and pure)",
);
