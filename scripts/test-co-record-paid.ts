/**
 * Legacy CO Record paid must not fabricate verified payment.
 * Run: npx tsx scripts/test-co-record-paid.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const actions = read("src/workspaces/customer-operations/orders/actions.ts");
assert.match(actions, /export async function recordOrderPaidAction/);
assert.match(actions, /RECORD_VERIFIED_PAYMENT_REQUIRED/);
const recordPaidFn =
  actions.split("export async function recordOrderPaidAction")[1]?.split(
    "export async function cancelOrderAction",
  )[0] ?? "";
assert.doesNotMatch(recordPaidFn, /payment_status:\s*"paid"/);
assert.match(recordPaidFn, /RECORD_VERIFIED_PAYMENT_REQUIRED/);
assert.match(
  actions,
  /const RECORD_VERIFIED_PAYMENT_REQUIRED =\s*"Record verified payment in the Order Workspace\. Direct paid status is no longer used\."/,
);
assert.doesNotMatch(actions, /export const RECORD_VERIFIED_PAYMENT_REQUIRED/);

const ui = read(
  "src/workspaces/customer-operations/orders/OrderStatusActions.tsx",
);
assert.match(ui, /Record verified payment/);
assert.match(ui, /ownerOrderWorkspaceHref/);
assert.doesNotMatch(ui, /recordOrderPaidAction/);
assert.doesNotMatch(ui, /Record payment paid/);
assert.doesNotMatch(ui, /Payment recorded as paid/);

const ownerQuery = read("src/workspaces/owner/orders/queries.ts");
const getGuest = ownerQuery.split("export async function getGuestOrderById")[1] ?? "";
assert.match(getGuest, /\.eq\("id", id\)/);
assert.doesNotMatch(
  getGuest.split("export async function")[0] ?? "",
  /\.is\("customer_id", null\)/,
);

const ownerActions = read("src/workspaces/owner/orders/actions.ts");
assert.match(ownerActions, /record_and_verify_guest_order_payment/);
assert.match(ownerActions, /p_verifier_staff_id:\s*staff\.id/);

console.log("PASS CO record paid routes to verified payment");
