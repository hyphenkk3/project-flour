import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = read(
  "supabase/migrations/20261105143835_actor_bound_payment_lifecycle_reconciliation.sql",
);
assert.match(migration, /security definer\s+set search_path = ''/i);
assert.match(migration, /public\._bind_rpc_actor\(p_actor_staff_id\)/);
assert.match(migration, /public\._require_rpc_roles\([\s\S]*'owner', 'manager', 'customer_operations'/);
assert.match(migration, /where o\.id = p_order_id[\s\S]*for update/i);
assert.match(migration, /public\.order_amount_due\(p_order_id\)/);
assert.match(migration, /public\.order_net_received\(p_order_id\)/);
assert.match(migration, /'paid'::public\.order_status/);
assert.match(migration, /'awaiting_payment'::public\.order_status/);
assert.match(migration, /updated_by = v_actor/);
assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated, service_role/i);
assert.match(migration, /grant execute[\s\S]*to authenticated/i);
assert.doesNotMatch(migration, /drop trigger|disable trigger|alter table public\.orders/i);
assert.doesNotMatch(migration, /insert into public\.(payments|payment_allocations)/i);

const ownerOrders = read("src/workspaces/owner/orders/actions.ts");
const financialReconcileStart = ownerOrders.indexOf(
  "async function reconcileOrderStatusAfterFinancialChange",
);
const financialReconcileEnd = ownerOrders.indexOf("\n}\n", financialReconcileStart) + 3;
const financialReconcile = ownerOrders.slice(
  financialReconcileStart,
  financialReconcileEnd,
);
assert.match(financialReconcile, /rpc\([\s\S]*reconcile_guest_order_payment_lifecycle/);
assert.doesNotMatch(financialReconcile, /\.from\("orders"\)\s*\.update/);

const approvals = read("src/workspaces/owner/approvals/actions.ts");
const approvalReconcileStart = approvals.indexOf(
  "async function reconcilePaymentLifecycleAfterApproval",
);
const approvalReconcileEnd = approvals.indexOf(
  "async function reconcileAfterDiscountApproval",
  approvalReconcileStart,
);
const approvalReconcile = approvals.slice(
  approvalReconcileStart,
  approvalReconcileEnd,
);
assert.match(approvalReconcile, /rpc\([\s\S]*reconcile_guest_order_payment_lifecycle/);
assert.doesNotMatch(approvalReconcile, /\.from\("orders"\)\s*\.update/);

const checkoutForm = read(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const submitBlockedStart = checkoutForm.indexOf("const submitBlocked =");
const submitBlockedEnd = checkoutForm.indexOf("const confirmSnapshot =", submitBlockedStart);
assert.match(
  checkoutForm.slice(submitBlockedStart, submitBlockedEnd),
  /items\.length === 0/,
);
assert.match(checkoutForm, /if \(items\.length === 0\)\s*\{\s*setItemError\("Please add at least one cake to your preorder\."\)/);

const checkoutAction = read("src/workspaces/storefront/checkout/actions.ts");
assert.match(
  checkoutAction,
  /if \(items\.length === 0\)\s*\{\s*return \{ error: "Please add at least one cake to your preorder\." \};/,
);

console.log("PASS payment lifecycle reconciliation and empty-cart guard contracts");
