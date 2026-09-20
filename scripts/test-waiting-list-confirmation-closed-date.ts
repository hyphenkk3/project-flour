/**
 * Waiting List confirmation on storefront-closed dates.
 * Run: npx tsx scripts/test-waiting-list-confirmation-closed-date.ts
 *
 * Does not create waiting-list rows or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidDeliverySlot } from "@/engines/business-calendar/delivery-hours";
import { isValidDineInSlot } from "@/engines/business-calendar/dine-in-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  closeCapabilitiesOnDate,
  copyWeeklyDayToDate,
} from "@/engines/business-calendar/operating-hours";
import { isValidPickupSlot } from "@/engines/business-calendar/pickup-slots";
import {
  customerFulfilmentAvailability,
  customerFulfilmentSlotsForDate,
} from "@/engines/orders/customer-fulfilment-availability";
import { WAITING_LIST_CONFIRMATION_CLOSED_DATES } from "@/engines/waiting-list/confirmation-page";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const CLOSED_DATE = "2026-09-25";
const OPEN_DATE = "2026-09-24";
const STOREFRONT_CLOSED = [CLOSED_DATE];
const snapshot = OPERATING_HOURS_SEED;

assert.equal(new Date(2026, 8, 25).getDay(), 5, "25 Sep 2026 is Friday");
assert.equal(WAITING_LIST_CONFIRMATION_CLOSED_DATES.length, 0);

const formSrc = readSrc(
  "src/workspaces/storefront/waiting-list/WaitingListConfirmationForm.tsx",
);
const pageSrc = readSrc(
  "src/workspaces/storefront/waiting-list/WaitingListConfirmationPage.tsx",
);
const actionSrc = readSrc(
  "src/workspaces/storefront/waiting-list/confirmation-actions.ts",
);
const submitSql = readSrc(
  "supabase/migrations/20260920210000_waiting_list_confirmation_closed_date.sql",
);
const historicalSubmitSql = readSrc(
  "supabase/migrations/20260920190000_waiting_list_confirmation_submit.sql",
);
const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
const checkoutFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const guestPreorderSql = readSrc(
  "supabase/migrations/20260904213000_fix_submit_guest_preorder_item_ambiguity.sql",
);

// A. Closed normal orders + valid Waiting List: pickup slots from operating hours.
const checkoutPickup = customerFulfilmentSlotsForDate(
  "pickup",
  CLOSED_DATE,
  STOREFRONT_CLOSED,
  snapshot,
);
assert.equal(checkoutPickup.length, 0, "normal checkout overlay empties pickup");
assert.equal(
  customerFulfilmentAvailability(CLOSED_DATE, STOREFRONT_CLOSED, snapshot).pickup
    .reason,
  "Orders closed",
);

const confirmationPickup = customerFulfilmentSlotsForDate(
  "pickup",
  CLOSED_DATE,
  WAITING_LIST_CONFIRMATION_CLOSED_DATES,
  snapshot,
);
assert.ok(confirmationPickup.length > 0, "confirmation pickup uses hours");
assert.equal(
  confirmationPickup.some((slot) => slot.value === "15:00"),
  true,
);
assert.equal(isValidPickupSlot(CLOSED_DATE, "15:00", snapshot), true);
assert.equal(
  customerFulfilmentAvailability(
    CLOSED_DATE,
    WAITING_LIST_CONFIRMATION_CLOSED_DATES,
    snapshot,
  ).pickup.available,
  true,
);
assert.notEqual(
  customerFulfilmentAvailability(
    CLOSED_DATE,
    WAITING_LIST_CONFIRMATION_CLOSED_DATES,
    snapshot,
  ).pickup.reason,
  "Orders closed",
);

// B. Delivery follows existing delivery schedule, not invented availability.
const confirmationDelivery = customerFulfilmentSlotsForDate(
  "delivery",
  CLOSED_DATE,
  WAITING_LIST_CONFIRMATION_CLOSED_DATES,
  snapshot,
);
assert.ok(confirmationDelivery.length > 0);
assert.equal(isValidDeliverySlot(CLOSED_DATE, "15:00", snapshot), true);
assert.equal(isValidDeliverySlot(CLOSED_DATE, "15:30", snapshot), false);
assert.equal(
  customerFulfilmentSlotsForDate(
    "delivery",
    CLOSED_DATE,
    STOREFRONT_CLOSED,
    snapshot,
  ).length,
  0,
);

// C. Dine-in follows existing dine-in schedule.
const confirmationDineIn = customerFulfilmentSlotsForDate(
  "dine_in",
  CLOSED_DATE,
  WAITING_LIST_CONFIRMATION_CLOSED_DATES,
  snapshot,
);
assert.ok(confirmationDineIn.length > 0);
assert.equal(isValidDineInSlot(CLOSED_DATE, "17:00", snapshot), true);
assert.equal(
  customerFulfilmentSlotsForDate(
    "dine_in",
    CLOSED_DATE,
    STOREFRONT_CLOSED,
    snapshot,
  ).length,
  0,
);

// D. Normal checkout still blocks 25 Sep.
assert.match(checkoutActionsSrc, /await isPickupOrdersClosed\(pickupDate\)/);
assert.match(checkoutFormSrc, /isPickupOrdersClosed/);
assert.match(guestPreorderSql, /is_pickup_orders_closed\(p_pickup_date\)/);
assert.doesNotMatch(actionSrc, /isPickupOrdersClosed/);
assert.doesNotMatch(submitSql, /is_pickup_orders_closed\s*\(/);

// E. Open date confirmation still uses hours.
const openPickup = customerFulfilmentSlotsForDate(
  "pickup",
  OPEN_DATE,
  WAITING_LIST_CONFIRMATION_CLOSED_DATES,
  snapshot,
);
assert.ok(openPickup.length > 0);
assert.equal(isValidPickupSlot(OPEN_DATE, "15:00", snapshot), true);

// F. Public-holiday / manually opened date uses existing operating-day copy.
const wednesday = "2026-09-23";
assert.equal(new Date(2026, 8, 23).getDay(), 3);
assert.equal(
  customerFulfilmentSlotsForDate(
    "delivery",
    wednesday,
    WAITING_LIST_CONFIRMATION_CLOSED_DATES,
    snapshot,
  ).length,
  0,
  "normal Wednesday has no delivery",
);
const openedWednesday = copyWeeklyDayToDate(snapshot, wednesday, 1, [
  "pickup",
  "delivery",
  "dine_in",
  "hyphen",
  "whitebird",
]);
const openedDelivery = customerFulfilmentSlotsForDate(
  "delivery",
  wednesday,
  WAITING_LIST_CONFIRMATION_CLOSED_DATES,
  openedWednesday,
);
assert.ok(openedDelivery.length > 0);
assert.equal(openedDelivery.at(-1)?.value, "15:00");
assert.doesNotMatch(formSrc, /17:30/);
assert.doesNotMatch(formSrc, /15:00/);
assert.doesNotMatch(actionSrc, /17:30/);
assert.doesNotMatch(submitSql, /time '17:30'/);
assert.doesNotMatch(submitSql, /time '15:00'/);

const closedHours = closeCapabilitiesOnDate(snapshot, CLOSED_DATE, [
  "pickup",
  "delivery",
  "dine_in",
]);
assert.equal(
  customerFulfilmentSlotsForDate(
    "pickup",
    CLOSED_DATE,
    WAITING_LIST_CONFIRMATION_CLOSED_DATES,
    closedHours,
  ).length,
  0,
  "no pickup hours remains unavailable",
);

// G. Invalid slot still rejected by existing validators.
assert.equal(isValidPickupSlot(CLOSED_DATE, "03:00", snapshot), false);
assert.match(actionSrc, /isValidPickupSlot/);
assert.match(actionSrc, /isValidDeliverySlot/);
assert.match(actionSrc, /isValidDineInSlot/);
assert.match(submitSql, /_pickup_slot_in_weekly_hours/);
assert.match(submitSql, /is_valid_delivery_slot/);
assert.match(submitSql, /is_valid_dine_in_slot/);

// H. Expired confirmation still rejected.
assert.match(submitSql, /This confirmation link has expired/);
assert.match(submitSql, /and status = 'issued'/);
assert.match(actionSrc, /expiresAt/);

// I. Submit still stores payload and does not create an order.
assert.match(submitSql, /submitted_payload = v_stored/);
assert.doesNotMatch(submitSql, /insert into public\.orders/);
assert.doesNotMatch(submitSql, /submit_guest_preorder/);
assert.doesNotMatch(submitSql, /waiting_list_convert_item/);
assert.doesNotMatch(actionSrc, /submit_guest_preorder/);
assert.doesNotMatch(formSrc, /accepted_quantity/);

// Locked date and no new schedule/cutoff.
assert.match(formSrc, /minDate=\{pickupDate\}/);
assert.match(formSrc, /maxDate=\{pickupDate\}/);
assert.match(formSrc, /WAITING_LIST_CONFIRMATION_DATE_LOCKED_HELP/);
assert.doesNotMatch(submitSql, /make_interval\(mins => 30\)/);
assert.doesNotMatch(actionSrc, /30 minutes before/);
assert.doesNotMatch(pageSrc, /closedDates=/);

// Historical eligibility / Phase B submit files were not rewritten.
assert.match(
  readSrc("supabase/migrations/20260920140000_guest_waiting_list_closed_date.sql"),
  /is_pickup_orders_closed\(p_pickup_date\)/,
);
assert.match(
  readSrc("supabase/migrations/20260920160000_guest_waiting_list_multi_item.sql"),
  /is_pickup_orders_closed\(p_pickup_date\)/,
);
assert.match(
  historicalSubmitSql,
  /is_pickup_orders_closed\(v_date\)/,
);
assert.match(historicalSubmitSql, /is_valid_public_pickup_slot/);

console.log("waiting-list confirmation closed-date tests passed");
