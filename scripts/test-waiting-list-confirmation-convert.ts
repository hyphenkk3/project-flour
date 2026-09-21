/**
 * Phase D — Waiting List confirmation → real order conversion (static).
 * Run: npx tsx scripts/test-waiting-list-confirmation-convert.ts
 *
 * Does not create waiting-list rows or orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculateCommercialSubtotal } from "@/engines/orders/totals";
import {
  WAITING_LIST_CONFIRMATION_CONVERT_LABEL,
  WAITING_LIST_CONFIRMATION_CONVERTED_LABEL,
  canConvertWaitingListConfirmation,
  parseStaffWaitingListConfirmationLinks,
  waitingListConvertConfirmationError,
  waitingListConvertedOrderHref,
  WAITING_LIST_CONVERT_GENERIC_ERROR,
  type WaitingListConfirmationStaffLink,
} from "@/engines/waiting-list/confirmation-review";
import { WAITING_LIST_CONFIRMATION_CLOSED_DATES } from "@/engines/waiting-list/confirmation-page";
import { WAITING_LIST_CONFIRMATION_LINK_STATUSES } from "@/engines/waiting-list/confirmation-link";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const originalConvertSql = readSrc(
  "supabase/migrations/20260920220000_waiting_list_confirmation_convert.sql",
);
const convertStateSql = readSrc(
  "supabase/migrations/20260921100000_waiting_list_confirmation_conversion_state.sql",
);
const convertFnStart = convertStateSql.indexOf(
  "create or replace function public.waiting_list_convert_confirmation",
);
assert.ok(convertFnStart >= 0);
const convertSql = convertStateSql.slice(convertFnStart);
const staffCreateSql = readSrc(
  "supabase/migrations/20260917120000_staff_guest_preorder_dine_in.sql",
);
const closedDateSql = readSrc(
  "supabase/migrations/20260920210000_waiting_list_confirmation_closed_date.sql",
);
const historicalStaffListSql = readSrc(
  "supabase/migrations/20260920200000_waiting_list_confirmation_staff_review.sql",
);
const panelSrc = readSrc(
  "src/workspaces/waiting-list/WaitingListConfirmationStaffPanel.tsx",
);
const boardSrc = readSrc("src/workspaces/waiting-list/WaitingListBoard.tsx");
const actionsSrc = readSrc("src/workspaces/waiting-list/actions.ts");
const serverSrc = readSrc("src/workspaces/waiting-list/confirmation-link.ts");
const reviewSrc = readSrc("src/engines/waiting-list/confirmation-review.ts");
const customerActionSrc = readSrc(
  "src/workspaces/storefront/waiting-list/confirmation-actions.ts",
);
const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
const checkoutFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);

assert.equal(
  existsSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260920220000_waiting_list_confirmation_convert.sql",
    ),
  ),
  true,
);

assert.ok(WAITING_LIST_CONFIRMATION_LINK_STATUSES.includes("converted"));
assert.equal(WAITING_LIST_CONFIRMATION_CONVERT_LABEL, "Convert to Order");
assert.equal(WAITING_LIST_CONFIRMATION_CONVERTED_LABEL, "Converted to Order");
assert.equal(
  waitingListConvertedOrderHref("order-1"),
  "/bakery/orders/order-1",
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
      cakeName: "Chocolate D'Amour",
      sizeLabel: '6"',
      quantity: 2,
      unitPrice: 180,
    },
  ],
  review: {
    customerName: "Aisha",
    customerPhone: "0123456789",
    fulfilmentMethod: "pickup",
    fulfilmentLabel: "Pickup",
    pickupDate: "2026-09-26",
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
        cakeName: "Chocolate D'Amour",
        sizeLabel: '6"',
        quantity: 2,
        unitPrice: 180,
      },
    ],
    reviewTotal: 360,
    reviewTotalLabel: "RM 360.00",
  },
};

assert.equal(canConvertWaitingListConfirmation(submittedLink), true);
assert.equal(
  canConvertWaitingListConfirmation({ ...submittedLink, status: "issued" }),
  false,
);
assert.equal(
  canConvertWaitingListConfirmation({ ...submittedLink, status: "expired" }),
  false,
);
assert.equal(
  canConvertWaitingListConfirmation({
    ...submittedLink,
    status: "invalidated",
  }),
  false,
);
assert.equal(
  canConvertWaitingListConfirmation({
    ...submittedLink,
    status: "converted",
    convertedOrderId: "order-1",
    convertedOrderNumber: "ORD-20260920-0001",
  }),
  false,
);
assert.equal(
  canConvertWaitingListConfirmation({ ...submittedLink, review: null }),
  false,
);

const convertedParsed = parseStaffWaitingListConfirmationLinks([
  {
    id: "link-1",
    request_id: "req-1",
    status: "converted",
    expires_at: "2026-09-20T06:30:00.000Z",
    issued_at: "2026-09-20T06:00:00.000Z",
    submitted_at: "2026-09-20T06:10:00.000Z",
    converted_order_id: "order-1",
    converted_order_number: "ORD-20260920-0001",
    items: submittedLink.items,
    submitted_payload: {
      customer_name: "Aisha",
      phone: "0123456789",
      pickup_date: "2026-09-26",
      pickup_time: "15:00",
      fulfilment_method: "pickup",
    },
  },
]);
assert.equal(convertedParsed[0]?.status, "converted");
assert.equal(convertedParsed[0]?.convertedOrderId, "order-1");
assert.equal(convertedParsed[0]?.convertedOrderNumber, "ORD-20260920-0001");
assert.equal(convertedParsed[0]?.review?.items.length, 1);
assert.equal(canConvertWaitingListConfirmation(convertedParsed[0]), false);

// A. Single-item conversion: one create, snapshot quantity, converted_order_id.
assert.match(convertSql, /waiting_list_convert_confirmation/);
assert.match(convertSql, /create_staff_guest_preorder/);
assert.equal(
  (convertSql.match(/v_order := public\.create_staff_guest_preorder/g) ?? [])
    .length,
  1,
);
assert.match(convertSql, /converted_order_id = v_order\.id/);
assert.match(convertSql, /status = 'converted'/);
assert.match(panelSrc, /WAITING_LIST_CONFIRMATION_CONVERT_LABEL/);
assert.match(panelSrc, /WAITING_LIST_CONFIRMATION_CONVERTED_LABEL/);

// B. Multi-item: one order, multiple order_items from snapshot loop.
assert.match(
  convertSql,
  /for v_entry in[\s\S]*jsonb_array_elements\(v_link\.item_snapshot\)[\s\S]*v_items := v_items \|\| jsonb_build_array/,
);
assert.match(
  convertSql,
  /jsonb_build_object\(\s*'cake_id', v_cake_id,\s*'cake_size_id', v_size_id,\s*'quantity', v_qty/,
);
assert.doesNotMatch(convertSql, /waiting_list_convert_item\(/);
assert.match(
  staffCreateSql,
  /for item in select \* from jsonb_array_elements\(p_items\)/,
);

// C. Partial offer: accepted uses offered snapshot qty, remaining stays represented.
assert.match(convertSql, /offered_quantity/);
assert.match(
  convertSql,
  /accepted_quantity = i\.accepted_quantity \+ v_consume/,
);
assert.match(
  convertSql,
  /when i\.remaining_quantity - v_consume <= 0 then 'converted'/,
);
assert.match(convertSql, /else 'partially_accepted'/);
assert.doesNotMatch(convertSql, /accepted_quantity\s*=\s*i\.quantity/);
assert.doesNotMatch(convertSql, /v_remaining := v_item\.remaining_quantity/);

// D. Fulfilment: pickup / delivery / dine-in persisted through staff create.
assert.match(convertSql, /v_method not in \('pickup', 'delivery', 'dine_in'\)/);
assert.match(convertSql, /_pickup_slot_in_weekly_hours/);
assert.match(convertSql, /is_valid_delivery_slot/);
assert.match(convertSql, /is_valid_dine_in_slot/);
assert.match(convertSql, /v_method::public\.fulfilment_method/);
assert.match(staffCreateSql, /_sync_order_fulfilment_from_payload/);

// E. Options / add-ons persist via existing complimentary + paid addon sync.
assert.match(convertSql, /complimentary/);
assert.match(convertSql, /paid_addons/);
assert.match(staffCreateSql, /_sync_order_paid_addons_from_payload/);
assert.match(staffCreateSql, /order_complimentary_items/);

// F. Pricing is server-side; client unit_price is stripped.
assert.match(
  convertSql,
  /Server-side catalogue prices only\. Client unit_price \/ subtotal are ignored/,
);
assert.match(
  convertSql,
  /jsonb_build_object\(\s*'code', v_addon ->> 'code',\s*'quantity', coalesce\(\(v_addon ->> 'quantity'\)::integer, 1\),\s*'messages'/,
);
assert.match(
  convertSql,
  /jsonb_build_object\(\s*'cake_id', v_cake_id,\s*'cake_size_id', v_size_id,\s*'quantity', v_qty\s*\)/,
);
assert.doesNotMatch(
  convertSql,
  /jsonb_build_object\(\s*'cake_id', v_cake_id[\s\S]{0,120}unit_price/,
);
assert.match(staffCreateSql, /size_row\.price/);
assert.equal(
  calculateCommercialSubtotal({
    items: [{ quantity: 2, unitPrice: 180 }],
    paidAddons: [{ quantity: 1, unitPrice: 8 }],
  }),
  368,
);

// G. Double conversion is locked and idempotent.
assert.match(convertSql, /for update/);
assert.match(convertSql, /already_converted/);
assert.match(
  convertSql,
  /where id = v_link\.id\s+and status = 'submitted'\s+and converted_order_id is null/,
);
assert.match(
  actionsSrc,
  /convertWaitingListConfirmationAction\(\s*requestId: string/,
);
assert.match(
  panelSrc,
  /convertWaitingListConfirmationAction\(\s*row\.requestId/,
);
assert.doesNotMatch(
  panelSrc,
  /convertWaitingListConfirmationAction\([^)]*quantity/,
);
const convertServerStart = serverSrc.indexOf(
  "export async function convertWaitingListConfirmation",
);
assert.ok(convertServerStart >= 0);
const convertServerSrc = serverSrc.slice(convertServerStart);
assert.match(convertServerSrc, /p_request_id: id/);
assert.doesNotMatch(convertServerSrc, /p_quantity|p_unit_price|p_items/);

// H–J. Expired / invalidated / unsubmitted cannot convert.
assert.match(convertSql, /This confirmation link has expired/);
assert.match(convertSql, /This confirmation link has been invalidated/);
assert.match(convertSql, /This confirmation has not been submitted/);
assert.equal(
  waitingListConvertConfirmationError("This confirmation link has expired"),
  "This confirmation link has expired",
);
assert.equal(
  waitingListConvertConfirmationError(
    "This confirmation has not been submitted",
  ),
  "This confirmation has not been submitted",
);

// K. Hold / offered quantity no longer valid.
assert.match(convertSql, /Hold no longer valid/);
assert.match(convertSql, /Offered quantity is no longer available/);
assert.match(convertSql, /h\.status = 'active'/);
assert.match(convertSql, /v_hold\.quantity is distinct from v_qty/);

// L. Normal checkout is unchanged.
assert.match(checkoutActionsSrc, /submit_guest_preorder/);
assert.doesNotMatch(checkoutActionsSrc, /waiting_list_convert_confirmation/);
assert.doesNotMatch(checkoutFormSrc, /waiting_list_convert_confirmation/);
assert.doesNotMatch(convertSql, /submit_guest_preorder\s*\(/);
assert.doesNotMatch(customerActionSrc, /waiting_list_convert_confirmation/);
assert.doesNotMatch(customerActionSrc, /create_staff_guest_preorder/);

// M. Closed-date confirmation behaviour remains on weekly hours.
assert.equal(WAITING_LIST_CONFIRMATION_CLOSED_DATES.length, 0);
assert.match(closedDateSql, /_pickup_slot_in_weekly_hours/);
assert.doesNotMatch(
  closedDateSql.replaceAll(
    /Waiting List confirmation is not a new normal customer order\.[\s\S]*?is_pickup_orders_closed is true\./g,
    "",
  ),
  /is_pickup_orders_closed\s*\(/,
);
assert.doesNotMatch(
  convertSql.replaceAll(
    /Closed-date confirmations stay convertible: pickup uses weekly hours only\.[\s\S]*?is_pickup_orders_closed is true\./g,
    "",
  ),
  /is_pickup_orders_closed\s*\(/,
);
assert.match(convertSql, /_pickup_slot_in_weekly_hours/);

// N. No accidental payment — reuse staff guest unpaid default.
assert.match(staffCreateSql, /'unpaid'/);
assert.doesNotMatch(convertSql, /payment_status/);
assert.doesNotMatch(convertSql, /'paid'/);
assert.match(convertSql, /Payment remains unpaid/);

assert.match(staffCreateSql, /'submitted'/);
assert.match(convertSql, /'whatsapp'/);
assert.doesNotMatch(convertSql, /customer_website/);

assert.match(panelSrc, /canConvertWaitingListConfirmation/);
assert.match(boardSrc, /WAITING_LIST_CONFIRMATION_CONVERTED_LABEL/);
assert.match(boardSrc, /WAITING_LIST_CONFIRMATION_SUBMITTED_LABEL/);
assert.match(actionsSrc, /scheduleStaffNotificationDispatch/);
assert.match(serverSrc, /p_actor_staff_id: staff\.id/);
assert.match(serverSrc, /p_request_id: id/);
assert.match(reviewSrc, /WAITING_LIST_CONFIRMATION_CONVERT_LABEL/);
assert.equal(
  waitingListConvertConfirmationError(
    "duplicate key value violates unique constraint",
  ),
  WAITING_LIST_CONVERT_GENERIC_ERROR,
);

assert.match(historicalStaffListSql, /Does not create an order/);
assert.match(originalConvertSql, /when 'converted' then 2/);
assert.match(originalConvertSql, /converted_order_number/);
assert.match(panelSrc, /Open order/);
assert.match(panelSrc, /waitingListConvertedOrderHref/);
assert.doesNotMatch(panelSrc, /name="quantity"/);
assert.doesNotMatch(panelSrc, /name="unit_price"/);

console.log("waiting-list confirmation convert tests passed");
