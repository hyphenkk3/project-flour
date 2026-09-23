/**
 * Payment / allocation / adjustment write lock (source).
 * Run: npx tsx scripts/test-payment-write-lock.ts
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

assert.match(sql, /drop policy if exists payments_authenticated_insert/);
assert.match(
  sql,
  /drop policy if exists payment_allocations_authenticated_insert/,
);
assert.match(
  sql,
  /drop policy if exists order_adjustments_authenticated_insert/,
);
assert.match(
  sql,
  /drop policy if exists order_adjustments_authenticated_update/,
);
assert.match(sql, /prevent_direct_order_payment_mutation/);
assert.match(sql, /current_user in \('authenticated', 'anon'\)/);
assert.match(
  sql,
  /Payment status can only be changed through the verified payment workflow/,
);
assert.match(sql, /orders_prevent_direct_payment_mutation/);
assert.doesNotMatch(sql, /create policy payments_authenticated_insert/);
assert.doesNotMatch(
  sql,
  /create policy payment_allocations_authenticated_insert/,
);

const ownerActions = read("src/workspaces/owner/orders/actions.ts");
assert.match(ownerActions, /record_and_verify_guest_order_payment/);
assert.match(ownerActions, /from\("refunds"\)\.insert/);
assert.doesNotMatch(ownerActions, /from\("payments"\)\.insert/);
assert.doesNotMatch(ownerActions, /from\("payment_allocations"\)\.insert/);

const checkout = read("src/workspaces/storefront/checkout/actions.ts");
assert.doesNotMatch(checkout, /from\("payments"\)/);
assert.doesNotMatch(checkout, /from\("payment_allocations"\)/);
assert.doesNotMatch(checkout, /payment_status:\s*"paid"/);

const refunds = read(
  "supabase/migrations/20260923140000_payment_correction_refunds.sql",
);
assert.match(refunds, /_current_staff_role_code\(\) in \('owner', 'manager'\)/);

console.log("PASS payment write lock (source)");
