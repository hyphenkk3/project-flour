/**
 * Waiting List confirmation → conversion state-machine (static).
 * Run: npx tsx scripts/test-waiting-list-confirmation-conversion-state.ts
 *
 * Does not create waiting-list rows or orders. Does not repair DEV data.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  WAITING_LIST_CONFIRMATION_ALREADY_SUBMITTED_RESPONSE,
  WAITING_LIST_CONFIRMATION_CONVERT_LABEL,
  WAITING_LIST_CONFIRMATION_CONVERT_USES_SUBMITTED_DETAILS,
  WAITING_LIST_ITEM_ALREADY_CONVERTED,
  canConvertWaitingListConfirmation,
  canRecordWaitingListItemResponse,
  canShowWaitingListItemConvertAction,
  waitingListConfirmationIsAuthoritativeResponse,
  waitingListConvertConfirmationError,
  type WaitingListConfirmationStaffLink,
} from "@/engines/waiting-list/confirmation-review";
import {
  waitingListConsumeConfirmationOffer,
  waitingListRequestStatusFromItems,
} from "@/engines/waiting-list/queue";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sliceFn(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const next = sql.indexOf("\ncreate or replace function public.", start + 1);
  return sql.slice(start, next > start ? next : undefined);
}

const migrationRel =
  "supabase/migrations/20260921100000_waiting_list_confirmation_conversion_state.sql";
assert.equal(existsSync(resolve(process.cwd(), migrationRel)), true);

const stateSql = readSrc(migrationRel);
const convertSql = sliceFn(stateSql, "waiting_list_convert_confirmation");
const recordSql = sliceFn(stateSql, "waiting_list_record_response");
const convertItemSql = sliceFn(stateSql, "waiting_list_convert_item");
const syncSql = sliceFn(stateSql, "_waiting_list_sync_request_status");
const helperSql = sliceFn(
  stateSql,
  "_waiting_list_item_has_submitted_confirmation",
);
const boardSrc = readSrc("src/workspaces/waiting-list/WaitingListBoard.tsx");
const panelSrc = readSrc(
  "src/workspaces/waiting-list/WaitingListConfirmationStaffPanel.tsx",
);

const submittedLink: WaitingListConfirmationStaffLink = {
  id: "link-1",
  requestId: "req-1",
  status: "submitted",
  expiresAt: "2026-09-20T06:30:00.000Z",
  issuedAt: "2026-09-20T06:00:00.000Z",
  submittedAt: "2026-09-20T06:10:00.000Z",
  convertedOrderId: null,
  convertedOrderNumber: null,
  items: [
    {
      cakeName: "Mangolicious Symphony",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 180,
    },
  ],
  review: {
    customerName: "Aisha",
    customerPhone: "0123456789",
    fulfilmentMethod: "pickup",
    fulfilmentLabel: "Pickup",
    pickupDate: "2026-09-25",
    selectedTime: "15:00",
    selectedTimeLabel: "3:00 PM",
    delivery: null,
    dineIn: null,
    complimentary: [],
    paidAddons: [],
    customerNote: null,
    includeReceipt: false,
    items: [
      {
        cakeName: "Mangolicious Symphony",
        sizeLabel: '6"',
        quantity: 1,
        unitPrice: 180,
      },
    ],
    reviewTotal: 180,
    reviewTotalLabel: "RM 180.00",
  },
};

const issuedLink: WaitingListConfirmationStaffLink = {
  ...submittedLink,
  status: "issued",
  submittedAt: null,
  review: null,
};

// 1. Submitted confirmation cannot be Record-response Accepted again.
assert.equal(
  waitingListConfirmationIsAuthoritativeResponse(submittedLink),
  true,
);
assert.equal(
  canRecordWaitingListItemResponse({
    itemStatus: "contacted",
    confirmationLink: submittedLink,
  }),
  false,
);
assert.equal(
  canRecordWaitingListItemResponse({
    itemStatus: "contacted",
    confirmationLink: issuedLink,
  }),
  true,
);
assert.equal(
  canRecordWaitingListItemResponse({
    itemStatus: "contacted",
    confirmationLink: null,
  }),
  true,
);
assert.match(recordSql, /_waiting_list_item_has_submitted_confirmation/);
assert.match(
  recordSql,
  /raise exception 'Customer confirmation has already been submitted'/,
);
assert.match(boardSrc, /canRecordWaitingListItemResponse/);
assert.equal(
  WAITING_LIST_CONFIRMATION_ALREADY_SUBMITTED_RESPONSE,
  "Customer confirmation has already been submitted",
);

// 2. Submitted confirmation can convert using offered snapshot + active hold.
assert.equal(canConvertWaitingListConfirmation(submittedLink), true);
assert.match(convertSql, /v_entry ->> 'offered_quantity'/);
assert.match(convertSql, /h\.status = 'active'/);
assert.match(convertSql, /v_hold\.quantity is distinct from v_qty/);
assert.match(convertSql, /create_staff_guest_preorder/);
assert.match(
  convertSql,
  /Do not use waiting_list_items\.remaining_quantity as availability/,
);

// 3. Request remaining does not block valid conversion.
assert.doesNotMatch(convertSql, /v_remaining := v_item\.remaining_quantity/);
assert.doesNotMatch(convertSql, /if v_remaining < v_qty/);
assert.doesNotMatch(convertSql, /v_item\.remaining_quantity >= v_qty/);
assert.doesNotMatch(convertSql, /from public\.production_capacity\b/);
assert.match(helperSql, /_waiting_list_item_has_submitted_confirmation/);

const alreadyAccepted = waitingListConsumeConfirmationOffer({
  quantity: 1,
  acceptedQuantity: 1,
  offeredQuantity: 1,
});
assert.equal(alreadyAccepted.consumeQuantity, 0);
assert.equal(alreadyAccepted.acceptedQuantity, 1);
assert.equal(alreadyAccepted.remainingQuantity, 0);
assert.equal(alreadyAccepted.status, "converted");

const untouchedOffer = waitingListConsumeConfirmationOffer({
  quantity: 1,
  acceptedQuantity: 0,
  offeredQuantity: 1,
});
assert.equal(untouchedOffer.consumeQuantity, 1);
assert.equal(untouchedOffer.acceptedQuantity, 1);
assert.equal(untouchedOffer.status, "converted");

assert.match(
  convertSql,
  /v_consume := least\(v_qty, v_item\.remaining_quantity\)/,
);
assert.match(
  convertSql,
  /accepted_quantity = i\.accepted_quantity \+ v_consume/,
);

// 4. Conversion quantity comes from offered snapshot, not requested quantity.
assert.match(
  convertSql,
  /jsonb_build_object\(\s*'cake_id', v_cake_id,\s*'cake_size_id', v_size_id,\s*'quantity', v_qty/,
);
assert.doesNotMatch(convertSql, /v_qty := v_item\.quantity/);
assert.match(
  convertSql,
  /v_qty := \(v_entry ->> 'offered_quantity'\)::integer/,
);

const partialOffer = waitingListConsumeConfirmationOffer({
  quantity: 3,
  acceptedQuantity: 0,
  offeredQuantity: 1,
});
assert.equal(partialOffer.acceptedQuantity, 1);
assert.equal(partialOffer.remainingQuantity, 2);
assert.equal(partialOffer.status, "partially_accepted");

// 5. Expired / missing hold still blocks conversion.
assert.match(convertSql, /raise exception 'Hold no longer valid'/);
assert.match(convertSql, /v_hold\.held_until <= now\(\)/);
assert.equal(
  waitingListConvertConfirmationError("Hold no longer valid"),
  "Hold no longer valid",
);
assert.equal(
  waitingListConvertConfirmationError(
    "Offered quantity is no longer available",
  ),
  "Offered quantity is no longer available",
);

// 6. Already converted confirmation cannot convert again.
assert.equal(
  canConvertWaitingListConfirmation({
    ...submittedLink,
    status: "converted",
    convertedOrderId: "order-1",
    convertedOrderNumber: "ORD-1",
  }),
  false,
);
assert.match(convertSql, /already_converted/);
assert.match(
  convertSql,
  /raise exception 'This confirmation has already been converted'/,
);
assert.match(
  convertSql,
  /raise exception 'This waiting-list item has already been converted'/,
);
assert.equal(
  waitingListConvertConfirmationError(WAITING_LIST_ITEM_ALREADY_CONVERTED),
  WAITING_LIST_ITEM_ALREADY_CONVERTED,
);

// 7. Request does not become converted without converted_order_id.
assert.equal(waitingListRequestStatusFromItems(["accepted"]), "active");
assert.equal(
  waitingListRequestStatusFromItems([
    { status: "accepted", convertedOrderId: null },
  ]),
  "active",
);
assert.equal(
  waitingListRequestStatusFromItems([
    { status: "accepted", convertedOrderId: "order-1" },
  ]),
  "converted",
);
assert.equal(
  waitingListRequestStatusFromItems([
    { status: "converted", convertedOrderId: null },
  ]),
  "active",
);
assert.match(syncSql, /bool_or\(i\.converted_order_id is not null\)/);
assert.doesNotMatch(
  syncSql,
  /i\.status in \('converted', 'partially_accepted', 'accepted'\)/,
);
assert.match(syncSql, /converted requires converted_order_id/);

// 8. Successful conversion sets the correct accepted/consumed state.
assert.match(
  convertSql,
  /when i\.remaining_quantity - v_consume <= 0 then 'converted'/,
);
assert.match(convertSql, /else 'partially_accepted'/);
assert.match(convertSql, /converted_order_id = v_order\.id/);
assert.match(convertSql, /status = 'converted'/);
assert.match(convertSql, /_waiting_list_sync_request_status/);

// 9. Submitted fulfilment details are used by conversion.
assert.match(convertSql, /v_payload := v_link\.submitted_payload/);
assert.match(convertSql, /v_payload ->> 'pickup_time'/);
assert.match(convertSql, /v_payload ->> 'fulfilment_method'/);
assert.match(convertSql, /v_payload -> 'delivery'/);
assert.match(convertSql, /v_payload -> 'dine_in'/);
assert.match(convertSql, /v_payload ->> 'customer_name'/);
assert.doesNotMatch(convertSql, /p_pickup_time/);
assert.doesNotMatch(panelSrc, /name="pickup_time"/);
assert.doesNotMatch(panelSrc, /name="quantity"/);
assert.match(
  panelSrc,
  /WAITING_LIST_CONFIRMATION_CONVERT_USES_SUBMITTED_DETAILS/,
);
assert.equal(
  WAITING_LIST_CONFIRMATION_CONVERT_USES_SUBMITTED_DETAILS,
  "Uses the customer's submitted fulfilment details.",
);
assert.equal(WAITING_LIST_CONFIRMATION_CONVERT_LABEL, "Convert to Order");

// One conversion action after confirmation: hide item-level convert.
assert.equal(
  canShowWaitingListItemConvertAction({
    itemStatus: "accepted",
    confirmationLink: submittedLink,
  }),
  false,
);
assert.equal(
  canShowWaitingListItemConvertAction({
    itemStatus: "contacted",
    confirmationLink: submittedLink,
  }),
  false,
);
assert.equal(
  canShowWaitingListItemConvertAction({
    itemStatus: "contacted",
    confirmationLink: issuedLink,
  }),
  true,
);
assert.equal(
  canShowWaitingListItemConvertAction({
    itemStatus: "contacted",
    confirmationLink: null,
  }),
  true,
);
assert.match(boardSrc, /canShowWaitingListItemConvertAction/);
assert.match(panelSrc, /WAITING_LIST_CONFIRMATION_CONVERT_LABEL/);
assert.match(convertItemSql, /_waiting_list_item_has_submitted_confirmation/);
assert.match(
  convertItemSql,
  /raise exception 'Customer confirmation has already been submitted'/,
);

assert.doesNotMatch(convertSql, /from public\.production_capacity\b/);
assert.match(stateSql, /Request remaining is not an/);
assert.match(stateSql, /availability test/);

console.log("waiting-list confirmation conversion state tests passed");
