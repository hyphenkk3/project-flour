/**
 * Phase B — Waiting List customer confirmation page (static).
 * Run: npx tsx scripts/test-waiting-list-customer-confirmation.ts
 *
 * Does not create waiting-list rows or orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidDeliverySlot } from "@/engines/business-calendar/delivery-hours";
import { isValidDineInSlot } from "@/engines/business-calendar/dine-in-hours";
import { isValidPickupSlot } from "@/engines/business-calendar/pickup-slots";
import { customerFulfilmentSlotsForDate } from "@/engines/orders/customer-fulfilment-availability";
import { hashWaitingListConfirmationToken } from "@/engines/waiting-list/confirmation-link";
import {
  WAITING_LIST_CONFIRMATION_ALREADY_TITLE,
  WAITING_LIST_CONFIRMATION_CLOSED_DATES,
  WAITING_LIST_CONFIRMATION_DEADLINE_HELP,
  WAITING_LIST_CONFIRMATION_EXPIRED_CONTACT,
  WAITING_LIST_CONFIRMATION_EXPIRED_TITLE,
  WAITING_LIST_CONFIRMATION_SUCCESS_BODY,
  WAITING_LIST_CONFIRMATION_SUCCESS_TITLE,
  waitingListConfirmationDeadlineSentence,
  waitingListConfirmationExpiredDeadlineSentence,
  waitingListConfirmationQuantitiesFromSnapshot,
  waitingListConfirmationRejectsItemInjection,
} from "@/engines/waiting-list/confirmation-page";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const submitSql = readSrc(
  "supabase/migrations/20260920190000_waiting_list_confirmation_submit.sql",
);
const closedDateSql = readSrc(
  "supabase/migrations/20260921150000_dine_in_party_composition.sql",
);
const actionSrc = readSrc(
  "src/workspaces/storefront/waiting-list/confirmation-actions.ts",
);
const formSrc = readSrc(
  "src/workspaces/storefront/waiting-list/WaitingListConfirmationForm.tsx",
);
const pageSrc = readSrc(
  "src/workspaces/storefront/waiting-list/WaitingListConfirmationPage.tsx",
);
const routeSrc = readSrc("src/app/order/waiting-list/confirm/[token]/page.tsx");
const engineSrc = readSrc("src/engines/waiting-list/confirmation-page.ts");
const typesSrc = readSrc("src/engines/waiting-list/types.ts");

const lookupStart = submitSql.indexOf(
  "create or replace function public.lookup_waiting_list_confirmation_link",
);
const submitStart = submitSql.indexOf(
  "create or replace function public.submit_waiting_list_confirmation",
);
assert.ok(lookupStart >= 0);
assert.ok(submitStart >= 0);
const lookupSql = submitSql.slice(lookupStart, submitStart);
const submitFnSql = closedDateSql;

const snapshot = [
  {
    waitingListItemId: "item-1",
    cakeId: "cake-a",
    cakeSizeId: "size-6",
    offeredQuantity: 1,
  },
  {
    waitingListItemId: "item-2",
    cakeId: "cake-b",
    cakeSizeId: "size-6",
    offeredQuantity: 1,
  },
];

// 1. Valid token loads the correct request.
assert.equal(
  existsSync(
    resolve(
      process.cwd(),
      "src/app/order/waiting-list/confirm/[token]/page.tsx",
    ),
  ),
  true,
);
assert.match(routeSrc, /WaitingListConfirmationPage token=/);
assert.match(actionSrc, /hashWaitingListConfirmationToken/);
assert.match(actionSrc, /lookup_waiting_list_confirmation_link/);
assert.match(lookupSql, /where l\.token_hash = p_token_hash/);
assert.match(lookupSql, /'outcome', 'usable'/);
assert.match(lookupSql, /v_request\.guest_name/);
assert.doesNotMatch(lookupSql, /token_hash', v_link/);
assert.doesNotMatch(lookupSql, /request_id', v_link/);

// 2. Invalid token fails safely.
assert.match(lookupSql, /'outcome', 'unavailable'/);
assert.match(pageSrc, /WAITING_LIST_CONFIRMATION_UNAVAILABLE_TITLE/);
assert.doesNotMatch(pageSrc, /token_hash/);
assert.doesNotMatch(formSrc, /request_id/);

// 3. Expired token fails.
assert.match(lookupSql, /'outcome', 'expired'/);
assert.match(pageSrc, /WAITING_LIST_CONFIRMATION_EXPIRED_TITLE/);
assert.equal(
  WAITING_LIST_CONFIRMATION_EXPIRED_TITLE,
  "This confirmation link has expired.",
);
assert.match(WAITING_LIST_CONFIRMATION_EXPIRED_CONTACT, /WhatsApp/);

// 4. Submitted token cannot be reused.
assert.match(lookupSql, /'outcome', 'submitted'/);
assert.match(submitFnSql, /Your confirmation has already been submitted/);
assert.match(submitFnSql, /and status = 'issued'/);
assert.equal(
  WAITING_LIST_CONFIRMATION_ALREADY_TITLE,
  "Your confirmation has already been submitted.",
);

// 5–6. Cancelled/closed/converted request fails.
assert.match(
  lookupSql,
  /v_request\.status in \('cancelled', 'closed', 'converted'\)/,
);
assert.match(
  submitFnSql,
  /v_request\.status in \('cancelled', 'closed', 'converted'\)/,
);

// 7–9. Item outside snapshot / quantity / cake-size cannot be injected.
assert.match(submitFnSql, /Never persist a client-supplied item list/);
assert.match(
  submitFnSql,
  /v_stored := v_stored - 'token' - 'token_hash' - 'request_id'/,
);
assert.match(
  submitFnSql,
  /'quantity', \(v_entry ->> 'offered_quantity'\)::integer/,
);
assert.deepEqual(waitingListConfirmationQuantitiesFromSnapshot(snapshot), [
  { cakeId: "cake-a", sizeId: "size-6", quantity: 1 },
  { cakeId: "cake-b", sizeId: "size-6", quantity: 1 },
]);
assert.equal(
  waitingListConfirmationRejectsItemInjection({
    snapshot,
    attemptedItems: [
      ...waitingListConfirmationQuantitiesFromSnapshot(snapshot),
      { cakeId: "cake-c", sizeId: "size-8", quantity: 1 },
    ],
  }),
  true,
);
assert.equal(
  waitingListConfirmationRejectsItemInjection({
    snapshot,
    attemptedItems: [
      { cakeId: "cake-a", sizeId: "size-6", quantity: 2 },
      { cakeId: "cake-b", sizeId: "size-6", quantity: 1 },
    ],
  }),
  true,
);
assert.equal(
  waitingListConfirmationRejectsItemInjection({
    snapshot,
    attemptedItems: [
      { cakeId: "cake-a", sizeId: "size-8", quantity: 1 },
      { cakeId: "cake-b", sizeId: "size-6", quantity: 1 },
    ],
  }),
  true,
);
assert.equal(
  waitingListConfirmationRejectsItemInjection({
    snapshot,
    attemptedItems: waitingListConfirmationQuantitiesFromSnapshot(snapshot),
  }),
  false,
);
assert.doesNotMatch(formSrc, /items_json/);
assert.doesNotMatch(actionSrc, /parseItems/);

// 10–12. Existing slot validators.
assert.match(actionSrc, /isValidPickupSlot/);
assert.match(actionSrc, /isValidDeliverySlot/);
assert.match(actionSrc, /isValidDineInSlot/);
assert.match(actionSrc, /isValidDineInReservationPair/);
assert.match(formSrc, /customerFulfilmentSlotsForDate/);
assert.match(formSrc, /FulfilmentMethodChooser/);
assert.match(formSrc, /PickupSlotFields/);
assert.match(submitFnSql, /is_valid_delivery_slot/);
assert.match(submitFnSql, /is_valid_dine_in_slot/);
assert.match(submitFnSql, /is_valid_dine_in_serving_window/);
assert.match(submitFnSql, /is_valid_dine_in_venue/);
assert.match(submitFnSql, /_pickup_slot_in_weekly_hours/);
assert.doesNotMatch(submitFnSql, /is_valid_public_pickup_slot\s*\(/);
assert.equal(typeof isValidPickupSlot, "function");
assert.equal(typeof isValidDeliverySlot, "function");
assert.equal(typeof isValidDineInSlot, "function");
assert.equal(typeof customerFulfilmentSlotsForDate, "function");

// 13. Orders-closed overlay does NOT block Waiting List confirmation.
assert.doesNotMatch(actionSrc, /isPickupOrdersClosed/);
assert.doesNotMatch(actionSrc, /ORDERS_CLOSED_RPC_MESSAGE/);
assert.doesNotMatch(submitFnSql, /is_pickup_orders_closed\s*\(/);
assert.doesNotMatch(submitFnSql, /Orders are closed for that pickup date/);
assert.match(formSrc, /WAITING_LIST_CONFIRMATION_CLOSED_DATES/);
assert.equal(WAITING_LIST_CONFIRMATION_CLOSED_DATES.length, 0);
assert.doesNotMatch(formSrc, /isPickupOrdersClosed/);
assert.doesNotMatch(formSrc, /closedDates=\{closedDates\}/);
assert.doesNotMatch(formSrc, /closedDates=\{model\.closedDates\}/);
assert.doesNotMatch(pageSrc, /closedDates=/);

// Normal checkout still blocks closed dates.
const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
const checkoutFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(checkoutActionsSrc, /isPickupOrdersClosed\(pickupDate\)/);
assert.match(checkoutFormSrc, /isPickupOrdersClosed/);

// 14–15. Opened Wednesday / method-specific hours come from existing loaders.
assert.match(actionSrc, /loadCheckoutCalendarContext/);
assert.match(formSrc, /hoursSnapshot/);
assert.match(formSrc, /customerFulfilmentHoursNotice\(hoursSnapshot\)/);
assert.doesNotMatch(submitFnSql, /make_interval\(mins => 30\)/);
assert.doesNotMatch(formSrc, /17:30/);
assert.doesNotMatch(formSrc, /15:00/);
assert.doesNotMatch(actionSrc, /17:30/);

// 16. No selected-fulfilment-time-minus-30-minutes logic.
assert.match(submitSql, /Not fulfilment-time minus 30 minutes/);
assert.doesNotMatch(submitFnSql, /interval '30 minutes'/);
assert.doesNotMatch(actionSrc, /30 minutes before/);
assert.doesNotMatch(formSrc, /30 minutes before your selected/);
assert.doesNotMatch(engineSrc, /30 minutes before/);
assert.match(WAITING_LIST_CONFIRMATION_DEADLINE_HELP, /response deadline/);
assert.match(
  waitingListConfirmationDeadlineSentence(new Date("2026-09-20T06:30:00.000Z")),
  /Please complete your confirmation by/,
);
assert.match(
  waitingListConfirmationExpiredDeadlineSentence(
    new Date("2026-09-20T06:30:00.000Z"),
  ),
  /The confirmation deadline was/,
);

// 17. Customer submit does NOT create an order.
assert.doesNotMatch(submitFnSql, /submit_guest_preorder/);
assert.doesNotMatch(submitFnSql, /create_staff_guest_preorder/);
assert.doesNotMatch(submitFnSql, /insert into public\.orders/);
assert.doesNotMatch(submitFnSql, /waiting_list_convert_item/);
assert.doesNotMatch(actionSrc, /submit_guest_preorder/);
assert.doesNotMatch(actionSrc, /create_staff_guest_preorder/);
assert.match(submitSql, /Does not create an order/);
assert.match(
  WAITING_LIST_CONFIRMATION_SUCCESS_BODY,
  /not yet a confirmed order/,
);
assert.doesNotMatch(WAITING_LIST_CONFIRMATION_SUCCESS_TITLE, /order number/i);

// 18–19. Payload stored exactly once; second submission rejected.
assert.match(submitFnSql, /submitted_payload = v_stored/);
assert.match(submitFnSql, /status = 'submitted'/);
assert.match(submitFnSql, /submitted_at = now\(\)/);
assert.match(submitFnSql, /where id = v_link.id\n    and status = 'issued'/);
assert.match(typesSrc, /confirmation_link_submitted/);
assert.equal(
  WAITING_LIST_CONFIRMATION_SUCCESS_TITLE,
  "Thank you — we've received your confirmation.",
);

// 20. Existing foundation still hashes tokens the same way.
const token = "phase-b-test-token";
assert.equal(hashWaitingListConfirmationToken(token).length, 64);
assert.notEqual(
  hashWaitingListConfirmationToken(token),
  hashWaitingListConfirmationToken("other-token"),
);
assert.match(actionSrc, /p_token_hash: tokenHash/);
assert.doesNotMatch(
  lookupSql,
  /grant select on table public.waiting_list_confirmation_links/,
);
assert.match(
  submitSql,
  /grant execute on function public.lookup_waiting_list_confirmation_link\(text\)\n {2}to anon, authenticated/,
);
assert.match(
  submitSql,
  /grant execute on function public.submit_waiting_list_confirmation\(text, jsonb\)\n {2}to anon, authenticated/,
);

assert.match(formSrc, /Your Waiting List request/);
assert.match(formSrc, /PickupSlotFields/);
assert.match(formSrc, /minDate=\{pickupDate\}/);
assert.match(formSrc, /maxDate=\{pickupDate\}/);
assert.doesNotMatch(formSrc, /production_capacity/);
assert.doesNotMatch(formSrc, /queue position/i);
assert.match(actionSrc, /loadCheckoutPickupOffer/);
assert.match(formSrc, /Complimentary/);
assert.match(formSrc, /Paid/);

const historical = [
  "supabase/migrations/20260920120000_staff_notification_waiting_list_new_request.sql",
  "supabase/migrations/20260920140000_guest_waiting_list_closed_date.sql",
  "supabase/migrations/20260920160000_guest_waiting_list_multi_item.sql",
  "supabase/migrations/20260920180000_waiting_list_confirmation_links.sql",
];
for (const rel of historical) {
  assert.doesNotMatch(readSrc(rel), /submit_waiting_list_confirmation/);
}
assert.match(
  readSrc(
    "supabase/migrations/20260920140000_guest_waiting_list_closed_date.sql",
  ),
  /is_pickup_orders_closed\(p_pickup_date\)/,
);
assert.match(
  readSrc(
    "supabase/migrations/20260920160000_guest_waiting_list_multi_item.sql",
  ),
  /is_pickup_orders_closed\(p_pickup_date\)/,
);

console.log("waiting-list customer confirmation tests passed");
