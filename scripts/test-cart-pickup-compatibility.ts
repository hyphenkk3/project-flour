/**
 * Cart pickup-date compatibility: every selected cake vs its catalogue window.
 * Run: npx tsx scripts/test-cart-pickup-compatibility.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CART_NO_COMMON_PICKUP_DATE_MESSAGE,
  CART_PICKUP_INCOMPATIBLE_REVIEW_MESSAGE,
  cakePickupAvailabilityLabel,
  cakePickupAvailabilityNotesById,
  evaluateCartPickupCompatibility,
} from "@/engines/preorder/cart-pickup-compatibility";
import { customerCollectionDateMessage, evaluateCollectionDate } from "@/engines/preorder/validate";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const earliest = "2026-09-14";
const globalMax = "2026-10-31";
const septOnly = {
  cakeId: "sept-cake",
  monthlyMonths: ["2026-09-01"],
  specialWindows: [],
};
const octOnly = {
  cakeId: "oct-cake",
  monthlyMonths: ["2026-10-01"],
  specialWindows: [],
};
const bothMonths = {
  cakeId: "both-cake",
  monthlyMonths: ["2026-09-01", "2026-10-01"],
  specialWindows: [],
};

const septValid = evaluateCartPickupCompatibility({
  cakes: [septOnly],
  selectedYmd: "2026-09-30",
  earliestYmd: earliest,
  activeSpecialWindows: [],
  globalMax,
});
assert.equal(septValid.hasCommonPickupDate, true);
assert.equal(septValid.cakes[0]?.allowed, true);
assert.equal(septValid.dateLevelMessage, null);

const septInOctober = evaluateCartPickupCompatibility({
  cakes: [septOnly],
  selectedYmd: "2026-10-02",
  earliestYmd: earliest,
  activeSpecialWindows: [],
  globalMax,
});
assert.equal(septInOctober.cakes[0]?.allowed, false);
assert.equal(septInOctober.cakes[0]?.availabilityNote, "Available until 30 Sep 2026");
assert.equal(
  septInOctober.dateLevelMessage,
  "Some cakes in your order are only available until 30 Sep 2026. Please select a pickup date on or before 30 Sep 2026.",
);

const octInSeptember = evaluateCartPickupCompatibility({
  cakes: [octOnly],
  selectedYmd: "2026-09-30",
  earliestYmd: earliest,
  activeSpecialWindows: [],
  globalMax,
});
assert.equal(octInSeptember.cakes[0]?.allowed, false);
assert.equal(octInSeptember.cakes[0]?.availabilityNote, "Available from 1 Oct 2026");
assert.equal(
  octInSeptember.dateLevelMessage,
  "Some cakes in your order are only available from 1 Oct 2026. Please select a pickup date from 1 Oct 2026 onward.",
);

const octValid = evaluateCartPickupCompatibility({
  cakes: [octOnly],
  selectedYmd: "2026-10-02",
  earliestYmd: earliest,
  activeSpecialWindows: [],
  globalMax,
});
assert.equal(octValid.cakes[0]?.allowed, true);
assert.equal(octValid.dateLevelMessage, null);

const mixedOnSept = evaluateCartPickupCompatibility({
  cakes: [septOnly, octOnly],
  selectedYmd: "2026-09-30",
  earliestYmd: earliest,
  activeSpecialWindows: [],
  globalMax,
});
assert.equal(mixedOnSept.hasCommonPickupDate, false);
assert.equal(mixedOnSept.dateLevelMessage, CART_NO_COMMON_PICKUP_DATE_MESSAGE);
assert.equal(mixedOnSept.cakes.find((cake) => cake.cakeId === "sept-cake")?.allowed, true);
assert.equal(
  mixedOnSept.cakes.find((cake) => cake.cakeId === "oct-cake")?.availabilityNote,
  "Available from 1 Oct 2026",
);
assert.equal(
  mixedOnSept.cakes.find((cake) => cake.cakeId === "sept-cake")?.availabilityNote,
  null,
);

const mixedOnOct = evaluateCartPickupCompatibility({
  cakes: [septOnly, octOnly],
  selectedYmd: "2026-10-02",
  earliestYmd: earliest,
  activeSpecialWindows: [],
  globalMax,
});
assert.equal(mixedOnOct.hasCommonPickupDate, false);
assert.equal(mixedOnOct.dateLevelMessage, CART_NO_COMMON_PICKUP_DATE_MESSAGE);
assert.equal(
  mixedOnOct.cakes.find((cake) => cake.cakeId === "sept-cake")?.availabilityNote,
  "Available until 30 Sep 2026",
);
assert.equal(mixedOnOct.cakes.find((cake) => cake.cakeId === "oct-cake")?.allowed, true);

const mixedNotes = cakePickupAvailabilityNotesById(mixedOnSept);
assert.deepEqual(Object.keys(mixedNotes), ["oct-cake"]);

const overlapOnSept = evaluateCartPickupCompatibility({
  cakes: [bothMonths, octOnly],
  selectedYmd: "2026-09-30",
  earliestYmd: earliest,
  activeSpecialWindows: [],
  globalMax,
});
assert.equal(overlapOnSept.hasCommonPickupDate, true);
assert.equal(overlapOnSept.cakes.find((cake) => cake.cakeId === "oct-cake")?.allowed, false);
assert.equal(
  overlapOnSept.dateLevelMessage,
  "Some cakes in your order are only available from 1 Oct 2026. Please select a pickup date from 1 Oct 2026 onward.",
);

const overlapOnOct = evaluateCartPickupCompatibility({
  cakes: [bothMonths, octOnly],
  selectedYmd: "2026-10-02",
  earliestYmd: earliest,
  activeSpecialWindows: [],
  globalMax,
});
assert.equal(overlapOnOct.dateLevelMessage, null);
assert.ok(overlapOnOct.cakes.every((cake) => cake.allowed));

const mixedNoDate = evaluateCartPickupCompatibility({
  cakes: [septOnly, octOnly],
  selectedYmd: null,
  earliestYmd: earliest,
  activeSpecialWindows: [],
  globalMax,
});
assert.equal(mixedNoDate.hasCommonPickupDate, false);
assert.equal(mixedNoDate.dateLevelMessage, CART_NO_COMMON_PICKUP_DATE_MESSAGE);
assert.ok(mixedNoDate.cakes.every((cake) => cake.availabilityNote === null));

assert.equal(
  cakePickupAvailabilityLabel({ min: "2026-10-01", max: "2026-10-31" }, "2026-09-30"),
  "Available from 1 Oct 2026",
);
assert.equal(
  cakePickupAvailabilityLabel({ min: "2026-10-01", max: "2026-10-31" }, "2026-11-01"),
  "Available until 31 Oct 2026",
);
assert.equal(
  cakePickupAvailabilityLabel({ min: "2026-10-01", max: "2026-10-31" }, "2026-10-15"),
  "Available from 1 Oct 2026 to 31 Oct 2026",
);

const line = {
  lineId: "sept-cake::size",
  cakeId: "sept-cake",
  cakeSizeId: "size",
  cakeName: "September Cake",
  sizeLabel: '6"',
  quantity: 1,
  preorderDays: 2,
};
const catalogueEval = evaluateCollectionDate({
  selectedYmd: "2026-09-30",
  businessDate: "2026-09-14",
  lines: [line],
  operatingOpen: true,
  closed: false,
  inCatalogue: false,
});
assert.equal(
  customerCollectionDateMessage(catalogueEval, [line]),
  CART_PICKUP_INCOMPATIBLE_REVIEW_MESSAGE,
);
assert.equal(
  customerCollectionDateMessage(catalogueEval, []),
  "Please add at least one cake from the catalogue for that pickup date.",
);

const checkoutSrc = readSrc("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
assert.match(checkoutSrc, /evaluateCartPickupCompatibility/);
assert.match(checkoutSrc, /dateValidationMessage/);
assert.match(checkoutSrc, /FormError/);
assert.match(checkoutSrc, /cakePickupAvailabilityNotes/);
assert.match(checkoutSrc, /submitBlocked/);
assert.doesNotMatch(
  checkoutSrc,
  /Please add at least one cake from the catalogue for that pickup date/,
);

const summarySrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx",
);
assert.match(summarySrc, /cakePickupAvailabilityNotes/);
assert.match(summarySrc, /text-status-danger mt-2 text-sm font-semibold/);

const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
assert.match(actionsSrc, /evaluateCartPickupCompatibility/);
assert.match(actionsSrc, /cakePickupMemberships/);
assert.doesNotMatch(
  actionsSrc,
  /Please add at least one cake from the catalogue for that pickup date/,
);

const formStylesSrc = readSrc("src/components/ui/form/FormControls.tsx");
assert.match(formStylesSrc, /bg-red-50/);
assert.match(formStylesSrc, /text-red-800/);

console.log("PASS cart pickup compatibility");
