/**
 * Phase 4.2.5 — customer Browse sort (client-side, after search/filters).
 * Run: npx tsx scripts/test-storefront-browse-sort.ts
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
  type LegacyLibraryCakeCategorySlug,
} from "@/engines/menu/cake-categories";
import {
  EMPTY_BROWSE_FILTERS,
  browseFilterOptionsFromCatalogue,
} from "@/workspaces/storefront/catalog/browse-filters";
import {
  DEFAULT_BROWSE_SORT,
  browseSortPreorderDays,
  browseSortPrice,
  sortBrowseCakes,
  viewBrowseCatalogue,
} from "@/workspaces/storefront/catalog/browse-sort";
import { cakeCardPreorderLabel, startingPrice } from "@/workspaces/storefront/catalog/pricing";

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

const zebra = cake("zebra", "Zebra Walnut", "classic", [
  size("z6", '6"', 150, 3),
]);
const apple = cake("apple", "apple Crumble", "specialty", [
  size("a6", '6"', 120, 2),
  size("a8", '8"', 180, 2),
]);
const banana = cake("banana", "Banana Cream", "specialty", [
  size("b6", '6"', 140, 3),
]);
const equalLater = cake("equal-later", "Equal Price Later", "classic", [
  size("e6", '6"', 120, 2),
]);
const mixedLead = cake("mixed-lead", "Mixed Lead Cake", "classic", [
  size("m6", '6"', 110, 2),
  size("m8", '8"', 160, 3),
]);
const published = [zebra, apple, banana, equalLater];
const excluded = cake("staff-only", "Zebra Hidden", "classic", [
  size("h6", '6"', 90),
]);
const ranges = browseFilterOptionsFromCatalogue(published).priceRanges;

assert.equal(DEFAULT_BROWSE_SORT, "recommended");
assert.deepEqual(
  sortBrowseCakes(published, "recommended", published).map((row) => row.id),
  ["zebra", "apple", "banana", "equal-later"],
  "A. Recommended preserves publication order",
);

assert.deepEqual(
  sortBrowseCakes(published, "name_asc", published).map((row) => row.id),
  ["apple", "banana", "equal-later", "zebra"],
  "B. Name A–Z is case-insensitive",
);

assert.equal(browseSortPrice(apple), 120);
assert.equal(browseSortPrice(apple), startingPrice(apple));
assert.deepEqual(
  sortBrowseCakes(published, "price_asc", published).map((row) => row.id),
  ["apple", "equal-later", "banana", "zebra"],
  "C. Price Low → High uses lowest available size price",
);

assert.deepEqual(
  sortBrowseCakes(published, "price_desc", published).map((row) => row.id),
  ["zebra", "banana", "apple", "equal-later"],
  "D. Price High → Low uses lowest available size price",
);

assert.deepEqual(
  sortBrowseCakes([equalLater, apple], "price_asc", published).map(
    (row) => row.id,
  ),
  ["apple", "equal-later"],
  "E. equal prices keep publication order",
);

assert.deepEqual(
  viewBrowseCatalogue(
    published,
    "cream",
    EMPTY_BROWSE_FILTERS,
    ranges,
    "price_asc",
  ).map((row) => row.id),
  ["banana"],
  "F. search + sort",
);
assert.deepEqual(
  viewBrowseCatalogue(
    published,
    "cake",
    EMPTY_BROWSE_FILTERS,
    ranges,
    "name_asc",
  ).map((row) => row.id),
  ["apple", "banana", "equal-later", "zebra"],
);

assert.deepEqual(
  viewBrowseCatalogue(
    published,
    "",
    { ...EMPTY_BROWSE_FILTERS, category: legacyCakeCategoryId("specialty") },
    ranges,
    "price_desc",
  ).map((row) => row.id),
  ["banana", "apple"],
  "G. filters + sort",
);

assert.deepEqual(
  viewBrowseCatalogue(
    published,
    "a",
    { ...EMPTY_BROWSE_FILTERS, category: legacyCakeCategoryId("specialty") },
    ranges,
    "price_asc",
  ).map((row) => row.id),
  ["apple", "banana"],
  "H. search + filters + sort",
);

assert.equal(
  viewBrowseCatalogue(
    published,
    "Zebra",
    EMPTY_BROWSE_FILTERS,
    ranges,
    "name_asc",
  ).some((row) => row.id === excluded.id),
  false,
  "I. excluded cakes never appear through sort",
);

const sortedApple = sortBrowseCakes(published, "price_asc", published).find(
  (row) => row.id === "apple",
);
assert.equal(
  cakeCardPreorderLabel(sortedApple!),
  cakeCardPreorderLabel(apple),
  "J. sort does not change preorder labels",
);

assert.equal(browseSortPreorderDays(apple), 2);
assert.equal(browseSortPreorderDays(zebra), 3);
assert.equal(browseSortPreorderDays(mixedLead), 2);
assert.deepEqual(
  sortBrowseCakes(published, "preorder_asc", published).map((row) => row.id),
  ["apple", "equal-later", "zebra", "banana"],
  "N. Preorder Days low → high uses configured size lead time",
);
assert.deepEqual(
  sortBrowseCakes(published, "preorder_desc", published).map((row) => row.id),
  ["zebra", "banana", "apple", "equal-later"],
  "O. Preorder Days high → low",
);
assert.deepEqual(
  sortBrowseCakes([equalLater, apple], "preorder_asc", published).map(
    (row) => row.id,
  ),
  ["apple", "equal-later"],
  "P. equal preorder days keep publication order",
);
assert.deepEqual(
  sortBrowseCakes(
    [zebra, mixedLead, apple],
    "preorder_asc",
    [zebra, apple, banana, equalLater, mixedLead],
  ).map((row) => row.id),
  ["apple", "mixed-lead", "zebra"],
  "Q. mixed-size cake sorts by its soonest configured lead time",
);

const sortSrc = readSrc("src/workspaces/storefront/catalog/browse-sort.ts");
assert.doesNotMatch(sortSrc, /preorder-draft/);
assert.doesNotMatch(sortSrc, /sessionStorage/);
assert.doesNotMatch(sortSrc, /writePreorderDraft/);
assert.doesNotMatch(sortSrc, /evaluateCollectionDate/);
assert.doesNotMatch(sortSrc, /pickupDate/);
assert.doesNotMatch(sortSrc, /localStorage/);
assert.match(sortSrc, /preorderDays/);
assert.match(sortSrc, /preorder_asc/);

assert.deepEqual(
  viewBrowseCatalogue(
    published,
    "no-such-cake",
    EMPTY_BROWSE_FILTERS,
    ranges,
    "price_desc",
  ).map((row) => row.id),
  [],
  "L. empty result set stays empty after sort",
);

assert.deepEqual(
  viewBrowseCatalogue(
    published,
    "",
    { ...EMPTY_BROWSE_FILTERS, category: legacyCakeCategoryId("specialty") },
    ranges,
    "recommended",
  ).map((row) => row.id),
  ["apple", "banana"],
  "M. Recommended keeps relative publication order of the remaining subset",
);

const catalogueSrc = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
assert.match(catalogueSrc, /viewBrowseCatalogue/);
assert.match(catalogueSrc, /BROWSE_SORT_OPTIONS/);
assert.match(catalogueSrc, /max-w-\[18rem\]/);
assert.match(catalogueSrc, /Try adjusting your search or filters/);
assert.doesNotMatch(catalogueSrc, /writePreorderDraft/);
assert.doesNotMatch(catalogueSrc, /sessionStorage/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.doesNotMatch(collectionSrc, /browse-sort/);
assert.doesNotMatch(collectionSrc, /viewBrowseCatalogue/);

const orderSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontOrderCollectionsPage.tsx",
);
assert.doesNotMatch(orderSrc, /browse-sort/);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
const browseFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listBrowsePublishedCakes"),
  queriesSrc.indexOf("export async function getBrowsePublishedCakeById"),
);
assert.match(browseFn, /localeCompare\(b\.name, "en"\)/);

console.log("PASS storefront browse sort");
