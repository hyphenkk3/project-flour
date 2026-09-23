/**
 * Privileged RPC actor binding + delivery role enforcement (source).
 * Run: npx tsx scripts/test-rpc-actor-binding.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const sql = read(
  "supabase/migrations/20260923200000_rpc_actor_binding_and_payment_write_lock.sql",
);

assert.match(sql, /create or replace function public\._bind_rpc_actor/);
assert.match(sql, /auth\.uid\(\)/);
assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/);
assert.match(sql, /p_claimed_staff_id is distinct from v_staff_id/);
assert.match(sql, /is_active is distinct from false/);
assert.match(sql, /archived_at is null/);
assert.match(sql, /raise exception 'Not authenticated'/);
assert.match(sql, /raise exception 'Not authorized'/);

assert.match(sql, /create or replace function public\._require_rpc_roles/);
assert.match(
  sql,
  /array\['owner', 'manager', 'collection', 'customer_operations'\]/,
);
assert.match(sql, /Not authorized to mark out for delivery/);
assert.match(sql, /Not authorized to mark delivered/);

for (const name of [
  "hold_extra_stock_walk_in",
  "extend_extra_stock_walk_in_hold",
  "release_extra_stock_walk_in_hold",
  "mark_guest_order_picked_up",
  "undo_guest_order_picked_up",
  "mark_guest_order_ready",
  "undo_guest_order_ready",
  "mark_guest_order_production_started",
  "undo_guest_order_production_started",
  "mark_guest_order_out_for_delivery",
  "undo_guest_order_out_for_delivery",
  "mark_guest_order_delivered",
  "undo_guest_order_delivered",
  "guard_post_payment_customer_change",
  "mark_guest_payment_request_sent",
  "extend_guest_payment_deadline",
]) {
  assert.match(sql, new RegExp(`_bind_rpc_actor\\(p_actor_staff_id\\)`));
  assert.match(sql, new RegExp(`create or replace function public\\.${name}`));
}

assert.match(sql, /v_verifier := public\._bind_rpc_actor\(p_verifier_staff_id\)/);
assert.match(sql, /Not authorized to record payment/);
assert.match(
  sql,
  /array\['owner', 'manager', 'customer_operations'\]::text\[\],\s*'Not authorized to record payment'/,
);
const paymentFn =
  sql.split(
    "create or replace function public.record_and_verify_guest_order_payment",
  )[1] ?? "";
assert.doesNotMatch(paymentFn, /and o\.customer_id is null/);

assert.match(
  sql,
  /revoke all on function public\._mark_guest_order_out_for_delivery_impl/,
);
assert.match(
  sql,
  /revoke all on function public\._hold_extra_stock_walk_in_impl/,
);

const originalDelivery = read(
  "supabase/migrations/20260812140000_m4_p5_delivery_operational_lifecycle.sql",
);
assert.match(originalDelivery, /if not exists \(/);
assert.doesNotMatch(originalDelivery, /_bind_rpc_actor/);
assert.doesNotMatch(originalDelivery, /_staff_role_code/);

const actionsSrc = read("src/workspaces/owner/orders/actions.ts");
assert.match(actionsSrc, /mark_guest_order_out_for_delivery/);
assert.match(actionsSrc, /mark_guest_order_delivered/);
assert.match(actionsSrc, /p_actor_staff_id:\s*staff\.id/);
assert.match(actionsSrc, /requireOwnerOrCustomerOperations\(\)/);

console.log("PASS rpc actor binding (source)");
