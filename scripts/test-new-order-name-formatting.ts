/** New-order-only person-name formatting checks. Run with `npx tsx`. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatNewOrderPersonName } from "../src/engines/orders/customer-name.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

assert.equal(formatNewOrderPersonName("GENEVIEVE KURIN"), "Genevieve Kurin");
assert.equal(formatNewOrderPersonName("genevieve kurin"), "Genevieve Kurin");
assert.equal(formatNewOrderPersonName("gEnEvIeVe kUrIn"), "Genevieve Kurin");
assert.equal(
  formatNewOrderPersonName("JOHN TAN WEI MING"),
  "John Tan Wei Ming",
);
assert.equal(formatNewOrderPersonName("McDONALD"), "Mcdonald");
assert.equal(formatNewOrderPersonName("O'NEILL"), "O'neill");
assert.equal(formatNewOrderPersonName("ANNE-MARIE O’NEILL"), "Anne-marie O’neill");
assert.equal(
  formatNewOrderPersonName("  gEnEvIeVe   kUrIn  "),
  "  Genevieve   Kurin  ",
);
assert.equal(formatNewOrderPersonName("'ALICE / TAN"), "'Alice / Tan");
assert.equal(formatNewOrderPersonName("ÉLODIE NG"), "Élodie Ng");
assert.equal(formatNewOrderPersonName("ΜΑΡΙΑ ΠΑΠΑ"), "Μαρια Παπα");
assert.equal(formatNewOrderPersonName("王小明"), "王小明");
assert.equal(formatNewOrderPersonName(""), "");
assert.equal(formatNewOrderPersonName("   \t  "), "   \t  ");

const checkoutAction = read("src/workspaces/storefront/checkout/actions.ts");
const checkoutBody = checkoutAction.slice(
  checkoutAction.indexOf("async function submitGuestPreorderActionBody"),
  checkoutAction.indexOf("export async function cancelGuestOrderAction"),
);
assert.match(checkoutBody, /p_customer_name:\s*formattedCustomerName/);
assert.match(checkoutBody, /p_phone:\s*phone/);
assert.match(checkoutBody, /p_email:\s*null/);
assert.match(checkoutBody, /p_notes:\s*notes\s*\|\|\s*null/);
assert.match(checkoutBody, /recipientName:\s*sameAsCustomer[\s\S]*?formatNewOrderPersonName/);

const checkoutForm = read(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(checkoutForm, /patchFields\(\{ customerName: event\.target\.value \}\)/);
assert.doesNotMatch(checkoutForm, /formatNewOrderPersonName/);

const extraAction = read("src/workspaces/storefront/extra/actions.ts");
const extraBody = extraAction.slice(
  extraAction.indexOf("async function submitGuestExtraOrderActionBody"),
  extraAction.indexOf("export async function cancelGuestExtraOrderAction"),
);
assert.match(extraBody, /p_customer_name:\s*formattedCustomerName/);
assert.match(extraBody, /p_phone:\s*phone/);
assert.match(extraBody, /p_email:\s*null/);
assert.match(extraBody, /p_notes:\s*notes\s*\|\|\s*null/);
assert.match(extraBody, /recipientName:\s*sameAsCustomer[\s\S]*?formatNewOrderPersonName/);

const staffCreate = read("src/workspaces/owner/orders/create-staff-preorder.ts");
assert.match(staffCreate, /p_customer_name:\s*formatNewOrderPersonName\(guestName\)/);
assert.match(staffCreate, /recipientName:\s*formatNewOrderPersonName\(input\.delivery\.recipientName\)/);
assert.match(staffCreate, /p_phone:\s*input\.guestPhone/);
assert.match(staffCreate, /p_email:\s*input\.guestEmail/);
assert.match(staffCreate, /p_customer_notes:\s*input\.customerNotes/);

const ownerActions = read("src/workspaces/owner/orders/actions.ts");
const ownerNewOrder = ownerActions.slice(
  ownerActions.indexOf("export async function createStaffGuestOrderAction"),
  ownerActions.indexOf("export async function saveOrderWorkspaceAction"),
);
assert.match(ownerNewOrder, /createStaffGuestPreorderRecord/);
assert.doesNotMatch(ownerNewOrder, /formatNewOrderPersonName/);
const duplicateOrder = ownerActions.slice(
  ownerActions.indexOf("export async function duplicateGuestOrderAction"),
);
assert.match(duplicateOrder, /p_customer_name:\s*formatNewOrderPersonName\(source\.customerName\)/);
assert.match(duplicateOrder, /recipientName:\s*formatNewOrderPersonName/);

const customerOpsActions = read("src/workspaces/customer-operations/orders/actions.ts");
const customerOpsCreate = customerOpsActions.slice(
  customerOpsActions.indexOf("export async function createOrderAction"),
  customerOpsActions.indexOf("export async function updateOrderAction"),
);
assert.match(customerOpsCreate, /getCustomerById/);
assert.match(customerOpsCreate, /guestName:\s*snapshot\.guestName/);
assert.match(customerOpsCreate, /createStaffGuestPreorderRecord/);
assert.doesNotMatch(customerOpsCreate, /\.from\(["']customers["']\)\.(update|upsert)/);

const waitingListActions = read("src/workspaces/storefront/waiting-list/actions.ts");
assert.doesNotMatch(waitingListActions, /formatNewOrderPersonName/);

for (const [path, start, end] of [
  [
    "src/workspaces/owner/orders/actions.ts",
    "export async function saveOrderWorkspaceAction",
    "export async function markConfirmationSentAction",
  ],
  [
    "src/workspaces/customer-operations/orders/actions.ts",
    "export async function updateOrderAction",
    "export async function markOrderPendingConfirmationAction",
  ],
] as const) {
  const source = read(path);
  const existingOrderEdit = source.slice(source.indexOf(start), source.indexOf(end));
  assert.doesNotMatch(existingOrderEdit, /formatNewOrderPersonName/);
}

for (const path of [
  "src/workspaces/owner/orders/queries.ts",
  "src/workspaces/customer-operations/orders/queries.ts",
]) {
  assert.doesNotMatch(read(path), /formatNewOrderPersonName/);
}

const guestRpcSources = [
  read("supabase/migrations/20260904213000_fix_submit_guest_preorder_item_ambiguity.sql"),
  read("supabase/migrations/20260923080000_guest_extra_delivery_processing_ack.sql"),
  read("supabase/migrations/20260808093000_preview3a2_staff_guest_preorder.sql"),
];
for (const source of guestRpcSources) {
  assert.doesNotMatch(source, /update\s+public\.customers/i);
  assert.match(
    source,
    /insert into public\.orders\s*\([\s\S]*?\bcustomer_id\b[\s\S]*?\bguest_name\b[\s\S]*?\)\s*values\s*\(\s*public\.allocate_order_number\(\),\s*null,\s*trim\(p_customer_name\)/i,
    "new guest-order RPC stores a name snapshot without linking a customer profile",
  );
}

console.log("PASS new-order person-name formatting and write-boundary coverage");
