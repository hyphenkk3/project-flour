/**
 * Customer Operations assisted/manual order creation — Phase 1.
 * Run: npx tsx scripts/test-customer-operations-manual-order.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canCreateStaffAssistedOrder,
  canOverrideCustomerFulfilmentSchedule,
  buildGuestOrderWorkspaceCapabilities,
} from "@/engines/orders/delivery-finance-capabilities";
import { guestSnapshotFromCrmCustomer } from "@/workspaces/customer-operations/orders/guest-snapshot";
import { parseStaffPreorderItemsFromForm } from "@/workspaces/owner/orders/staff-preorder-form";
import { isStaffGuestOrderSource } from "@/workspaces/owner/orders/labels";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";
import { canAccessWorkspace } from "@/foundation/navigation/access";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

const actions = read("src/workspaces/customer-operations/orders/actions.ts");
const form = read(
  "src/workspaces/customer-operations/orders/AssistedOrderForm.tsx",
);
const newPage = read(
  "src/app/(app)/customer-operations/orders/new/page.tsx",
);
const queries = read(
  "src/workspaces/customer-operations/orders/queries.ts",
);
const card = read(
  "src/workspaces/customer-operations/orders/OrderCard.tsx",
);
const createHelper = read(
  "src/workspaces/owner/orders/create-staff-preorder.ts",
);
const ownerCreate = read("src/workspaces/owner/orders/actions.ts");
const ownerNewPage = read("src/app/(app)/owner/orders/new/page.tsx");

// A. CRM customer can be selected
assert.match(form, /name="customer_id"/);
assert.match(form, /Select customer/);
assert.match(newPage, /listCustomers/);

// B / C. Selected CRM identity becomes guest snapshot
{
  const snapshot = guestSnapshotFromCrmCustomer({
    fullName: "Jane",
    phoneNumber: "0123456789",
  });
  assert.equal(snapshot.guestName, "Jane");
  assert.equal(snapshot.guestPhone, "0123456789");
}
assert.match(actions, /guestSnapshotFromCrmCustomer/);
assert.match(actions, /guestName: snapshot\.guestName/);
assert.match(actions, /guestPhone: snapshot\.guestPhone/);
assert.doesNotMatch(actions, /p_customer_name:[\s\S]{0,40}formData\.get\("guest_name"\)/);

// D. customer_id remains NULL — create uses staff-guest RPC, not orders.insert with customer_id
const createAction = actions.slice(
  actions.indexOf("export async function createOrderAction"),
  actions.indexOf("export async function updateOrderAction"),
);
assert.match(createAction, /createStaffGuestPreorderRecord/);
assert.doesNotMatch(createAction, /\.from\("orders"\)/);
assert.doesNotMatch(createAction, /customer_id:/);
assert.doesNotMatch(createAction, /status: "confirmed"/);
assert.doesNotMatch(createAction, /status: "completed"/);

// E. At least one product is required
assert.match(createHelper, /Please add at least one cake/);
{
  const formData = new FormData();
  formData.set("items_json", "[]");
  assert.equal(parseStaffPreorderItemsFromForm(formData).length, 0);
}

// F / G / H. Cake, size, quantity in the assisted form
assert.match(form, /label="Cake"/);
assert.match(form, /label="Size"/);
assert.match(form, /label="Quantity"/);
assert.match(form, /items_json/);
assert.match(newPage, /listOfferableLibraryCakes/);

{
  const formData = new FormData();
  formData.set(
    "items_json",
    JSON.stringify([
      { cakeId: "cake-1", cakeSizeId: "size-1", quantity: 2 },
      { cakeId: "", cakeSizeId: "size-1", quantity: 1 },
    ]),
  );
  const items = parseStaffPreorderItemsFromForm(formData);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.quantity, 2);
  assert.equal(items[0]?.cakeId, "cake-1");
  assert.equal(items[0]?.cakeSizeId, "size-1");
}

// I–L. order_items snapshots come from create_staff_guest_preorder
assert.match(createHelper, /cake_id: item.cakeId/);
assert.match(createHelper, /cake_size_id: item.cakeSizeId/);
assert.match(createHelper, /quantity: item.quantity/);

// M. Existing staff/manual order source
assert.match(form, /name="order_source"/);
assert.match(form, /defaultValue="whatsapp"/);
assert.equal(isStaffGuestOrderSource("whatsapp"), true);
assert.equal(isStaffGuestOrderSource("customer_website"), false);
assert.match(actions, /isStaffGuestOrderSource/);

// N / O. Initial operational status/payment live in the reused RPC
assert.match(createHelper, /create_staff_guest_preorder/);
assert.doesNotMatch(createHelper, /customer_id/);

// P. Canonical fulfilment slots (not Owner free clock)
assert.match(form, /AssistedOrderFulfilmentFields/);
assert.doesNotMatch(form, /OrderFulfilmentCreateFields/);
assert.match(createHelper, /p_pickup_date: input.pickupDate/);
assert.match(createHelper, /p_pickup_time: input.pickupTime/);
assert.match(createHelper, /slotPolicy: "customer-slots"|slotPolicy \?\? "owner-clock"/);
assert.match(actions, /assistedCreateSlotPolicy/);
assert.match(actions, /owner_special_arrangement/);
assert.doesNotMatch(actions, /slotPolicy: "customer-slots"/);

// Q / R. Discoverable operational order + Guest Order Workspace handoff
assert.match(queries, /\.is\("customer_id", null\)/);
assert.match(queries, /\.in\("order_source"/);
assert.match(card, /ownerOrderWorkspaceHref/);
assert.match(actions, /ownerOrderWorkspaceHref\(created.orderId/);
assert.equal(
  ownerOrderWorkspaceHref("order-1", "/customer-operations/orders"),
  "/owner/orders/order-1?returnTo=%2Fcustomer-operations%2Forders",
);

// S–W. Authorization
assert.equal(canCreateStaffAssistedOrder("owner"), true);
assert.equal(canCreateStaffAssistedOrder("manager"), true);
assert.equal(canCreateStaffAssistedOrder("customer_operations"), true);
assert.equal(canCreateStaffAssistedOrder("bakery"), false);
assert.equal(canCreateStaffAssistedOrder("collection"), false);
assert.equal(canOverrideCustomerFulfilmentSchedule("owner"), true);
assert.equal(canOverrideCustomerFulfilmentSchedule("manager"), false);
assert.equal(canOverrideCustomerFulfilmentSchedule("customer_operations"), false);
assert.equal(canAccessWorkspace("bakery", "customer_operations"), false);
assert.equal(canAccessWorkspace("collection", "customer_operations"), false);
assert.match(actions, /canCreateStaffAssistedOrder/);
assert.match(actions, /requireAssistedOrderCreator/);

assert.equal(
  buildGuestOrderWorkspaceCapabilities({
    role: "owner",
    staffId: "o",
  }).canCreateStaffAssistedOrder,
  true,
);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({
    role: "bakery",
    staffId: "b",
  }).canCreateStaffAssistedOrder,
  false,
);

// Owner free-text create stays Owner-only; CO is the shared CRM-assisted path
assert.match(
  ownerCreate,
  /export async function createStaffGuestOrderAction[\s\S]*?requireOwner\(\)/,
);
assert.match(ownerNewPage, /staff.role.code !== "owner"/);

// Website checkout / Fresh Picks not used
assert.doesNotMatch(actions, /submit_guest_preorder/);
assert.doesNotMatch(actions, /submit_guest_extra_order/);
assert.doesNotMatch(newPage, /Sprint 2/);
assert.doesNotMatch(form, /Sprint 2/);

console.log("PASS customer operations manual order");
