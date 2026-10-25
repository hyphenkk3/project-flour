/**
 * Fresh Pick Dine-in contract: reservation, cake serving, venue cards and cart persistence.
 * Run: npx tsx scripts/test-fresh-pick-product-detail-venue.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  availableDineInVenues,
  cakeServingSlotsForReservation,
  dineInVenueLabel,
  isCakeServingWithinReservationWindow,
  venuesForReservationAndServing,
} from "@/engines/business-calendar/dine-in-hours";
import {
  freshPicksDineInReservationSlots,
  freshPicksDineInServingSlotsForReservation,
  freshPicksDineInVenuesForPair,
  freshPicksMethodAvailability,
} from "@/engines/extra/fresh-picks-fulfilment";
import { extraPickupThroughIso } from "@/engines/extra/fresh-picks-time";
import {
  addFreshPickToCart,
  emptyFreshPickCart,
  parseFreshPickCart,
} from "@/workspaces/storefront/extra/fresh-pick-cart";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const date = "2026-08-20"; // Thursday in the shared operating-hours seed.
const now = new Date(`${date}T15:00:00+08:00`);
const window = {
  pickupAvailableFromAt: extraPickupThroughIso(date, "12:00")!,
  orderCutoffAt: extraPickupThroughIso(date, "21:00")!,
};
const context = { window, now, snapshot: OPERATING_HOURS_SEED };
const dineIn = freshPicksMethodAvailability("dine_in", date, context);
assert.equal(dineIn.available, true);

const reservationSlots = freshPicksDineInReservationSlots(
  date,
  dineIn.slots,
  OPERATING_HOURS_SEED,
);
assert.ok(reservationSlots.length > 0, "reservation choices derive from shared hours and stock window");
const pair = reservationSlots.flatMap((reservation) => {
  const servings = freshPicksDineInServingSlotsForReservation(
    date,
    reservation.value,
    dineIn.slots,
    OPERATING_HOURS_SEED,
  );
  return servings
    .map((serving) => ({
      reservation,
      serving,
      venues: freshPicksDineInVenuesForPair(
        date,
        reservation.value,
        serving.value,
        OPERATING_HOURS_SEED,
      ),
    }))
    .filter((candidate) => candidate.venues.length > 0);
})[0];
assert.ok(pair, "a valid reservation/serving pair has a venue");
assert.ok(
  isCakeServingWithinReservationWindow(pair.reservation.value, pair.serving.value),
  "Fresh Pick cake serving follows the regular within-one-hour rule",
);
assert.deepEqual(
  pair.venues,
  venuesForReservationAndServing(
    date,
    pair.reservation.value,
    pair.serving.value,
    OPERATING_HOURS_SEED,
  ),
  "venue availability is the regular shared date/reservation/serving rule",
);
const selectedVenue = pair.venues[0]!;
assert.ok(availableDineInVenues(date, pair.reservation.value).includes(selectedVenue));
assert.equal(dineInVenueLabel(selectedVenue), selectedVenue === "hyphen" ? "Hyphen" : "Whitebird");
const regularServingSlots = cakeServingSlotsForReservation(
  date,
  pair.reservation.value,
  OPERATING_HOURS_SEED,
);
const stockEligibleServingTimes = new Set(dineIn.slots.map((slot) => slot.value));
assert.deepEqual(
  freshPicksDineInServingSlotsForReservation(
    date,
    pair.reservation.value,
    dineIn.slots,
    OPERATING_HOURS_SEED,
  ).map((slot) => slot.value),
  regularServingSlots
    .filter((slot) => stockEligibleServingTimes.has(slot.value))
    .map((slot) => slot.value),
  "Fresh Pick matches regular serving rules intersected only with stock-eligible times",
);

const input = {
  extraStockId: "synthetic-detail-extra-1",
  cakeId: "synthetic-cake-1",
  cakeSizeId: "synthetic-size-1",
  cakeName: "Synthetic Fresh Pick",
  sizeLabel: '6"',
  unitPrice: 90,
  imageUrl: null,
  pickupDate: date,
  pickupTime: pair.serving.value,
  reservationTime: pair.reservation.value,
  fulfilmentMethod: "dine_in" as const,
  dineInVenue: selectedVenue,
  pickupAvailableFromAt: window.pickupAvailableFromAt,
  orderCutoffAt: window.orderCutoffAt,
  readyForCollection: false,
};
const added = addFreshPickToCart(null, input, now, {
  snapshot: OPERATING_HOURS_SEED,
});
assert.equal(added.ok, true, "valid Dine-in pair can be added");
if (!added.ok) throw new Error("expected valid synthetic cart add");
assert.equal(added.cart.dineInVenue, selectedVenue);
assert.equal(added.cart.reservationTime, pair.reservation.value);
assert.equal(added.cart.pickupTime, pair.serving.value, "pickup_time retains cake-serving meaning");

assert.equal(
  addFreshPickToCart(
    null,
    { ...input, extraStockId: "synthetic-missing-venue", dineInVenue: "" },
    now,
    { snapshot: OPERATING_HOURS_SEED },
  ).ok,
  false,
  "Dine-in cannot be added without an explicit venue",
);
assert.equal(
  addFreshPickToCart(
    null,
    { ...input, extraStockId: "synthetic-invalid-pair", pickupTime: pair.reservation.value, reservationTime: "23:45" },
    now,
    { snapshot: OPERATING_HOURS_SEED },
  ).ok,
  false,
  "invalid or out-of-window reservation/serving pairs are rejected",
);

const roundTrip = parseFreshPickCart(added.cart);
assert.equal(roundTrip?.dineInVenue, selectedVenue);
assert.equal(roundTrip?.reservationTime, pair.reservation.value);
assert.equal(roundTrip?.pickupTime, pair.serving.value);
assert.equal(emptyFreshPickCart().reservationTime, "");

const pageSrc = readSrc("src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx");
const detailSrc = readSrc("src/workspaces/storefront/extra/GuestExtraOrderForm.tsx");
const checkoutSrc = readSrc("src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx");
const actionSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
const cartSrc = readSrc("src/workspaces/storefront/extra/fresh-pick-cart.ts");
const regularSrc = readSrc("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
const venueFieldsSrc = readSrc("src/components/ui/DineInVenuePartyFields.tsx");
const cartShellSrc = readSrc("src/workspaces/storefront/extra/FreshPickCartShell.tsx");
const receiptSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
const staffSelectSrc = readSrc("src/workspaces/collection/select.ts");
const ownerQueriesSrc = readSrc("src/workspaces/owner/orders/queries.ts");

assert.match(regularSrc, /timeName="reservation_time"/);
assert.match(regularSrc, /timeLabel="Cake serving time"/);
assert.match(regularSrc, /<DineInVenuePartyFields/);
assert.match(detailSrc, /timeLabel="Dine-in reservation time"/);
assert.match(detailSrc, /timeLabel="Cake serving time"/);
assert.match(detailSrc, /<DineInVenuePartyFields[\s\S]*?photos=\{venuePhotos\}/);
assert.match(pageSrc, /loadDineInVenuePhotos/);
assert.match(pageSrc, /venuePhotos=\{venuePhotos\}/);
assert.match(venueFieldsSrc, /DINE_IN_VENUE_CUSTOMER_COPY/);
assert.match(venueFieldsSrc, /DINE_IN_VENUE_PHOTO_SRC/);
assert.match(detailSrc, /freshPicksDineInReservationSlots/);
assert.match(detailSrc, /freshPicksDineInServingSlotsForReservation/);
assert.match(detailSrc, /freshPicksDineInVenuesForPair/);
assert.doesNotMatch(detailSrc, /dineInVenueLabel|Choose a venue/);

const reservationIndex = detailSrc.indexOf('timeLabel="Dine-in reservation time"');
const servingIndex = detailSrc.indexOf('timeLabel="Cake serving time"');
const cardsIndex = detailSrc.indexOf("<DineInVenuePartyFields\n");
const addButtonIndex = detailSrc.indexOf("<FormSubmitButton");
assert.ok(reservationIndex >= 0 && reservationIndex < servingIndex);
assert.ok(servingIndex < cardsIndex && cardsIndex < addButtonIndex,
  "reservation, cake serving, photo cards, then Add to Cart");
assert.match(detailSrc, /!reservationTime[\s\S]*!timeStillValid[\s\S]*!resolvedDineInVenue[\s\S]*!validParty\.ok/);
assert.match(detailSrc, /reservationTime: resolvedMethod === "dine_in" \? reservationTime : ""/);
assert.match(cartSrc, /reservationTime\?: string/);
assert.match(cartSrc, /reservationTime,[\s\S]*servingTime: input\.pickupTime/);
assert.match(checkoutSrc, /name="reservation_time"[\s\S]*value=\{resolvedMethod === "dine_in" \? reservationTime : ""\}/);
assert.match(checkoutSrc, /timeName="reservation_time"/);
assert.match(checkoutSrc, /timeName="pickup_time"/);
assert.match(checkoutSrc, /Cake served \$\{formatPickupTime/);
assert.match(checkoutSrc, /reservationTime:\s*resolvedMethod === "dine_in" \? reservationTime : ""/);
assert.match(actionSrc, /formData\.get\("reservation_time"\)/);
assert.match(actionSrc, /isValidDineInReservationPair/);
assert.match(actionSrc, /reservationTime,[\s\S]*reservationNote:/);
assert.match(actionSrc, /p_pickup_time: pickupTime/);
assert.match(receiptSrc, /reservation_time/);
assert.match(receiptSrc, /pickupTime: String\(order\.pickup_time\)/);
assert.match(cartShellSrc, /Reservation · \{formatPickupTime\(cart\.reservationTime\)\}/);
assert.match(cartShellSrc, /Cake served · \{formatPickupTime\(cart\.pickupTime\)\}/);
assert.match(staffSelectSrc, /order_dine_in_reservations/);
assert.match(ownerQueriesSrc, /order_dine_in_reservations/);

console.log("PASS Fresh Pick Dine-in sequence, shared venue availability, and separate reservation/serving persistence");
