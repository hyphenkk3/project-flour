/**
 * Phase 3 preorder / date engine.
 * Run: npx tsx scripts/test-preorder-date-engine.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { malaysiaPreorderBusinessDate } from "@/engines/preorder/business-date";
import {
  DEFAULT_CUSTOMER_PREORDER_DAYS,
  cartEarliestCollectionDate,
  earliestCollectionDateForDays,
  emptyCartEarliestCollectionDate,
  preorderCartLineId,
  readPreorderDays,
} from "@/engines/preorder/lead";
import type { PreorderCartLine } from "@/engines/preorder/types";
import {
  FULLY_BOOKED_CUSTOMER_LABEL,
  JOIN_WAITING_LIST_CUSTOMER_LABEL,
  customerCollectionDateMessage,
  evaluateCollectionDate,
} from "@/engines/preorder/validate";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function line(input: {
  cakeId: string;
  sizeId: string;
  name: string;
  size: string;
  days: number;
}): PreorderCartLine {
  return {
    lineId: preorderCartLineId(input.cakeId, input.sizeId),
    cakeId: input.cakeId,
    cakeSizeId: input.sizeId,
    cakeName: input.name,
    sizeLabel: input.size,
    quantity: 1,
    preorderDays: input.days,
  };
}

assert.equal(DEFAULT_CUSTOMER_PREORDER_DAYS, 2);
assert.equal(FULLY_BOOKED_CUSTOMER_LABEL, "Fully Booked");
assert.equal(JOIN_WAITING_LIST_CUSTOMER_LABEL, "Join Waiting List");

const myt27_235959 = new Date("2026-08-27T15:59:59.000Z");
const myt28_000000 = new Date("2026-08-27T16:00:00.000Z");
assert.equal(malaysiaPreorderBusinessDate(myt27_235959), "2026-08-27");
assert.equal(malaysiaPreorderBusinessDate(myt28_000000), "2026-08-28");

const day0_27 = malaysiaPreorderBusinessDate(myt27_235959);
const day0_28 = malaysiaPreorderBusinessDate(myt28_000000);
assert.equal(earliestCollectionDateForDays(day0_27, 1), "2026-08-28");
assert.equal(earliestCollectionDateForDays(day0_27, 2), "2026-08-29");
assert.equal(earliestCollectionDateForDays(day0_27, 3), "2026-08-30");
assert.equal(earliestCollectionDateForDays(day0_28, 1), "2026-08-29");
assert.equal(earliestCollectionDateForDays(day0_28, 2), "2026-08-30");
assert.equal(earliestCollectionDateForDays(day0_28, 3), "2026-08-31");

assert.equal(emptyCartEarliestCollectionDate(myt28_000000), "2026-08-30");
assert.equal(earliestPickupDateYmd(myt28_000000), "2026-08-30");
assert.equal(
  earliestPickupDateYmd(myt28_000000),
  emptyCartEarliestCollectionDate(myt28_000000),
  "compatibility wrapper is empty-cart engine floor",
);

const cakeA = line({
  cakeId: "a",
  sizeId: "a6",
  name: "Matcha Caramel Miso Cake",
  size: "6-inch",
  days: 2,
});
const cakeB = line({
  cakeId: "b",
  sizeId: "b6",
  name: "Chocolate Cake",
  size: "6-inch",
  days: 3,
});

const mixed = cartEarliestCollectionDate([cakeA, cakeB], day0_28);
assert.equal(mixed.earliestYmd, "2026-08-31");
assert.deepEqual(mixed.blockingLineIds, [cakeB.lineId]);

const tooSoon = evaluateCollectionDate({
  selectedYmd: "2026-08-30",
  businessDate: day0_28,
  lines: [cakeA, cakeB],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
});
assert.equal(tooSoon.valid, false);
assert.equal(tooSoon.reason.code, "before_preorder");
assert.equal(tooSoon.earliestYmd, "2026-08-31");
assert.deepEqual(tooSoon.blockingLineIds, [cakeB.lineId]);
assert.match(
  customerCollectionDateMessage(tooSoon, [cakeA, cakeB]) ?? "",
  /Chocolate Cake \(6-inch\).*31\/8/,
);

const afterRemoveB = evaluateCollectionDate({
  selectedYmd: "2026-08-30",
  businessDate: day0_28,
  lines: [cakeA],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
});
assert.equal(afterRemoveB.valid, true);
assert.equal(afterRemoveB.earliestYmd, "2026-08-30");

const closed = evaluateCollectionDate({
  selectedYmd: "2026-08-31",
  businessDate: day0_28,
  lines: [cakeA, cakeB],
  operatingOpen: true,
  closed: true,
  inCatalogue: true,
});
assert.equal(closed.valid, false);
assert.equal(closed.reason.code, "orders_closed");

const operating = evaluateCollectionDate({
  selectedYmd: "2026-08-31",
  businessDate: day0_28,
  lines: [cakeA, cakeB],
  operatingOpen: false,
  closed: true,
  inCatalogue: true,
});
assert.equal(operating.valid, false);
assert.equal(
  operating.reason.code,
  "operating_closed",
  "operating is evaluated before closure",
);

const catalogue = evaluateCollectionDate({
  selectedYmd: "2026-08-31",
  businessDate: day0_28,
  lines: [cakeA, cakeB],
  operatingOpen: true,
  closed: false,
  inCatalogue: false,
});
assert.equal(catalogue.valid, false);
assert.equal(catalogue.reason.code, "not_in_catalogue");

const preorderBeatsCapacity = evaluateCollectionDate({
  selectedYmd: "2026-08-30",
  businessDate: day0_28,
  lines: [cakeA, cakeB],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
  capacity: { fullyBooked: true, waitingListEnabled: true },
});
assert.equal(preorderBeatsCapacity.reason.code, "before_preorder");

const capacityFull = evaluateCollectionDate({
  selectedYmd: "2026-08-31",
  businessDate: day0_28,
  lines: [cakeA, cakeB],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
  capacity: { fullyBooked: true, waitingListEnabled: false },
});
assert.equal(capacityFull.valid, false);
assert.equal(capacityFull.reason.code, "fully_booked");
assert.equal(
  customerCollectionDateMessage(capacityFull, [cakeA, cakeB]),
  "Fully Booked for your current order.",
);

const waitingList = evaluateCollectionDate({
  selectedYmd: "2026-08-31",
  businessDate: day0_28,
  lines: [cakeA, cakeB],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
  capacity: { fullyBooked: true, waitingListEnabled: true },
});
assert.equal(
  customerCollectionDateMessage(waitingList, [cakeA, cakeB]),
  "Fully Booked for your current order.",
);
assert.doesNotMatch(
  customerCollectionDateMessage(waitingList, [cakeA, cakeB]) ?? "",
  /Join Waiting List/,
);

const noCapacityRow = evaluateCollectionDate({
  selectedYmd: "2026-08-31",
  businessDate: day0_28,
  lines: [cakeA, cakeB],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
});
assert.equal(noCapacityRow.valid, true);
assert.equal(noCapacityRow.reason.code, "ok");

const staleClientDays = evaluateCollectionDate({
  selectedYmd: "2026-08-30",
  businessDate: day0_28,
  lines: [{ ...cakeB, preorderDays: 2 }],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
});
assert.equal(staleClientDays.valid, true, "stale 2-day client value would pass");
const liveServerDays = evaluateCollectionDate({
  selectedYmd: "2026-08-30",
  businessDate: day0_28,
  lines: [{ ...cakeB, preorderDays: readPreorderDays(3) }],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
});
assert.equal(liveServerDays.valid, false);
assert.equal(liveServerDays.reason.code, "before_preorder");

const editedToThreeDay = evaluateCollectionDate({
  selectedYmd: "2026-08-30",
  businessDate: day0_28,
  lines: [{ ...cakeA, preorderDays: 3 }],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
});
assert.equal(editedToThreeDay.valid, false);
assert.equal(editedToThreeDay.earliestYmd, "2026-08-31");

const checkoutSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(checkoutSrc, /evaluateCollectionDate/);
assert.match(checkoutSrc, /customerCollectionDateMessage/);
assert.match(checkoutSrc, /loadCartDateCapacityAvailability/);
assert.match(checkoutSrc, /Join Waiting List/);
assert.match(checkoutSrc, /JoinWaitingListForm/);
assert.doesNotMatch(checkoutSrc, /capacity_quantity/);
assert.doesNotMatch(checkoutSrc, /committedQuantity/);
assert.doesNotMatch(
  checkoutSrc,
  /pickupDate = cartPickupBounds\.min/,
);
assert.doesNotMatch(
  checkoutSrc,
  /CAKE_REMOVED_FOR_DATE_MESSAGE/,
);
assert.match(
  checkoutSrc,
  /!collectionDateEvaluation\.valid/,
);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const extraActionsSrc = readSrc(
  "src/workspaces/storefront/extra/actions.ts",
);
assert.doesNotMatch(extraFormSrc, /engines\/preorder/);
assert.doesNotMatch(extraActionsSrc, /engines\/preorder/);
assert.doesNotMatch(extraActionsSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraFormSrc, /emptyCartEarliestCollectionDate/);
const extraPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
assert.doesNotMatch(extraPageSrc, /StorefrontCartShell/);
assert.doesNotMatch(extraPageSrc, /PreorderInProgressBar/);

const pickupSlotsSrc = readSrc(
  "src/engines/business-calendar/pickup-slots.ts",
);
assert.match(pickupSlotsSrc, /emptyCartEarliestCollectionDate/);
assert.doesNotMatch(pickupSlotsSrc, /Asia\/Singapore/);

const phase3Sql = readSrc(
  "supabase/migrations/20260902230000_phase3_preorder_date_engine.sql",
);
assert.match(phase3Sql, /malaysia_preorder_business_date/);
assert.match(phase3Sql, /earliest_preorder_collection_date/);
assert.match(phase3Sql, /max\(s\.preorder_days\)/);
assert.match(phase3Sql, /Fully Booked/);
assert.doesNotMatch(
  phase3Sql,
  /timezone\('Asia\/Singapore', now\(\)\)::date \+ 2/,
);
assert.match(phase3Sql, /submit_guest_extra_order is unchanged/);

const actionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
assert.match(actionsSrc, /loadLivePreorderDaysBySizeId/);
assert.match(actionsSrc, /loadMalaysiaPreorderBusinessDate/);
assert.match(actionsSrc, /evaluateCollectionDate/);

const librarySizeSrc = readSrc(
  "src/workspaces/library/cakes/CakeSizeFields.tsx",
);
assert.match(librarySizeSrc, /size_preorder_days/);
const libraryActionsSrc = readSrc("src/workspaces/library/cakes/actions.ts");
assert.match(libraryActionsSrc, /preorder_days: size.preorderDays/);
assert.match(libraryActionsSrc, /parsePreorderDays/);

console.log("PASS preorder date engine");
