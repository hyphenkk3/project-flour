/**
 * Closed-date customer Waiting List discovery + guest RPC rule.
 * Run: npx tsx scripts/test-waiting-list-closed-date-discovery.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  customerWaitingListOptionsForDate,
  isCustomerWaitingListJoinable,
  isWaitingListOffered,
} from "@/engines/waiting-list/eligibility";
import {
  WAITING_LIST_AVAILABLE_LABEL,
  WAITING_LIST_CLOSED_NONE,
  WAITING_LIST_CLOSED_REGULAR_ORDERS,
  WAITING_LIST_SEE_AVAILABLE_CTA,
  WAITING_LIST_SEE_AVAILABLE_HELP,
} from "@/engines/waiting-list/phone";
import type { GuestCapacityRow } from "@/engines/preorder/capacity";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const pickupDate = "2026-09-25";
const cakeId = "cake-amour";
const otherCakeId = "cake-other";
const size6 = "size-6";
const size8 = "size-8";
const collectionId = "col-sep";

const catalogue = [
  {
    cakeId,
    cakeName: "Chocolate D'Amour",
    sizeId: size6,
    sizeLabel: '6"',
    price: 125,
  },
  {
    cakeId,
    cakeName: "Chocolate D'Amour",
    sizeId: size8,
    sizeLabel: '8"',
    price: 185,
  },
  {
    cakeId: otherCakeId,
    cakeName: "Pandan",
    sizeId: "size-pandan-6",
    sizeLabel: '6"',
    price: 110,
  },
];

const matchingRow: GuestCapacityRow = {
  pickupDate,
  cakeId,
  sizeId: size6,
  collectionId: null,
  capacityQuantity: 2,
  waitingListEnabled: true,
};

assert.equal(
  isCustomerWaitingListJoinable({
    ordersClosed: true,
    collectionWaitingListEnabled: true,
    matchingCapacity: true,
    capacityWaitingListEnabled: true,
    fullyBooked: false,
  }),
  true,
  "closed date does not require fully booked",
);
assert.equal(
  isWaitingListOffered({
    fullyBooked: false,
    collectionWaitingListEnabled: true,
    capacityWaitingListEnabled: true,
  }),
  false,
  "open-date helper still requires fully booked",
);
assert.equal(
  isCustomerWaitingListJoinable({
    ordersClosed: true,
    collectionWaitingListEnabled: false,
    matchingCapacity: true,
    capacityWaitingListEnabled: true,
    fullyBooked: false,
  }),
  false,
);
assert.equal(
  isCustomerWaitingListJoinable({
    ordersClosed: true,
    collectionWaitingListEnabled: true,
    matchingCapacity: false,
    capacityWaitingListEnabled: true,
    fullyBooked: false,
  }),
  false,
);
assert.equal(
  isCustomerWaitingListJoinable({
    ordersClosed: true,
    collectionWaitingListEnabled: true,
    matchingCapacity: true,
    capacityWaitingListEnabled: false,
    fullyBooked: false,
  }),
  false,
);
assert.equal(
  isCustomerWaitingListJoinable({
    ordersClosed: false,
    collectionWaitingListEnabled: true,
    matchingCapacity: true,
    capacityWaitingListEnabled: true,
    fullyBooked: false,
  }),
  false,
  "open date still requires fully booked",
);
assert.equal(
  isCustomerWaitingListJoinable({
    ordersClosed: false,
    collectionWaitingListEnabled: true,
    matchingCapacity: true,
    capacityWaitingListEnabled: true,
    fullyBooked: true,
  }),
  true,
);

const closedEligible = customerWaitingListOptionsForDate({
  pickupDate,
  collectionId,
  ordersClosed: true,
  collectionWaitingListEnabled: true,
  sizes: catalogue,
  rows: [matchingRow],
});
assert.deepEqual(
  closedEligible.map((row) => `${row.cakeId}|${row.sizeId}`),
  [`${cakeId}|${size6}`],
);

const closedDisabled = customerWaitingListOptionsForDate({
  pickupDate,
  collectionId,
  ordersClosed: true,
  collectionWaitingListEnabled: true,
  sizes: catalogue,
  rows: [{ ...matchingRow, waitingListEnabled: false }],
});
assert.equal(closedDisabled.length, 0);

const closedNoRow = customerWaitingListOptionsForDate({
  pickupDate,
  collectionId,
  ordersClosed: true,
  collectionWaitingListEnabled: true,
  sizes: catalogue,
  rows: [],
});
assert.equal(closedNoRow.length, 0);

const closedCollectionOff = customerWaitingListOptionsForDate({
  pickupDate,
  collectionId,
  ordersClosed: true,
  collectionWaitingListEnabled: false,
  sizes: catalogue,
  rows: [matchingRow],
});
assert.equal(closedCollectionOff.length, 0);

const openNotFull = customerWaitingListOptionsForDate({
  pickupDate,
  collectionId,
  ordersClosed: false,
  collectionWaitingListEnabled: true,
  sizes: catalogue,
  rows: [matchingRow],
  used: [],
});
assert.equal(openNotFull.length, 0);

const openFull = customerWaitingListOptionsForDate({
  pickupDate,
  collectionId,
  ordersClosed: false,
  collectionWaitingListEnabled: true,
  sizes: catalogue,
  rows: [matchingRow],
  used: [
    {
      pickupDate,
      cakeId,
      sizeId: size6,
      collectionId: null,
      quantity: 2,
      status: "paid",
    },
  ],
});
assert.deepEqual(
  openFull.map((row) => `${row.cakeId}|${row.sizeId}`),
  [`${cakeId}|${size6}`],
);

const rpcSql = readSrc(
  "supabase/migrations/20260920140000_guest_waiting_list_closed_date.sql",
);
assert.match(rpcSql, /create or replace function public\._waiting_list_insert_request/);
assert.match(rpcSql, /is_pickup_orders_closed\(p_pickup_date\)/);
assert.match(rpcSql, /_guest_preorder_item_fully_booked/);
assert.match(rpcSql, /This cake is still available to order for that date/);
assert.match(rpcSql, /Waiting list is not enabled for this collection/);
assert.match(rpcSql, /Waiting list is not enabled for that cake and date/);
assert.match(rpcSql, /Waiting list is not available for that cake and date/);
assert.match(rpcSql, /p_actor_staff_id is null/);
assert.doesNotMatch(rpcSql, /submit_guest_preorder/);
assert.doesNotMatch(rpcSql, /waiting_list_new_request/);
assert.doesNotMatch(rpcSql, /staff_notification/);

const insertBlock = rpcSql.slice(
  rpcSql.indexOf("if p_actor_staff_id is null"),
  rpcSql.indexOf("v_position :="),
);
assert.match(insertBlock, /not public\.is_pickup_orders_closed\(p_pickup_date\)/);
assert.match(insertBlock, /_guest_preorder_item_fully_booked/);

const checkoutSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(checkoutSrc, /WAITING_LIST_SEE_AVAILABLE_CTA/);
assert.match(checkoutSrc, /CustomerWaitingListAvailability/);
assert.match(checkoutSrc, /ordersClosedSelected/);
assert.match(checkoutSrc, /loadCustomerWaitingListAvailability/);
assert.match(checkoutSrc, /JoinWaitingListForm/);
assert.doesNotMatch(checkoutSrc, /production_capacity/);
assert.doesNotMatch(checkoutSrc, /capacity_quantity/);
assert.match(checkoutSrc, /reason\.code === "fully_booked"/);
assert.match(
  checkoutSrc,
  /showClosedWaitingListCta \?/,
);

const selectorSrc = readSrc(
  "src/workspaces/storefront/waiting-list/CustomerWaitingListAvailability.tsx",
);
assert.match(selectorSrc, /JoinWaitingListForm/);
assert.match(selectorSrc, /cakeId: option\.cakeId/);
assert.match(selectorSrc, /sizeId: option\.sizeId/);
assert.match(selectorSrc, /pickupDate=\{pickupDate\}/);
assert.match(selectorSrc, /quantity: 1/);
assert.match(selectorSrc, /Select/);
assert.doesNotMatch(selectorSrc, /submit_guest_waiting_list_request/);
assert.doesNotMatch(selectorSrc, /create_staff_waiting_list_request/);

const actionSrc = readSrc(
  "src/workspaces/storefront/waiting-list/actions.ts",
);
assert.match(actionSrc, /submit_guest_waiting_list_request/);
assert.match(actionSrc, /loadCustomerWaitingListAvailability/);
assert.doesNotMatch(actionSrc, /emit_staff_notification_event/);

const querySrc = readSrc(
  "src/workspaces/storefront/waiting-list/queries.ts",
);
assert.match(querySrc, /listCustomerWaitingListAvailability/);
assert.match(querySrc, /customerWaitingListOptionsForDate/);
assert.match(querySrc, /ordersClosed: true/);
assert.match(querySrc, /\.eq\("pickup_date", key\)/);
assert.doesNotMatch(querySrc, /waiting_list_new_request/);

const notifySrc = readSrc(
  "supabase/migrations/20260920120000_staff_notification_waiting_list_new_request.sql",
);
assert.match(notifySrc, /waiting_list_new_request:' \|\| v_request.id/);
assert.doesNotMatch(rpcSql, /created_by_staff_id is not null then/);

assert.equal(WAITING_LIST_SEE_AVAILABLE_CTA, "See What's Available on the Waiting List");
assert.match(WAITING_LIST_CLOSED_REGULAR_ORDERS, /no longer available/);
assert.match(WAITING_LIST_AVAILABLE_LABEL, /Waiting List available/);
assert.match(WAITING_LIST_SEE_AVAILABLE_HELP, /waiting list for this date/);
assert.match(WAITING_LIST_CLOSED_NONE, /not currently accepting Waiting List/);

const staffBoard = readSrc("src/workspaces/waiting-list/WaitingListBoard.tsx");
assert.doesNotMatch(staffBoard, /CustomerWaitingListAvailability/);
assert.doesNotMatch(staffBoard, /WAITING_LIST_SEE_AVAILABLE_CTA/);

const listenerSrc = readSrc(
  "src/components/shell/StaffNotificationListener.tsx",
);
assert.match(listenerSrc, /waiting_list_new_request/);

console.log("PASS waiting list closed-date discovery");
