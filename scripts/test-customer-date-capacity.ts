/**
 * Phase 5.5 — customer Fully Booked date-picker availability (static).
 * Run: npx tsx scripts/test-customer-date-capacity.ts
 *
 * Does not mutate production capacity, orders, or closures.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CUSTOMER_DATE_CAPACITY_SEARCH_DAYS,
  GUEST_PREORDER_CAPACITY_ORDER_STATUSES,
  evaluateGuestCartDateCapacity,
  guestPreorderItemFullyBooked,
  payloadQuantityForCakeSize,
  selectMostSpecificGuestCapacityRow,
  usedQuantityForGuestCapacityRow,
} from "@/engines/preorder/capacity";
import {
  PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES,
} from "@/engines/orders/production-capacity";
import type { PreorderCartLine } from "@/engines/preorder/types";
import {
  SELECTED_DATE_NO_LONGER_AVAILABLE_MESSAGE,
  customerFullyBookedDateMessage,
  customerSelectedDateInvalidatedMessage,
  evaluateCollectionDate,
  findNextValidCollectionDate,
} from "@/engines/preorder/validate";
import { preorderCartLineId } from "@/engines/preorder/lead";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.equal(CUSTOMER_DATE_CAPACITY_SEARCH_DAYS, 14);
assert.deepEqual(
  [...GUEST_PREORDER_CAPACITY_ORDER_STATUSES],
  ["submitted", "pending_confirmation", "awaiting_payment", "paid"],
);
assert.notDeepEqual(
  [...GUEST_PREORDER_CAPACITY_ORDER_STATUSES],
  [...PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES],
);

const pickupDate = "2026-09-10";
const cakeA = "cake-a";
const cakeB = "cake-b";
const sizeM = "size-m";
const sizeL = "size-l";

const cakeWide = {
  pickupDate,
  cakeId: cakeA,
  sizeId: null,
  collectionId: null,
  capacityQuantity: 10,
  waitingListEnabled: false,
};
const sizeMRow = {
  ...cakeWide,
  sizeId: sizeM,
  capacityQuantity: 4,
};

function used(status: string, qty: number, extra?: Partial<{
  cakeId: string;
  sizeId: string | null;
  pickupDate: string;
}>) {
  return {
    pickupDate: extra?.pickupDate ?? pickupDate,
    cakeId: extra?.cakeId ?? cakeA,
    sizeId: extra?.sizeId ?? sizeM,
    collectionId: null as string | null,
    quantity: qty,
    status,
  };
}

function cartLine(
  cakeId: string,
  sizeId: string,
  name: string,
  quantity: number,
) {
  return { cakeId, cakeSizeId: sizeId, cakeName: name, quantity };
}

function preorderLine(input: {
  cakeId: string;
  sizeId: string;
  name: string;
  size: string;
  quantity?: number;
  days?: number;
}): PreorderCartLine {
  return {
    lineId: preorderCartLineId(input.cakeId, input.sizeId),
    cakeId: input.cakeId,
    cakeSizeId: input.sizeId,
    cakeName: input.name,
    sizeLabel: input.size,
    quantity: input.quantity ?? 1,
    preorderDays: input.days ?? 2,
  };
}

const pandan = preorderLine({
  cakeId: cakeA,
  sizeId: sizeM,
  name: "Pandan Cake",
  size: "6-inch",
});
const chocolate = preorderLine({
  cakeId: cakeB,
  sizeId: sizeL,
  name: "Chocolate Cake",
  size: "8-inch",
});

// 1. No capacity row -> date remains available
assert.equal(
  guestPreorderItemFullyBooked({
    pickupDate,
    collectionId: null,
    cakeId: cakeA,
    sizeId: sizeM,
    quantity: 2,
    rows: [],
    used: [used("paid", 50)],
  }),
  false,
);

// 2. Capacity below committed (used 6, cap 10, qty 1) -> available
assert.equal(
  guestPreorderItemFullyBooked({
    pickupDate,
    collectionId: null,
    cakeId: cakeA,
    sizeId: sizeM,
    quantity: 1,
    rows: [cakeWide],
    used: [used("paid", 6)],
  }),
  false,
);

// 3. Capacity exactly equal -> Fully Booked for a new cart item
assert.equal(
  guestPreorderItemFullyBooked({
    pickupDate,
    collectionId: null,
    cakeId: cakeA,
    sizeId: sizeM,
    quantity: 1,
    rows: [cakeWide],
    used: [used("paid", 10)],
  }),
  true,
);

// 4. Capacity exceeded -> Fully Booked
assert.equal(
  guestPreorderItemFullyBooked({
    pickupDate,
    collectionId: null,
    cakeId: cakeA,
    sizeId: sizeM,
    quantity: 1,
    rows: [cakeWide],
    used: [used("paid", 11)],
  }),
  true,
);

// 5. Cake-wide capacity counts all sizes
assert.equal(
  usedQuantityForGuestCapacityRow(
    [used("paid", 2, { sizeId: sizeM }), used("awaiting_payment", 3, { sizeId: sizeL })],
    cakeWide,
  ),
  5,
);

// 6. Size-specific capacity counts only that size
assert.equal(
  usedQuantityForGuestCapacityRow(
    [used("paid", 2, { sizeId: sizeM }), used("paid", 8, { sizeId: sizeL })],
    sizeMRow,
  ),
  2,
);
assert.equal(
  selectMostSpecificGuestCapacityRow([cakeWide, sizeMRow], {
    pickupDate,
    cakeId: cakeA,
    sizeId: sizeM,
    collectionId: null,
  })?.sizeId,
  sizeM,
);
assert.equal(
  selectMostSpecificGuestCapacityRow([cakeWide, sizeMRow], {
    pickupDate,
    cakeId: cakeA,
    sizeId: sizeL,
    collectionId: null,
  })?.sizeId,
  null,
);

// 7–9. Multiple cart items; one unavailable makes the date unavailable
const mixedCart = [
  cartLine(cakeA, sizeM, "Pandan Cake", 1),
  cartLine(cakeB, sizeL, "Chocolate Cake", 1),
];
const bothOpen = evaluateGuestCartDateCapacity({
  pickupDate,
  collectionId: null,
  cart: mixedCart,
  rows: [cakeWide, { ...cakeWide, cakeId: cakeB, capacityQuantity: 10 }],
  used: [used("paid", 1), used("paid", 1, { cakeId: cakeB, sizeId: sizeL })],
});
assert.equal(bothOpen.fullyBooked, false);

const oneBlocked = evaluateGuestCartDateCapacity({
  pickupDate,
  collectionId: null,
  cart: mixedCart,
  rows: [
    { ...cakeWide, capacityQuantity: 0 },
    { ...cakeWide, cakeId: cakeB, capacityQuantity: 10 },
  ],
  used: [],
});
assert.equal(oneBlocked.fullyBooked, true);
assert.deepEqual(oneBlocked.blockingCakeNames, ["Pandan Cake"]);

const bothBlocked = evaluateGuestCartDateCapacity({
  pickupDate,
  collectionId: null,
  cart: mixedCart,
  rows: [
    { ...cakeWide, capacityQuantity: 0 },
    { ...cakeWide, cakeId: cakeB, capacityQuantity: 0 },
  ],
  used: [],
});
assert.equal(bothBlocked.fullyBooked, true);
assert.deepEqual(bothBlocked.blockingCakeNames, ["Pandan Cake", "Chocolate Cake"]);
assert.match(
  customerFullyBookedDateMessage({
    selectedYmd: pickupDate,
    blockingCakeNames: bothBlocked.blockingCakeNames,
  }),
  /Some items in your order are fully booked for 10 Sep/,
);
assert.match(
  customerFullyBookedDateMessage({
    selectedYmd: pickupDate,
    blockingCakeNames: ["Pandan Cake"],
  }),
  /Pandan Cake is fully booked for 10 Sep/,
);

// 10. Closed date
const closed = evaluateCollectionDate({
  selectedYmd: pickupDate,
  businessDate: "2026-09-03",
  lines: [pandan],
  operatingOpen: true,
  closed: true,
  inCatalogue: true,
  capacity: { fullyBooked: true, waitingListEnabled: false },
});
assert.equal(closed.reason.code, "orders_closed");

// 11. Too-early date
const tooEarly = evaluateCollectionDate({
  selectedYmd: "2026-09-04",
  businessDate: "2026-09-03",
  lines: [pandan],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
  capacity: { fullyBooked: true, waitingListEnabled: false },
});
assert.equal(tooEarly.reason.code, "before_preorder");

// 12. Valid date
const valid = evaluateCollectionDate({
  selectedYmd: pickupDate,
  businessDate: "2026-09-03",
  lines: [pandan],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
});
assert.equal(valid.valid, true);

// 13. Removing blocking item makes date valid
const afterRemove = evaluateGuestCartDateCapacity({
  pickupDate,
  collectionId: null,
  cart: [cartLine(cakeB, sizeL, "Chocolate Cake", 1)],
  rows: [
    { ...cakeWide, capacityQuantity: 0 },
    { ...cakeWide, cakeId: cakeB, capacityQuantity: 10 },
  ],
  used: [],
});
assert.equal(afterRemove.fullyBooked, false);

// 14. Changing size changes availability (size M full, size L uses cake-wide)
assert.equal(
  guestPreorderItemFullyBooked({
    pickupDate,
    collectionId: null,
    cakeId: cakeA,
    sizeId: sizeM,
    quantity: 1,
    rows: [cakeWide, sizeMRow],
    used: [used("paid", 4, { sizeId: sizeM })],
  }),
  true,
);
assert.equal(
  guestPreorderItemFullyBooked({
    pickupDate,
    collectionId: null,
    cakeId: cakeA,
    sizeId: sizeL,
    quantity: 1,
    rows: [cakeWide, sizeMRow],
    used: [used("paid", 4, { sizeId: sizeM })],
  }),
  false,
);

// 15. Changing quantity changes availability
assert.equal(
  guestPreorderItemFullyBooked({
    pickupDate,
    collectionId: null,
    cakeId: cakeA,
    sizeId: sizeM,
    quantity: 1,
    rows: [cakeWide],
    used: [used("paid", 9)],
  }),
  false,
);
assert.equal(
  guestPreorderItemFullyBooked({
    pickupDate,
    collectionId: null,
    cakeId: cakeA,
    sizeId: sizeM,
    quantity: 2,
    rows: [cakeWide],
    used: [used("paid", 9)],
  }),
  true,
);
assert.equal(
  payloadQuantityForCakeSize(
    [cartLine(cakeA, sizeM, "Pandan Cake", 1), cartLine(cakeA, sizeM, "Pandan Cake", 1)],
    cakeA,
    sizeM,
  ),
  2,
);

// 16–17. Selected date becomes invalid; source does not auto-move it
const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(formSrc, /selectedDateInvalidated/);
assert.match(formSrc, /customerSelectedDateInvalidatedMessage/);
assert.doesNotMatch(formSrc, /pickupDate = cartPickupBounds\.min/);
const updateItemSrc = formSrc.slice(
  formSrc.indexOf("function updateItem"),
  formSrc.indexOf("function changeSize"),
);
const removeItemSrc = formSrc.slice(
  formSrc.indexOf("function removeItem"),
  formSrc.indexOf("function addOfferedCake"),
);
assert.doesNotMatch(updateItemSrc, /pickupDate/);
assert.doesNotMatch(removeItemSrc, /pickupDate/);

// 18. Earliest valid date calculation when possible
const next = findNextValidCollectionDate({
  fromYmdExclusive: "2026-09-10",
  businessDate: "2026-09-03",
  lines: [pandan, chocolate],
  closedDates: ["2026-09-11"],
  operatingOpen: () => true,
  capacityForDate: (ymd) =>
    ymd === "2026-09-10"
      ? { fullyBooked: true, waitingListEnabled: false }
      : null,
  maxYmd: "2026-09-30",
});
assert.equal(next, "2026-09-12");
assert.match(
  customerFullyBookedDateMessage({
    selectedYmd: "2026-09-10",
    blockingCakeNames: ["Pandan Cake"],
    nextAvailableYmd: "2026-09-12",
  }),
  /Next available: 12 Sep/,
);

// 19. No valid date found within search bound
const none = findNextValidCollectionDate({
  fromYmdExclusive: "2026-09-10",
  businessDate: "2026-09-03",
  lines: [pandan],
  closedDates: [],
  operatingOpen: () => true,
  capacityForDate: () => ({ fullyBooked: true, waitingListEnabled: false }),
  searchDays: 3,
});
assert.equal(none, null);

// submitted / pending_confirmation inflate customer occupancy (submit-time)
assert.equal(
  usedQuantityForGuestCapacityRow(
    [used("submitted", 4), used("pending_confirmation", 2)],
    cakeWide,
  ),
  6,
);
assert.equal(
  usedQuantityForGuestCapacityRow([used("cancelled", 9), used("completed", 8)], cakeWide),
  0,
);
assert.equal(
  usedQuantityForGuestCapacityRow([used("confirmed", 5)], cakeWide),
  0,
);

assert.equal(
  customerSelectedDateInvalidatedMessage("Fully Booked for your current order."),
  `${SELECTED_DATE_NO_LONGER_AVAILABLE_MESSAGE} Fully Booked for your current order.`,
);

const slotSrc = readSrc("src/components/ui/PickupSlotFields.tsx");
assert.match(slotSrc, /unavailableDates/);
assert.match(slotSrc, /Fully Booked for your current order/);
assert.doesNotMatch(slotSrc, /Join Waiting List/);

const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
assert.match(actionsSrc, /submit_guest_preorder/);
assert.match(actionsSrc, /loadCustomerCartDateCapacity/);
assert.match(actionsSrc, /fully booked/i);
assert.match(actionsSrc, /customerSelectedDateInvalidatedMessage/);

const querySrc = readSrc(
  "src/workspaces/storefront/checkout/capacity-availability.ts",
);
assert.match(querySrc, /GUEST_PREORDER_CAPACITY_ORDER_STATUSES/);
assert.doesNotMatch(querySrc, /capacity_quantity:/);
assert.doesNotMatch(querySrc, /committedQuantity/);
assert.doesNotMatch(querySrc, /production_capacity_holds/);
assert.match(querySrc, /waiting_list_enabled/);
assert.match(querySrc, /waitingListDates/);
assert.match(
  querySrc,
  /Customer payload never includes/,
);

const snapshotType = querySrc.slice(
  querySrc.indexOf("type CustomerCartDateCapacitySnapshot"),
  querySrc.indexOf("function isMissingRelation"),
);
assert.match(snapshotType, /fullyBookedDates: string\[\]/);
assert.match(snapshotType, /blockingCakeNamesByDate/);
assert.doesNotMatch(snapshotType, /capacityQuantity/);
assert.doesNotMatch(snapshotType, /usedQuantity/);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const extraActionsSrc = readSrc(
  "src/workspaces/storefront/extra/actions.ts",
);
assert.doesNotMatch(extraFormSrc, /loadCartDateCapacityAvailability/);
assert.doesNotMatch(extraFormSrc, /engines\/preorder\/capacity/);
assert.doesNotMatch(extraActionsSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraActionsSrc, /_guest_preorder_item_fully_booked/);

const typesSrc = readSrc("src/types/storefront.ts");
assert.doesNotMatch(typesSrc, /capacity_quantity/);
assert.doesNotMatch(typesSrc, /committedQuantity/);
assert.doesNotMatch(typesSrc, /fullyBookedDates/);

assert.doesNotMatch(formSrc, /capacity_quantity/);
assert.doesNotMatch(formSrc, /committedQuantity/);
assert.match(formSrc, /Join Waiting List/);
assert.match(formSrc, /unavailableDates=\{fullyBookedWithoutWaitingList\}/);

const bakeryOverviewSrc = readSrc(
  "src/workspaces/library/order-availability/overview/AvailabilityOverviewPanel.tsx",
);
assert.match(bakeryOverviewSrc, /Availability overview/);

const capacityActionsSrc = readSrc(
  "src/workspaces/library/order-availability/capacity/actions.ts",
);
assert.match(capacityActionsSrc, /set_production_capacity/);
assert.doesNotMatch(capacityActionsSrc, /loadCustomerCartDateCapacity/);

const closureActionsSrc = readSrc(
  "src/workspaces/library/order-availability/actions.ts",
);
assert.match(closureActionsSrc, /order_availability_overrides/);
assert.doesNotMatch(closureActionsSrc, /loadCustomerCartDateCapacity/);

const phase3Sql = readSrc(
  "supabase/migrations/20260902230000_phase3_preorder_date_engine.sql",
);
assert.match(phase3Sql, /_guest_preorder_item_fully_booked/);
assert.match(phase3Sql, /Fully Booked/);

console.log("PASS customer date capacity");
