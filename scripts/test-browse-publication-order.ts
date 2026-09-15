/**
 * Browse publication inclusion + latest-available ordering.
 * Run: npx tsx scripts/test-browse-publication-order.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  latestOrderableMonthlyYearMonth,
  sortBrowsePublicationCakes,
} from "@/engines/menu/browse-publication-order";
import { isCurrentlyCustomerOrderable } from "@/engines/menu/customer-browse";
import { isCustomerFacingHistoricalCatalogue } from "@/engines/menu/homepage-collection-preview";
import {
  DEFAULT_BROWSE_SORT,
  sortBrowseCakes,
} from "@/workspaces/storefront/catalog/browse-sort";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const today = "2026-09-14";
const september = {
  purpose: "monthly" as const,
  status: "active",
  month: "2026-09-01",
  endDate: null,
  websiteOverride: false,
};
const october = {
  purpose: "monthly" as const,
  status: "active",
  month: "2026-10-01",
  endDate: null,
  websiteOverride: false,
};
const augustExpired = {
  purpose: "monthly" as const,
  status: "archived",
  month: "2026-08-01",
  endDate: null,
  websiteOverride: false,
};
const draftSeptember = {
  ...september,
  status: "draft",
};

assert.equal(isCurrentlyCustomerOrderable(september, today), true);
assert.equal(isCurrentlyCustomerOrderable(october, today), true);
assert.equal(
  isCurrentlyCustomerOrderable(september, today) &&
    isCurrentlyCustomerOrderable(october, today),
  true,
  "Publishing October does not stop September remaining currently orderable in September",
);
assert.equal(isCurrentlyCustomerOrderable(augustExpired, today), false);
assert.equal(
  isCustomerFacingHistoricalCatalogue({
    purpose: "monthly",
    status: "archived",
    websiteOverride: false,
    showInPastMenu: false,
  }),
  true,
  "Archived monthly cakes remain in the Browse publication set",
);
assert.equal(isCurrentlyCustomerOrderable(draftSeptember, today), false);
assert.equal(
  isCustomerFacingHistoricalCatalogue({
    purpose: "monthly",
    status: "draft",
    websiteOverride: false,
  }),
  false,
  "Draft catalogues are excluded from Browse",
);

assert.equal(
  latestOrderableMonthlyYearMonth(["2026-09-01", "2026-10-01", "2026-08-01"]),
  "2026-10",
  "Latest collection is the latest month, not the first listed or a database id",
);
assert.notEqual(latestOrderableMonthlyYearMonth(["2026-09-01"]), "id-sort");

const lemon = {
  id: "lemon",
  name: "Refreshing Lemon",
  currentlyOffered: true,
  inLatestCollection: false,
  latestCollectionSortOrder: null as number | null,
  sizes: [],
};
const octoberFirst = {
  id: "oct-a",
  name: "Zebra Walnut",
  currentlyOffered: true,
  inLatestCollection: true,
  latestCollectionSortOrder: 2,
  sizes: [],
};
const octoberSecond = {
  id: "oct-b",
  name: "Apple Crumble",
  currentlyOffered: true,
  inLatestCollection: true,
  latestCollectionSortOrder: 1,
  sizes: [],
};
const unavailable = {
  id: "old",
  name: "Avocado",
  currentlyOffered: false,
  inLatestCollection: false,
  latestCollectionSortOrder: null,
  sizes: [],
};
const otherAvailable = {
  id: "banana",
  name: "Banana Cream",
  currentlyOffered: true,
  inLatestCollection: false,
  latestCollectionSortOrder: null,
  sizes: [],
};

assert.deepEqual(
  sortBrowsePublicationCakes([
    unavailable,
    lemon,
    octoberFirst,
    otherAvailable,
    octoberSecond,
  ]).map((cake) => cake.id),
  ["oct-b", "oct-a", "banana", "lemon", "old"],
  "Latest available (collection sort_order) → other available (name) → unavailable",
);

assert.equal(DEFAULT_BROWSE_SORT, "recommended");
const published = sortBrowsePublicationCakes([
  lemon,
  octoberFirst,
  octoberSecond,
  otherAvailable,
  unavailable,
]);
assert.deepEqual(
  sortBrowseCakes(published, "recommended", published).map((cake) => cake.id),
  published.map((cake) => cake.id),
  "Recommended keeps Browse publication order, including the availability hierarchy",
);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
const browseFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listBrowsePublishedCakes"),
  queriesSrc.indexOf("type LiveCakeCommercialRow"),
);
assert.match(browseFn, /sortBrowsePublicationCakes/);
assert.match(browseFn, /isCurrentlyCustomerOrderable/);
assert.match(browseFn, /isCustomerFacingHistoricalCatalogue/);
assert.match(browseFn, /currentlyOrderable/);
assert.match(browseFn, /historical/);
assert.doesNotMatch(
  browseFn,
  /latestMonthlyId && currentlyOrderableIds\.size === 1/,
);
assert.match(browseFn, /collection_cakes/);
assert.doesNotMatch(browseFn, /Refreshing Lemon/);
assert.doesNotMatch(browseFn, /cake-categories/);
assert.match(browseFn, /from\("library_cakes"\)/);
assert.match(browseFn, /cakeById\.has/);

const liveUnavailable = {
  id: "lemon-nc",
  name: "Refreshing Lemon",
  currentlyOffered: false,
  inLatestCollection: false,
  latestCollectionSortOrder: null as number | null,
  sizes: [],
};
const decadentUnavailable = {
  id: "decadent-nc",
  name: "Decadent Chocolate (Dark Chocolate, Slightly Sweeter)",
  currentlyOffered: false,
  inLatestCollection: false,
  latestCollectionSortOrder: null,
  sizes: [],
};
assert.deepEqual(
  sortBrowsePublicationCakes([
    decadentUnavailable,
    octoberSecond,
    liveUnavailable,
    unavailable,
  ]).map((cake) => cake.id),
  ["oct-b", "old", "decadent-nc", "lemon-nc"],
  "14. no-collection live cakes stay in the existing unavailable group",
);

const popularFn = queriesSrc.slice(
  queriesSrc.indexOf("async function loadHomepagePopularCakes"),
);
assert.doesNotMatch(popularFn, /sortBrowsePublicationCakes/);

const previewFn = queriesSrc.slice(
  queriesSrc.indexOf("async function loadHomepageCollectionPreviewCakes"),
  queriesSrc.indexOf("export async function getStorefrontOfferedCakeById"),
);
assert.doesNotMatch(previewFn, /sortBrowsePublicationCakes/);

const availableFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listAvailableCakes"),
  queriesSrc.indexOf("export async function getStorefrontOfferedCakeById"),
);
assert.doesNotMatch(availableFn, /sortBrowsePublicationCakes/);
assert.match(availableFn, /\.order\("sort_order"/);

const categoriesSrc = readSrc("src/engines/menu/cake-categories.ts");
assert.match(
  categoriesSrc,
  /Refreshing Lemon/,
  "Refreshing Lemon is a category seed, not Browse membership",
);

console.log("PASS browse publication order");
