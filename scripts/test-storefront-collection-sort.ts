/**
 * Collection-page catalogue sort (scoped to assigned cakes).
 * Run: npx tsx scripts/test-storefront-collection-sort.ts
 *
 * Static only. Does not mutate catalogues, cakes, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StorefrontCake } from "@/types/storefront";
import {
  legacyCakeCategoryFields,
  type LegacyLibraryCakeCategorySlug,
} from "@/engines/menu/cake-categories";
import {
  EMPTY_BROWSE_FILTERS,
  browseFilterOptionsFromCatalogue,
} from "@/workspaces/storefront/catalog/browse-filters";
import {
  BROWSE_SORT_OPTIONS,
  browseSortPreorderDays,
  sortBrowseCakes,
  viewBrowseCatalogue,
} from "@/workspaces/storefront/catalog/browse-sort";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function size(
  id: string,
  label: string,
  price: number,
  days = 2,
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

function cake(
  id: string,
  name: string,
  category: LegacyLibraryCakeCategorySlug,
  sizes: StorefrontCake["sizes"],
  description: string | null = `${name} cake`,
): StorefrontCake {
  return {
    id,
    name,
    description,
    ...legacyCakeCategoryFields(category),
    image: null,
    photos: [],
    sharingGuide: null,
    allergens: [],
    sizes,
  };
}

const twoDay = cake("two-day", "Almond Honey", "classic", [
  size("t6", '6"', 130, 2),
]);
const threeDay = cake("three-day", "Chestnut Cream", "celebration", [
  size("c6", '6"', 160, 3),
]);
const mixedLead = cake("mixed-lead", "Mixed Lead Cake", "specialty", [
  size("m6", '6"', 110, 2),
  size("m8", '8"', 180, 3),
]);
const equalTwoDay = cake("equal-two", "Equal Two Day", "classic", [
  size("e6", '6"', 130, 2),
]);
const outsider = cake("outsider", "Not In Collection", "seasonal", [
  size("o6", '6"', 90, 1),
]);

/** Membership order for this collection (catalogue/publication order). */
const collection = [threeDay, twoDay, mixedLead, equalTwoDay];
const ranges = browseFilterOptionsFromCatalogue(collection).priceRanges;

assert.deepEqual(
  BROWSE_SORT_OPTIONS.map((option) => option.id),
  [
    "recommended",
    "price_asc",
    "price_desc",
    "preorder_asc",
    "preorder_desc",
    "name_asc",
  ],
);
assert.deepEqual(
  BROWSE_SORT_OPTIONS.map((option) => option.label),
  [
    "Recommended",
    "Price: Low to High",
    "Price: High to Low",
    "Preorder Days: Low to High",
    "Preorder Days: High to Low",
    "Name: A–Z",
  ],
);

assert.deepEqual(
  viewBrowseCatalogue(
    collection,
    "",
    EMPTY_BROWSE_FILTERS,
    ranges,
    "recommended",
  ).map((row) => row.id),
  ["three-day", "two-day", "mixed-lead", "equal-two"],
  "A. Recommended preserves this collection's catalogue order",
);
assert.equal(
  viewBrowseCatalogue(
    collection,
    "",
    EMPTY_BROWSE_FILTERS,
    ranges,
    "recommended",
  ).some((row) => row.id === outsider.id),
  false,
  "A. collection view never includes cakes outside membership",
);

assert.deepEqual(
  sortBrowseCakes(collection, "price_asc", collection).map((row) => row.id),
  ["mixed-lead", "two-day", "equal-two", "three-day"],
  "B. Price Low → High uses lowest available size price",
);
assert.deepEqual(
  sortBrowseCakes(collection, "price_desc", collection).map((row) => row.id),
  ["three-day", "two-day", "equal-two", "mixed-lead"],
  "C. Price High → Low uses lowest available size price",
);

assert.deepEqual(
  sortBrowseCakes(collection, "name_asc", collection).map((row) => row.id),
  ["two-day", "three-day", "equal-two", "mixed-lead"],
  "D. Name A–Z",
);

assert.equal(browseSortPreorderDays(twoDay), 2);
assert.equal(browseSortPreorderDays(threeDay), 3);
assert.equal(browseSortPreorderDays(mixedLead), 2);
assert.deepEqual(
  sortBrowseCakes(collection, "preorder_asc", collection).map((row) => row.id),
  ["two-day", "mixed-lead", "equal-two", "three-day"],
  "E. Preorder Days Low → High: 2-day cakes before 3-day",
);
assert.deepEqual(
  sortBrowseCakes(collection, "preorder_desc", collection).map((row) => row.id),
  ["three-day", "two-day", "mixed-lead", "equal-two"],
  "F. Preorder Days High → Low: 3-day cakes before 2-day",
);
assert.deepEqual(
  sortBrowseCakes([equalTwoDay, twoDay], "preorder_asc", collection).map(
    (row) => row.id,
  ),
  ["two-day", "equal-two"],
  "G. equal preorder days keep collection catalogue order",
);
assert.deepEqual(
  sortBrowseCakes(
    [threeDay, mixedLead, twoDay],
    "preorder_asc",
    collection,
  ).map((row) => row.id),
  ["two-day", "mixed-lead", "three-day"],
  "H. mixed-size cake sorts by its soonest configured lead time",
);

assert.deepEqual(
  viewBrowseCatalogue(
    collection,
    "",
    { ...EMPTY_BROWSE_FILTERS, size: '8"' },
    ranges,
    "preorder_asc",
  ).map((row) => row.id),
  ["mixed-lead"],
  "I. collection filters stay inside membership, then sort",
);

const pageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(pageSrc, /listAvailableCakes\(monthly\?\.id \?\? special!\.id\)/);
assert.match(pageSrc, /BrowseCakeCatalogue/);
assert.match(pageSrc, /emptyMessage="No cakes are listed in this collection yet."/);
assert.doesNotMatch(pageSrc, /listBrowsePublishedCakes/);
assert.doesNotMatch(pageSrc, /evaluateCollectionDate/);
assert.doesNotMatch(pageSrc, /browse-sort/);

const catalogueSrc = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
assert.match(catalogueSrc, /browseToolbarClass/);
assert.match(catalogueSrc, /layout="toolbar"/);
assert.doesNotMatch(catalogueSrc, /md:contents/);
assert.doesNotMatch(catalogueSrc, /evaluateCollectionDate/);

const sortSrc = readSrc("src/workspaces/storefront/catalog/browse-sort.ts");
assert.match(sortSrc, /browseSortPreorderDays/);
assert.doesNotMatch(sortSrc, /evaluateCollectionDate/);
assert.doesNotMatch(sortSrc, /pickupDate/);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
const availableFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listAvailableCakes"),
  queriesSrc.indexOf("export async function getStorefrontOfferedCakeById"),
);
assert.match(availableFn, /\.eq\("collection_id", collectionId\)/);
assert.match(availableFn, /\.order\("sort_order"/);

console.log("PASS storefront collection sort");
