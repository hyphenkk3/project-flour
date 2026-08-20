/**
 * Whole Cake checkout calendar: collection entry month vs cake availability range.
 * Run: npx tsx scripts/test-storefront-pickup-calendar-scope.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cakePickupDateBounds,
  cartExcludedPickupDates,
  cartPickupDateBounds,
  catalogueMonthPickupBounds,
  customerSpecialMenuPeriodLabel,
  isFullMonthPickupScope,
  isPickupDateAllowedForCake,
  navigablePickupMonths,
  resolveCheckoutPickupScope,
  unionPickupWindows,
} from "@/engines/menu/customer-browse";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const earliest = "2026-08-22";
const globalMax = "2026-09-30";

// 1. August collection → August initial month
const augustScope = resolveCheckoutPickupScope({
  earliest,
  scopeFrom: "2026-08-01",
  scopeTo: "2026-08-31",
  globalMax,
});
assert.equal(augustScope.scopeConstrainsBounds, false);
assert.equal(augustScope.suggestedPickupDate, "2026-08-22");
assert.equal(augustScope.minPickupDate, earliest);
assert.equal(augustScope.maxPickupDate, globalMax);

// 2. September collection → September initial month (not August default)
const septemberScope = resolveCheckoutPickupScope({
  earliest,
  scopeFrom: "2026-09-01",
  scopeTo: "2026-09-30",
  globalMax,
});
assert.equal(septemberScope.scopeConstrainsBounds, false);
assert.equal(septemberScope.suggestedPickupDate, "2026-09-01");
assert.equal(septemberScope.minPickupDate, earliest);
assert.equal(septemberScope.maxPickupDate, globalMax);

// 3. Cake in August + September → opens on entry month, both months navigable
const multiMonthBounds = cakePickupDateBounds(
  ["2026-08-01", "2026-09-01"],
  [],
  earliest,
);
assert.deepEqual(multiMonthBounds, { min: "2026-08-22", max: "2026-09-30" });
assert.deepEqual(
  navigablePickupMonths(multiMonthBounds!.min, multiMonthBounds!.max),
  ["2026-08", "2026-09"],
);
const sepEntryWithMultiMonthCake = resolveCheckoutPickupScope({
  earliest,
  scopeFrom: "2026-09-01",
  scopeTo: "2026-09-30",
  globalMax,
});
assert.equal(sepEntryWithMultiMonthCake.suggestedPickupDate, "2026-09-01");
assert.ok(
  multiMonthBounds!.min < "2026-09-01",
  "August remains selectable for multi-month cakes",
);

// 4. Cake only in September → August not selectable
const septemberOnlyBounds = cakePickupDateBounds(["2026-09-01"], [], earliest);
assert.deepEqual(septemberOnlyBounds, { min: "2026-09-01", max: "2026-09-30" });
assert.deepEqual(
  navigablePickupMonths(septemberOnlyBounds!.min, septemberOnlyBounds!.max),
  ["2026-09"],
);

// 5. Special 16–17 September → only those dates selectable
const specialScope = resolveCheckoutPickupScope({
  earliest,
  scopeFrom: "2026-09-16",
  scopeTo: "2026-09-17",
  globalMax,
});
assert.equal(specialScope.scopeConstrainsBounds, true);
assert.equal(specialScope.minPickupDate, "2026-09-16");
assert.equal(specialScope.maxPickupDate, "2026-09-17");
assert.equal(isFullMonthPickupScope("2026-09-16", "2026-09-17"), false);
assert.deepEqual(
  navigablePickupMonths(specialScope.minPickupDate, specialScope.maxPickupDate!),
  ["2026-09"],
);

// 6. Invalid dates remain blocked by earliest lead
assert.equal(
  unionPickupWindows(
    [catalogueMonthPickupBounds("2026-08-01")!],
    "2026-08-22",
  )?.min,
  "2026-08-22",
);
assert.equal(
  cartPickupDateBounds(
    [
      cakePickupDateBounds(["2026-08-01"], [], earliest),
      cakePickupDateBounds(["2026-09-01"], [], earliest),
    ],
    earliest,
    globalMax,
  ),
  null,
  "No shared pickup date when cart spans non-overlapping single-month cakes",
);

const specialWindow = { from: "2026-09-16", to: "2026-09-17" };
assert.equal(
  isPickupDateAllowedForCake(
    "2026-09-16",
    { monthlyMonths: ["2026-09-01"], specialWindows: [] },
    [specialWindow],
    earliest,
  ),
  false,
  "monthly-only cake cannot use overlapping special dates",
);
assert.equal(
  isPickupDateAllowedForCake(
    "2026-09-18",
    { monthlyMonths: ["2026-09-01"], specialWindows: [] },
    [specialWindow],
    earliest,
  ),
  true,
);
assert.equal(
  isPickupDateAllowedForCake(
    "2026-09-16",
    { monthlyMonths: [], specialWindows: [specialWindow] },
    [specialWindow],
    earliest,
  ),
  true,
  "special-menu cake can use 16 September",
);
assert.equal(
  isPickupDateAllowedForCake(
    "2026-09-16",
    {
      monthlyMonths: ["2026-09-01"],
      specialWindows: [specialWindow],
    },
    [specialWindow],
    earliest,
  ),
  true,
  "cake in both monthly and special remains valid on special dates",
);
assert.deepEqual(
  cartExcludedPickupDates(
    [{ monthlyMonths: ["2026-09-01"], specialWindows: [] }],
    [specialWindow],
    "2026-09-01",
    "2026-09-30",
    earliest,
  ),
  ["2026-09-16", "2026-09-17"],
);
assert.equal(
  customerSpecialMenuPeriodLabel("2026-09-16", "2026-09-17"),
  "16–17 September 2026",
);

const checkoutPageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
assert.match(checkoutPageSrc, /resolveCheckoutPickupScope/);
assert.doesNotMatch(
  checkoutPageSrc,
  /const minPickupDate = scoped\?\.min/,
);

const formSrc = readSrc("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
assert.match(formSrc, /resolveCartPickupDateBounds/);
assert.match(formSrc, /effectivePickupBounds/);
assert.match(formSrc, /pickupScopeFrom/);
assert.match(formSrc, /entrySpecialUnavailableDates/);
assert.match(formSrc, /CAKE_REMOVED_FOR_DATE_MESSAGE/);
assert.match(formSrc, /OPTIONAL_NOTES_CUSTOMER_WARNING/);
assert.match(formSrc, /text-status-danger/);
assert.doesNotMatch(formSrc, /OrderGuideCallout/);

const unpublishSrc = readSrc(
  "src/workspaces/library/collections/CatalogueUnpublishButton.tsx",
);
assert.match(unpublishSrc, /Unpublish catalogue/);
assert.match(unpublishSrc, /border-ink/);
assert.match(unpublishSrc, /text-ink/);
assert.doesNotMatch(unpublishSrc, /bg-ink text-mist/);

const orderCollectionsSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontOrderCollectionsPage.tsx",
);
assert.match(orderCollectionsSrc, /customerSpecialMenuPeriodLabel/);

const draftSrc = readSrc("src/workspaces/storefront/checkout/preorder-draft.ts");
assert.match(draftSrc, /preorderCheckoutHref/);
assert.match(draftSrc, /pickupScopeFrom/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionSrc, /collectionScopedCakeHref/);

console.log("PASS storefront pickup calendar scope");
