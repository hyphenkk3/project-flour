/**
 * Phase 4.2.3 — customer Browse search (client-side, publication set only).
 * Run: npx tsx scripts/test-storefront-browse-search.ts
 *
 * Static only. Does not mutate catalogues, cakes, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cakeCardPreorderLabel } from "@/workspaces/storefront/catalog/pricing";
import { filterBrowseCakesBySearch } from "@/workspaces/storefront/catalog/browse-search";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const matcha = {
  id: "matcha",
  name: "Matcha Yuzu Cake",
  description: "Soft sponge with yuzu cream.",
  sizes: [
    {
      id: "s1",
      cakeId: "matcha",
      size: '6"',
      price: 120,
      sortOrder: 0,
      preorderDays: 2,
    },
  ],
};
const pandan = {
  id: "pandan",
  name: "Pandan Mango Cake",
  description: "Fragrant pandan with mango.",
  sizes: [
    {
      id: "s2",
      cakeId: "pandan",
      size: '6"',
      price: 130,
      sortOrder: 0,
      preorderDays: 2,
    },
  ],
};
const chocolate = {
  id: "choco",
  name: "Classic Chocolate",
  description: null,
  sizes: [
    {
      id: "s3",
      cakeId: "choco",
      size: '6"',
      price: 110,
      sortOrder: 0,
      preorderDays: 3,
    },
  ],
};
const published = [matcha, pandan, chocolate];
const excluded = {
  id: "staff-only",
  name: "Matcha Hidden",
  description: "Staff-only special cake.",
};

assert.deepEqual(
  filterBrowseCakesBySearch(published, "").map((cake) => cake.id),
  ["matcha", "pandan", "choco"],
  "A. empty search keeps the full publication set",
);
assert.deepEqual(
  filterBrowseCakesBySearch(published, "   ").map((cake) => cake.id),
  ["matcha", "pandan", "choco"],
  "A. whitespace-only search keeps the full publication set",
);

assert.deepEqual(
  filterBrowseCakesBySearch(published, "matcha").map((cake) => cake.id),
  ["matcha"],
  "B. case-insensitive name search",
);
assert.deepEqual(
  filterBrowseCakesBySearch(published, "MATCHA").map((cake) => cake.id),
  ["matcha"],
);

assert.deepEqual(
  filterBrowseCakesBySearch(published, "pandan man").map((cake) => cake.id),
  ["pandan"],
  "C. partial name search",
);

assert.deepEqual(
  filterBrowseCakesBySearch(published, "yuzu cream").map((cake) => cake.id),
  ["matcha"],
  "D. description-only term matches",
);

assert.deepEqual(
  filterBrowseCakesBySearch(published, "red velvet").map((cake) => cake.id),
  [],
  "E. unmatched query returns zero cakes",
);

assert.deepEqual(
  filterBrowseCakesBySearch(published, "  Matcha  ").map((cake) => cake.id),
  ["matcha"],
  "F. leading/trailing whitespace is trimmed",
);

assert.equal(
  filterBrowseCakesBySearch(published, "Hidden").some(
    (cake) => cake.id === excluded.id,
  ),
  false,
  "G. excluded cakes cannot appear via search",
);
assert.deepEqual(
  filterBrowseCakesBySearch(published, "Matcha Hidden").map((cake) => cake.id),
  [],
);

const afterSearch = filterBrowseCakesBySearch(published, "chocolate")[0];
assert.equal(afterSearch?.id, "choco");
assert.equal(
  cakeCardPreorderLabel(afterSearch!),
  cakeCardPreorderLabel(chocolate),
  "H. search does not change preorder display data",
);

const searchSrc = readSrc("src/workspaces/storefront/catalog/browse-search.ts");
assert.doesNotMatch(searchSrc, /preorder-draft/);
assert.doesNotMatch(searchSrc, /sessionStorage/);
assert.doesNotMatch(searchSrc, /writePreorderDraft/);
assert.doesNotMatch(searchSrc, /preorderDays/);
assert.doesNotMatch(searchSrc, /startingPrice/);

const catalogueSrc = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
assert.match(catalogueSrc, /viewBrowseCatalogue/);
assert.match(catalogueSrc, /StorefrontCakeCard/);
assert.match(catalogueSrc, /cakeCardPreorderLabel|availabilityNote/);
assert.match(catalogueSrc, /htmlFor=\{searchId\}/);
assert.match(catalogueSrc, /Clear search/);
assert.match(catalogueSrc, /No cakes found/);
assert.doesNotMatch(catalogueSrc, /writePreorderDraft/);
assert.doesNotMatch(catalogueSrc, /sessionStorage/);
assert.doesNotMatch(catalogueSrc, /searchParams/);
assert.doesNotMatch(catalogueSrc, /localStorage/);

const browseSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
);
assert.match(browseSrc, /listBrowsePublishedCakes/);
assert.match(browseSrc, /BrowseCakeCatalogue/);
assert.doesNotMatch(browseSrc, /writePreorderDraft/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.doesNotMatch(collectionSrc, /BrowseCakeCatalogue/);
assert.doesNotMatch(collectionSrc, /filterBrowseCakesBySearch/);

const orderSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontOrderCollectionsPage.tsx",
);
assert.doesNotMatch(orderSrc, /BrowseCakeCatalogue/);
assert.doesNotMatch(orderSrc, /filterBrowseCakesBySearch/);

const cardSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeCard.tsx",
);
assert.match(cardSrc, /cakeCardPreorderLabel/);

console.log("PASS storefront browse search");
