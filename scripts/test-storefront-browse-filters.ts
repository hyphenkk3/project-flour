/**
 * Phase 4.2.4 — customer Browse filters (client-side, after search).
 * Run: npx tsx scripts/test-storefront-browse-filters.ts
 *
 * Static only. Does not mutate catalogues, cakes, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StorefrontCake } from "@/types/storefront";
import {
  legacyCakeCategoryFields,
  legacyCakeCategoryId,
} from "@/engines/menu/cake-categories";
import {
  EMPTY_BROWSE_FILTERS,
  browseFilterGridClass,
  browseFilterOptionsFromCatalogue,
  browseToolbarClass,
  cakeMatchesBrowseFilters,
  countActiveBrowseFilters,
  filterBrowseCatalogue,
  filterBrowseCakes,
  hasActiveBrowseFilters,
  visibleBrowseFilterCount,
} from "@/workspaces/storefront/catalog/browse-filters";
import { cakeCardPreorderLabel } from "@/workspaces/storefront/catalog/pricing";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function size(
  id: string,
  label: string,
  price: number,
  days: number,
): StorefrontCake["sizes"][number] {
  return {
    id,
    cakeId: "x",
    size: label,
    price,
    sortOrder: 0,
    preorderDays: days,
  };
}

const matcha: StorefrontCake = {
  id: "matcha",
  name: "Matcha Yuzu Cake",
  description: "Soft sponge with yuzu cream.",
  ...legacyCakeCategoryFields("seasonal"),
  image: null,
  photos: [],
  sharingGuide: null,
  allergens: [],
  sizes: [size("m6", '6"', 80, 2)],
};
const pandan: StorefrontCake = {
  id: "pandan",
  name: "Pandan Mango Cake",
  description: "Fragrant pandan with mango.",
  ...legacyCakeCategoryFields("classic"),
  image: null,
  photos: [],
  sharingGuide: null,
  allergens: [],
  sizes: [size("p6", '6"', 120, 2), size("p8", '8"', 180, 3)],
};
const chocolate: StorefrontCake = {
  id: "choco",
  name: "Classic Chocolate",
  description: null,
  ...legacyCakeCategoryFields("classic"),
  image: null,
  photos: [],
  sharingGuide: null,
  allergens: [],
  sizes: [size("c8", '8"', 220, 3)],
};
const published = [matcha, pandan, chocolate];
const excluded: StorefrontCake = {
  id: "staff-only",
  name: "Matcha Hidden",
  description: "Staff-only special cake.",
  ...legacyCakeCategoryFields("classic"),
  image: null,
  photos: [],
  sharingGuide: null,
  allergens: [],
  sizes: [size("h6", '6"', 90, 2)],
};

const options = browseFilterOptionsFromCatalogue(published);
const ranges = options.priceRanges;

assert.deepEqual(
  filterBrowseCakes(published, EMPTY_BROWSE_FILTERS, ranges).map((cake) => cake.id),
  ["matcha", "pandan", "choco"],
  "A. no filters returns the publication set",
);
assert.equal(hasActiveBrowseFilters(EMPTY_BROWSE_FILTERS), false);

assert.deepEqual(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, category: legacyCakeCategoryId("seasonal") },
    ranges,
  ).map((cake) => cake.id),
  ["matcha"],
  "B. category filter",
);
assert.deepEqual(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, category: legacyCakeCategoryId("classic") },
    ranges,
  ).map((cake) => cake.id),
  ["pandan", "choco"],
);

assert.deepEqual(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, size: '6"' },
    ranges,
  ).map((cake) => cake.id),
  ["matcha", "pandan"],
  "C. size filter includes cakes that have the size",
);
assert.deepEqual(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, size: '8"' },
    ranges,
  ).map((cake) => cake.id),
  ["pandan", "choco"],
);
assert.equal(
  cakeMatchesBrowseFilters(
    pandan,
    { ...EMPTY_BROWSE_FILTERS, size: '6"' },
    ranges,
  ),
  true,
);

const bandUnder100 = ranges.find((range) => range.min === 50 && range.max === 100);
const band100to149 = ranges.find((range) => range.min === 100 && range.max === 150);
const from200 = ranges.find((range) => range.min === 200 && range.max == null);
assert.ok(bandUnder100, "price bands are derived from loaded prices");
assert.ok(band100to149);
assert.ok(from200);
assert.deepEqual(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, priceRangeId: bandUnder100!.id },
    ranges,
  ).map((cake) => cake.id),
  ["matcha"],
  "D. price matches when any size is in range",
);
assert.deepEqual(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, priceRangeId: band100to149!.id },
    ranges,
  ).map((cake) => cake.id),
  ["pandan"],
);
assert.deepEqual(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, priceRangeId: from200!.id },
    ranges,
  ).map((cake) => cake.id),
  ["choco"],
);

assert.deepEqual(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, preorderDays: 3 },
    ranges,
  ).map((cake) => cake.id),
  ["pandan", "choco"],
  "E. mixed-size cake matches if any size has the selected preorder days",
);
assert.deepEqual(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, preorderDays: 2 },
    ranges,
  ).map((cake) => cake.id),
  ["matcha", "pandan"],
);
assert.equal(cakeCardPreorderLabel(pandan), "Preorder varies by size");

assert.deepEqual(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, category: legacyCakeCategoryId("classic"), size: '6"' },
    ranges,
  ).map((cake) => cake.id),
  ["pandan"],
  "F. combined filters require every active condition",
);

assert.deepEqual(
  filterBrowseCatalogue(
    published,
    "matcha",
    { ...EMPTY_BROWSE_FILTERS, category: legacyCakeCategoryId("seasonal") },
    ranges,
  ).map((cake) => cake.id),
  ["matcha"],
  "G. search and filters compose",
);
assert.deepEqual(
  filterBrowseCatalogue(
    published,
    "matcha",
    { ...EMPTY_BROWSE_FILTERS, category: legacyCakeCategoryId("classic") },
    ranges,
  ).map((cake) => cake.id),
  [],
);

const afterClearFilters = filterBrowseCatalogue(
  published,
  "chocolate",
  EMPTY_BROWSE_FILTERS,
  ranges,
);
assert.deepEqual(
  afterClearFilters.map((cake) => cake.id),
  ["choco"],
  "H. clearing filters restores the search-filtered set",
);

const classicOnly = {
  ...EMPTY_BROWSE_FILTERS,
  category: legacyCakeCategoryId("classic"),
};
assert.deepEqual(
  filterBrowseCatalogue(published, "", classicOnly, ranges).map(
    (cake) => cake.id,
  ),
  ["pandan", "choco"],
  "I. empty search preserves active filters",
);
assert.equal(countActiveBrowseFilters(classicOnly), 1);

assert.equal(
  filterBrowseCakes(
    published,
    { ...EMPTY_BROWSE_FILTERS, category: legacyCakeCategoryId("classic"), size: '6"' },
    ranges,
  ).some((cake) => cake.id === excluded.id),
  false,
  "J. excluded cakes cannot appear through filters",
);
assert.deepEqual(
  filterBrowseCatalogue(
    published,
    "Matcha Hidden",
    { ...EMPTY_BROWSE_FILTERS, size: '6"' },
    ranges,
  ).map((cake) => cake.id),
  [],
);

const filteredPandan = filterBrowseCakes(
  published,
  { ...EMPTY_BROWSE_FILTERS, size: '6"' },
  ranges,
).find((cake) => cake.id === "pandan");
assert.equal(
  cakeCardPreorderLabel(filteredPandan!),
  "Preorder varies by size",
  "K. filtering does not alter mixed-size preorder labels",
);

const filterSrc = readSrc("src/workspaces/storefront/catalog/browse-filters.ts");
assert.match(filterSrc, /lg:grid-rows-1/);
assert.match(filterSrc, /browseToolbarClass/);
assert.doesNotMatch(filterSrc, /preorder-draft/);
assert.doesNotMatch(filterSrc, /sessionStorage/);
assert.doesNotMatch(filterSrc, /writePreorderDraft/);
assert.doesNotMatch(filterSrc, /evaluateCollectionDate/);
assert.doesNotMatch(filterSrc, /localStorage/);

assert.equal(visibleBrowseFilterCount(options) >= 4, true);
assert.match(browseFilterGridClass(options), /lg:grid-cols-4/);

const twoDayOnly = browseFilterOptionsFromCatalogue([
  matcha,
  {
    ...pandan,
    sizes: [size("p6", '6"', 120, 2), size("p8", '8"', 180, 2)],
  },
  {
    ...chocolate,
    sizes: [size("c8", '8"', 220, 2)],
  },
]);
assert.equal(twoDayOnly.preorderDays.length, 1);
assert.equal(visibleBrowseFilterCount(twoDayOnly), 3);
assert.match(
  browseFilterGridClass(twoDayOnly),
  /lg:grid-cols-3/,
  "N. three visible filters use three columns, not a 4-col hole",
);
assert.doesNotMatch(browseFilterGridClass(twoDayOnly), /lg:grid-cols-4/);

const threeFilterToolbar = browseToolbarClass(twoDayOnly);
assert.match(threeFilterToolbar, /lg:grid-rows-1/);
assert.match(
  threeFilterToolbar,
  /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(7rem,8\.5rem\)_minmax\(7rem,8\.5rem\)_minmax\(7rem,8\.5rem\)_minmax\(12\.5rem,14rem\)\]/,
  "O. three desktop filters share one 5-column row with Search and Sort",
);
assert.doesNotMatch(threeFilterToolbar, /flex-nowrap/);

const fourFilterToolbar = browseToolbarClass(options);
assert.match(fourFilterToolbar, /lg:grid-rows-1/);
assert.match(
  fourFilterToolbar,
  /lg:grid-cols-\[minmax\(0,1fr\).*minmax\(12\.5rem,14rem\)\]/,
);
assert.equal(
  (fourFilterToolbar.match(/minmax\(/g) ?? []).length,
  6,
  "O. Search 1fr + four filters + Sort is one 6-column desktop row",
);

const catalogueSrc = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
assert.match(catalogueSrc, /browseFilterGridClass/);
assert.match(catalogueSrc, /browseToolbarClass/);
assert.match(catalogueSrc, /viewBrowseCatalogue/);
assert.match(catalogueSrc, /layout="toolbar"/);
assert.match(catalogueSrc, /max-md:hidden/);
assert.match(catalogueSrc, /return fields/);
assert.match(catalogueSrc, /Clear filters/);
assert.match(catalogueSrc, /Try adjusting your search or filters/);
assert.doesNotMatch(catalogueSrc, /md:contents/);
assert.doesNotMatch(catalogueSrc, /lg:flex-nowrap/);
assert.doesNotMatch(catalogueSrc, /writePreorderDraft/);
assert.doesNotMatch(catalogueSrc, /sessionStorage/);
assert.doesNotMatch(catalogueSrc, /searchParams/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionSrc, /BrowseCakeCatalogue/);
assert.match(collectionSrc, /listAvailableCakes/);
assert.doesNotMatch(collectionSrc, /listBrowsePublishedCakes/);
assert.doesNotMatch(collectionSrc, /browse-filters/);

const orderSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontOrderCollectionsPage.tsx",
);
assert.doesNotMatch(orderSrc, /browse-filters/);

const cardSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeCard.tsx",
);
assert.match(cardSrc, /cakeCardPreorderLabel/);

console.log("PASS storefront browse filters");
