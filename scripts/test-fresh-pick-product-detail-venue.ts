/**
 * Fresh Pick product-detail venue selection and cart persistence.
 * Run: npx tsx scripts/test-fresh-pick-product-detail-venue.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  availableDineInVenues,
  dineInVenueLabel,
} from "@/engines/business-calendar/dine-in-hours";
import {
  freshPicksDineInSlotsForVenue,
  freshPicksDineInVenuesForSlots,
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
const context = {
  window,
  now,
  snapshot: OPERATING_HOURS_SEED,
};
const dineIn = freshPicksMethodAvailability("dine_in", date, context);
assert.equal(dineIn.available, true);

const venueChoices = freshPicksDineInVenuesForSlots(
  date,
  dineIn.slots,
  OPERATING_HOURS_SEED,
);
assert.ok(venueChoices.length > 0, "available venues come from shared hours");
const slotWithMultipleVenues = dineIn.slots.find(
  (slot) => availableDineInVenues(date, slot.value).length > 1,
);
assert.ok(slotWithMultipleVenues, "fixture has a time with both venues available");
const slotVenues = availableDineInVenues(date, slotWithMultipleVenues.value);
const selectedVenue = slotVenues[0]!;
const selectedVenueSlots = freshPicksDineInSlotsForVenue(
  date,
  dineIn.slots,
  selectedVenue,
  OPERATING_HOURS_SEED,
);
assert.ok(
  selectedVenueSlots.some((slot) => slot.value === slotWithMultipleVenues.value),
  "selected venue retains only times offered by that venue",
);
assert.equal(dineInVenueLabel(selectedVenue), "Hyphen");

const input = {
  extraStockId: "synthetic-detail-extra-1",
  cakeId: "synthetic-cake-1",
  cakeSizeId: "synthetic-size-1",
  cakeName: "Synthetic Fresh Pick",
  sizeLabel: '6"',
  unitPrice: 90,
  imageUrl: null,
  pickupDate: date,
  pickupTime: slotWithMultipleVenues.value,
  fulfilmentMethod: "dine_in" as const,
  dineInVenue: selectedVenue,
  pickupAvailableFromAt: window.pickupAvailableFromAt,
  orderCutoffAt: window.orderCutoffAt,
  readyForCollection: false,
};
const added = addFreshPickToCart(
  null,
  input,
  now,
  { snapshot: OPERATING_HOURS_SEED },
);
assert.equal(added.ok, true, "valid venue and time can be added");
assert.equal(added.ok && added.cart.dineInVenue, selectedVenue);

const missingVenue = addFreshPickToCart(
  null,
  { ...input, extraStockId: "synthetic-detail-extra-no-venue", dineInVenue: "" },
  now,
  { snapshot: OPERATING_HOURS_SEED },
);
assert.equal(missingVenue.ok, false, "dine-in cannot be added without a venue");

const unavailableVenue = addFreshPickToCart(
  null,
  { ...input, extraStockId: "synthetic-detail-extra-invalid-venue", dineInVenue: "not-a-venue" },
  now,
  { snapshot: OPERATING_HOURS_SEED },
);
assert.equal(unavailableVenue.ok, false, "invalid venue is rejected");

if (!added.ok) throw new Error("expected valid synthetic cart add");
const secondVenue = slotVenues.find((venue) => venue !== selectedVenue);
assert.ok(secondVenue);
const conflictingVenue = addFreshPickToCart(
  added.cart,
  {
    ...input,
    extraStockId: "synthetic-detail-extra-2",
    dineInVenue: secondVenue,
  },
  now,
  { snapshot: OPERATING_HOURS_SEED },
);
assert.equal(conflictingVenue.ok, false, "cart venue conflicts are explicit");

const roundTrip = parseFreshPickCart({
  ...added.cart,
  dineInVenue: selectedVenue,
});
assert.equal(roundTrip?.dineInVenue, selectedVenue, "venue survives cart hydration");
assert.equal(roundTrip?.pickupTime, slotWithMultipleVenues.value);
assert.equal(emptyFreshPickCart().dineInVenue, "");

const deliveryNow = new Date(`${date}T13:40:00+08:00`);
const deliveryAvailability = freshPicksMethodAvailability(
  "delivery",
  date,
  { ...context, now: deliveryNow, window },
);
assert.ok(deliveryAvailability.slots.length > 0);
const deliveryCart = addFreshPickToCart(
  null,
  {
    ...input,
    extraStockId: "synthetic-detail-delivery-extra",
    pickupDate: date,
    pickupTime: deliveryAvailability.slots[0]!.value,
    fulfilmentMethod: "delivery",
    dineInVenue: "",
  },
  deliveryNow,
  { snapshot: OPERATING_HOURS_SEED },
);
assert.equal(deliveryCart.ok, true, "Delivery does not require a Dine-in venue");
assert.equal(deliveryCart.ok && deliveryCart.cart.dineInVenue, "");

const pageSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
const detailFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const cartSrc = readSrc("src/workspaces/storefront/extra/fresh-pick-cart.ts");
const checkoutSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const formControlsSrc = readSrc("src/components/ui/form/FormControls.tsx");
const actionSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
const receiptSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
const collectionSelectSrc = readSrc("src/workspaces/collection/select.ts");
const ownerOrderQueriesSrc = readSrc("src/workspaces/owner/orders/queries.ts");

assert.match(pageSrc, /<GuestExtraOrderForm/);
assert.match(detailFormSrc, /id="dine_in_venue"[\s\S]*name="dine_in_venue"/);
assert.match(detailFormSrc, /required[\s\S]*value=\{resolvedDineInVenue\}/);
assert.match(detailFormSrc, /freshPicksDineInVenuesForSlots/);
assert.match(detailFormSrc, /freshPicksDineInSlotsForVenue/);
assert.match(
  detailFormSrc,
  /currentVenue && venues\.includes\(currentVenue\) \? currentVenue : ""/,
  "date or method changes clear a venue that is no longer available",
);
assert.match(
  detailFormSrc,
  /venueSlots\.some\(\(slot\) => slot\.value === currentTime\)[\s\S]*?currentTime\s*:\s*""/,
  "a venue change clears a time not served at that venue",
);
assert.match(
  detailFormSrc,
  /dineInVenue: resolvedMethod === "dine_in" \? resolvedDineInVenue : ""/,
);
assert.match(cartSrc, /availableDineInVenues\([\s\S]*\)\.includes\(dineInVenue\)/);
assert.match(cartSrc, /dineInVenue:[\s\S]*?dineInVenue \?\? ""/);
assert.match(checkoutSrc, /dineInVenue: resolvedVenue \|\| dineInVenue/);
assert.match(actionSrc, /p_dine_in/);
assert.match(receiptSrc, /dineInVenue: fulfilmentMethod === "dine_in" \? dineInVenue : null/);
assert.match(collectionSelectSrc, /order_dine_in_reservations/);
assert.match(ownerOrderQueriesSrc, /order_dine_in_reservations/);

const venueSelectIndex = detailFormSrc.indexOf('id="dine_in_venue"');
const timeSelectIndex = detailFormSrc.indexOf('id="pickup_time"');
const addButtonIndex = detailFormSrc.indexOf("<FormSubmitButton");
assert.ok(venueSelectIndex >= 0 && venueSelectIndex < timeSelectIndex);
assert.ok(timeSelectIndex < addButtonIndex, "venue and time controls precede Add to Cart");
assert.match(detailFormSrc, /className="flex flex-col gap-1\.5"/);
assert.match(formControlsSrc, /h-12 w-full/);

console.log("PASS Fresh Pick product-detail venue selection and cart persistence");
