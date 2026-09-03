/**
 * Phase 4.2.1 — customer Browse publication set.
 * Run: npx tsx scripts/test-storefront-browse-publication.ts
 *
 * Static only. Does not create or mutate catalogues, cakes, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  browseCakeAvailabilityNote,
  isCurrentlyCustomerOrderable,
} from "@/engines/menu/customer-browse";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const TODAY = "2026-08-15";
const TODAY_YM = "2026-08";

const currentMonthly = {
  purpose: "monthly" as const,
  status: "active",
  month: "2026-08-01",
  endDate: null,
  websiteOverride: false,
};
const futureMonthly = {
  purpose: "monthly" as const,
  status: "active",
  month: "2026-09-01",
  endDate: null,
  websiteOverride: false,
};
const expiredMonthly = {
  purpose: "monthly" as const,
  status: "active",
  month: "2026-07-01",
  endDate: null,
  websiteOverride: false,
};
const overrideSpecial = {
  purpose: "special" as const,
  status: "active",
  month: null,
  endDate: "2026-08-20",
  websiteOverride: true,
};
const staffOnlySpecial = {
  purpose: "special" as const,
  status: "active",
  month: null,
  endDate: "2026-08-20",
  websiteOverride: false,
};
const expiredOverrideSpecial = {
  purpose: "special" as const,
  status: "active",
  month: null,
  endDate: "2026-08-01",
  websiteOverride: true,
};
const draftMonthly = {
  ...currentMonthly,
  status: "draft",
};
const archivedMonthly = {
  ...currentMonthly,
  status: "archived",
};

assert.equal(
  isCurrentlyCustomerOrderable(currentMonthly, TODAY),
  true,
  "A. active monthly is in the Browse publication set",
);
assert.equal(
  isCurrentlyCustomerOrderable(futureMonthly, TODAY),
  true,
  "B. future monthly remains discoverable",
);
assert.equal(
  isCurrentlyCustomerOrderable(overrideSpecial, TODAY),
  true,
  "C. website-override special is in the Browse publication set",
);
assert.equal(
  isCurrentlyCustomerOrderable(staffOnlySpecial, TODAY),
  false,
  "D. special without website_override is excluded",
);
assert.equal(
  isCurrentlyCustomerOrderable(expiredMonthly, TODAY),
  false,
  "E. expired monthly is excluded",
);
assert.equal(
  isCurrentlyCustomerOrderable(expiredOverrideSpecial, TODAY),
  false,
  "E. expired override special is excluded",
);
assert.equal(
  isCurrentlyCustomerOrderable(draftMonthly, TODAY),
  false,
  "F. draft catalogue is excluded",
);
assert.equal(
  isCurrentlyCustomerOrderable(archivedMonthly, TODAY),
  false,
  "F. archived catalogue is excluded",
);

assert.equal(
  browseCakeAvailabilityNote(TODAY_YM, ["2026-09-01"]),
  "Available from Sep",
  "I. future-only monthly still produces availabilityNote",
);
assert.equal(
  browseCakeAvailabilityNote(TODAY_YM, ["2026-08-01", "2026-09-01"]),
  null,
  "I. current-month membership suppresses the future-month note",
);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
const browseFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listBrowsePublishedCakes"),
  queriesSrc.indexOf("export async function getBrowsePublishedCakeById"),
);
const detailByIdFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function getBrowsePublishedCakeById"),
);

assert.match(browseFn, /isCurrentlyCustomerOrderable/);
assert.match(browseFn, /website_override/);
assert.match(browseFn, /browseCakeAvailabilityNote/);
assert.match(browseFn, /localeCompare\(b\.name, "en"\)/);
assert.match(browseFn, /cakeById\.set/);
assert.match(browseFn, /isOfferableStatus/);
assert.match(browseFn, /cake\.sizes\.length === 0/);
assert.doesNotMatch(browseFn, /isCatalogueExpired/);
assert.doesNotMatch(browseFn, /engines\/preorder/);
assert.match(
  detailByIdFn,
  /listBrowsePublishedCakes\(\)/,
  "J. cake detail uses the same Browse publication set",
);

assert.match(
  queriesSrc,
  /status === "active" \|\| status === "seasonal"/,
  "F. draft/retired remain excluded at cake mapping",
);

const detailSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
assert.match(detailSrc, /getBrowsePublishedCakeById/);
assert.doesNotMatch(detailSrc, /getAvailableCakeById/);
assert.doesNotMatch(detailSrc, /listAvailableCakes/);

const orderSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontOrderCollectionsPage.tsx",
);
assert.match(orderSrc, /listOrderableMonthlyCatalogues/);
assert.match(orderSrc, /listCustomerSpecialCatalogues/);
assert.doesNotMatch(orderSrc, /listBrowsePublishedCakes/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionSrc, /getOrderableMonthlyCatalogueById/);
assert.match(collectionSrc, /getCustomerSpecialCatalogueById/);
assert.match(collectionSrc, /listAvailableCakes/);
assert.doesNotMatch(collectionSrc, /listBrowsePublishedCakes/);

const pastSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontPastMenuPage.tsx",
);
assert.match(pastSrc, /getHistoricalCatalogueById/);
assert.match(pastSrc, /hideOrderCta/);
assert.match(pastSrc, /listAvailableCakes/);
assert.doesNotMatch(pastSrc, /listBrowsePublishedCakes/);
assert.doesNotMatch(pastSrc, /Continue to preorder/);

const browsePageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
);
assert.match(browsePageSrc, /listBrowsePublishedCakes/);
assert.match(browsePageSrc, /listHistoricalCatalogues/);
assert.doesNotMatch(browsePageSrc, /hideOrderCta/);

console.log("PASS storefront browse publication set");
