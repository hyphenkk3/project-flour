/**
 * Whole Cake customer fulfilment: Pickup | Dine-in | Delivery.
 * Run: npx tsx scripts/test-whole-cake-customer-fulfilment.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDeliverySchedule, isValidDeliverySlot } from "@/engines/business-calendar/delivery-hours";
import {
  isValidDineInSlot,
  parseGuestCount,
  resolveDineInSchedule,
} from "@/engines/business-calendar/dine-in-hours";
import { copyWeeklyDayToDate } from "@/engines/business-calendar/operating-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  customerDeliveryAvailability,
  customerDineInAvailability,
  customerFulfilmentHoursNotice,
  customerPickupAvailability,
} from "@/engines/orders/customer-fulfilment-availability";
import {
  isPickupCrewMessageAvailable,
  parseCustomerWebsiteFulfilmentMethod,
} from "@/engines/orders/fulfilment";
import { operationalSectionTitle } from "@/engines/orders/operational-state";
import { bakeryFulfilmentCue } from "@/workspaces/bakery/eligibility";
import { isActiveOnCollectionBoard } from "@/workspaces/collection/eligibility";
import {
  emptyPreorderFields,
  fieldsAfterFulfilmentChange,
} from "@/workspaces/storefront/checkout/preorder-draft";

const checkoutSrc = readFileSync(
  resolve("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx"),
  "utf8",
);
const availabilitySrc = readFileSync(
  resolve("src/engines/orders/customer-fulfilment-availability.ts"),
  "utf8",
);
const chooserSrc = readFileSync(
  resolve("src/workspaces/storefront/checkout/FulfilmentMethodChooser.tsx"),
  "utf8",
);
const extraSrc = readFileSync(
  resolve("src/workspaces/storefront/extra/GuestExtraOrderForm.tsx"),
  "utf8",
);
const extraActionsSrc = readFileSync(
  resolve("src/workspaces/storefront/extra/actions.ts"),
  "utf8",
);
const checkoutActionsSrc = readFileSync(
  resolve("src/workspaces/storefront/checkout/actions.ts"),
  "utf8",
);
const thankYouSrc = readFileSync(
  resolve("src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx"),
  "utf8",
);
const enumMigration = readFileSync(
  resolve("supabase/migrations/20260818200000_fulfilment_method_dine_in.sql"),
  "utf8",
);
const fulfilmentMigration = readFileSync(
  resolve(
    "supabase/migrations/20260818210000_whole_cake_customer_fulfilment.sql",
  ),
  "utf8",
);
const venueMigration = readFileSync(
  resolve("supabase/migrations/20260819100000_dine_in_reservation_venue.sql"),
  "utf8",
);

assert.match(chooserSrc, /Pickup/);
assert.match(chooserSrc, /Dine-in/);
assert.match(chooserSrc, /Delivery/);
assert.match(chooserSrc, /fulfilment_method/);
assert.match(checkoutSrc, /guest_count/);
assert.match(checkoutSrc, /dine_in_venue/);
assert.match(checkoutSrc, /reservation_time/);
assert.match(checkoutSrc, /Where would you like to sit\?/);
assert.match(checkoutSrc, /address_line_1/);
assert.match(checkoutSrc, /include_receipt/);
assert.match(checkoutSrc, /email_submission_receipt_requested/);
assert.match(checkoutSrc, /addingCake/);
assert.match(checkoutSrc, /Change date/);
assert.match(checkoutSrc, /customerFulfilmentHoursNotice/);
assert.match(checkoutSrc, /DINE_IN_RESERVATION_INCLUDED_NOTICE/);
assert.match(customerFulfilmentHoursNotice(), /Planning your visit\?/);
assert.match(availabilitySrc, /Dine-in reservation included/);
assert.match(availabilitySrc, /Unavailable Wednesday/);
assert.match(availabilitySrc, /No delivery Wednesday/);
assert.match(chooserSrc, /disabled=\{!state\.available\}/);
const summarySrc = readFileSync(
  resolve("src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx"),
  "utf8",
);
assert.match(summarySrc, /\+ Add another cake/);
assert.match(summarySrc, /\{addingCake \?/);
assert.doesNotMatch(
  summarySrc.split("{addingCake ?")[0] ?? "",
  /\{cakes\.map\(/,
);
assert.match(summarySrc, /\{cakes\.map\(/);
assert.doesNotMatch(extraSrc, /fulfilment_method/);
assert.doesNotMatch(extraSrc, /Dine-in/);
assert.match(extraActionsSrc, /submit_guest_extra_order/);
assert.doesNotMatch(extraActionsSrc, /p_fulfilment_method/);
assert.match(checkoutActionsSrc, /p_fulfilment_method/);
assert.match(checkoutActionsSrc, /p_dine_in/);
assert.match(checkoutActionsSrc, /p_delivery/);
assert.match(thankYouSrc, /workspaceScheduleDateLabel/);
assert.match(thankYouSrc, /dineInVenueLabel/);
assert.match(thankYouSrc, /Venue/);
assert.match(thankYouSrc, /Dine-in reservation time/);
assert.match(thankYouSrc, /Guests/);
assert.doesNotMatch(
  thankYouSrc.split("workspaceScheduleDateLabel")[0] ?? "",
  />Pickup date</,
);

assert.match(enumMigration, /add value if not exists 'dine_in'/);
assert.match(fulfilmentMigration, /order_dine_in_reservations/);
assert.match(fulfilmentMigration, /p_fulfilment_method/);
assert.match(fulfilmentMigration, /default 'pickup'/);
assert.doesNotMatch(fulfilmentMigration, /submit_guest_extra_order\s*\(/);
assert.match(fulfilmentMigration, /is_valid_dine_in_slot/);
assert.match(fulfilmentMigration, /is_valid_delivery_slot/);
assert.match(venueMigration, /dine_in_venue/);
assert.match(venueMigration, /is_valid_dine_in_venue/);

assert.equal(parseCustomerWebsiteFulfilmentMethod("dine_in"), "dine_in");
assert.equal(parseCustomerWebsiteFulfilmentMethod("delivery"), "delivery");
assert.equal(parseCustomerWebsiteFulfilmentMethod(""), "pickup");
assert.equal(parseGuestCount(""), null);
assert.equal(parseGuestCount("0"), null);
assert.equal(parseGuestCount("4"), 4);

const fromPickup = fieldsAfterFulfilmentChange(emptyPreorderFields(), "dine_in");
assert.equal(fromPickup.fulfilmentMethod, "dine_in");
assert.equal(fromPickup.recipientName, "");
assert.equal(fromPickup.addressLine1, "");

const fromDineIn = fieldsAfterFulfilmentChange(
  {
    ...fromPickup,
    guestCount: "4",
    dineInVenue: "hyphen",
    reservationNote: "window",
    addressLine1: "should not keep",
  },
  "delivery",
);
assert.equal(fromDineIn.fulfilmentMethod, "delivery");
assert.equal(fromDineIn.guestCount, "");
assert.equal(fromDineIn.dineInVenue, "");
assert.equal(fromDineIn.reservationNote, "");
assert.equal(fromDineIn.addressLine1, "should not keep");

const backToPickup = fieldsAfterFulfilmentChange(
  {
    ...fromDineIn,
    recipientName: "A",
    addressLine1: "12 Jalan",
  },
  "pickup",
);
assert.equal(backToPickup.fulfilmentMethod, "pickup");
assert.equal(backToPickup.recipientName, "");
assert.equal(backToPickup.addressLine1, "");

const mon = "2026-08-10";
const wed = "2026-08-12";
const fri = "2026-08-14";
assert.equal(isValidDineInSlot(mon, "12:00"), true);
assert.equal(isValidDineInSlot(mon, "17:00"), true);
assert.equal(isValidDineInSlot(mon, "17:30"), false);
assert.equal(isValidDineInSlot(mon, "11:30"), false);
assert.equal(isValidDineInSlot(wed, "12:00"), false);
assert.equal(resolveDineInSchedule(wed, undefined).status, "closed");
const wedPh = resolveDineInSchedule(
  wed,
  copyWeeklyDayToDate(OPERATING_HOURS_SEED, wed, 1, [
    "dine_in",
    "hyphen",
    "whitebird",
    "pickup",
  ]),
);
assert.equal(wedPh.status, "open");
if (wedPh.status === "open") {
  assert.equal(wedPh.latest, "17:00");
}
assert.equal(isValidDeliverySlot(mon, "12:00"), true);
assert.equal(isValidDeliverySlot(mon, "15:00"), true);
assert.equal(isValidDeliverySlot(mon, "15:30"), false);
assert.equal(isValidDeliverySlot(wed, "12:00"), false);
assert.equal(getDeliverySchedule(wed).status, "closed");
assert.equal(isValidDineInSlot(fri, "21:30"), true);
assert.equal(isValidDineInSlot(fri, "22:00"), false);
assert.equal(isValidDeliverySlot(fri, "15:00"), true);
assert.equal(isValidDeliverySlot(fri, "15:30"), false);

assert.equal(customerPickupAvailability(mon, []).available, true);
assert.equal(customerDineInAvailability(wed, []).available, false);
assert.equal(customerDineInAvailability(wed, []).reason, "Unavailable Wednesday");
assert.equal(customerDeliveryAvailability(wed, []).available, false);
assert.equal(customerDeliveryAvailability(wed, []).reason, "No delivery Wednesday");
assert.equal(customerDineInAvailability(mon, []).available, true);
assert.equal(customerDeliveryAvailability(mon, []).available, true);

assert.equal(
  isActiveOnCollectionBoard({
    customerId: null,
    pickupDate: mon,
    selectedPickupDate: mon,
    status: "paid",
    fulfilmentMethod: "dine_in",
    readyAt: "2026-08-10T04:00:00Z",
    pickedUpAt: null,
  }),
  false,
);
assert.equal(bakeryFulfilmentCue("dine_in"), "Dine-in");
assert.equal(operationalSectionTitle("dine_in"), "Dine-in");
assert.equal(isPickupCrewMessageAvailable("dine_in"), false);
assert.equal(isPickupCrewMessageAvailable("pickup"), true);

console.log("PASS whole-cake customer fulfilment");
