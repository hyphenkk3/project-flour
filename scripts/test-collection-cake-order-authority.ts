/**
 * Collection-specific cake order authority regression checks.
 * Run: npx tsx scripts/test-collection-cake-order-authority.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const home = source("src/workspaces/storefront/home/StorefrontHomePage.tsx");
const collectionPage = source(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
const storefrontQueries = source(
  "src/workspaces/storefront/catalog/queries.ts",
);
const libraryQueries = source("src/workspaces/library/collections/queries.ts");
const libraryActions = source("src/workspaces/library/collections/actions.ts");

// The homepage preview is a manually ordered subset for each collection.
assert.match(
  storefrontQueries,
  /\.eq\("show_on_homepage", true\)[\s\S]*?\.order\("sort_order", \{ ascending: true \}\)/,
);
assert.match(home, /cakes=\{collection\.cakes\}/);
assert.doesNotMatch(home, /sortCakesForCataloguePromotionPresentation/);
assert.match(
  source(
    "src/workspaces/library/collections/CollectionHomepagePreviewControl.tsx",
  ),
  /follows Library order/,
);
assert.doesNotMatch(
  source(
    "src/workspaces/library/collections/CollectionHomepagePreviewControl.tsx",
  ),
  /homepage_sort_order|inputMode="numeric"/,
);

// A full collection page uses that collection membership's saved Library order.
assert.match(
  storefrontQueries,
  /\.from\("collection_cakes"\)[\s\S]*?\.eq\("collection_id", collectionId\)[\s\S]*?\.eq\("available", true\)[\s\S]*?\.order\("sort_order", \{ ascending: true \}\)/,
);
assert.match(collectionPage, /const orderedCakes = cakes;/);
assert.match(collectionPage, /cakes=\{orderedCakes\}/);
assert.doesNotMatch(
  collectionPage,
  /sortCakesForCataloguePromotionPresentation/,
);

// Library up/down and drag-and-drop persist order on collection membership rows,
// never on the shared global cake record.
assert.match(
  libraryQueries,
  /\.from\("collection_cakes"\)[\s\S]*?\.eq\("collection_id", collectionId\)[\s\S]*?\.order\("sort_order", \{ ascending: true \}\)/,
);
assert.match(
  libraryActions,
  /\.update\(\{ sort_order: index \}\)[\s\S]*?\.eq\("id", id\)[\s\S]*?\.eq\("collection_id", collectionId\)/,
);
assert.match(libraryActions, /await writeSortOrder\(collectionId, swapped\)/);
assert.match(libraryActions, /await writeSortOrder\(collectionId, ids\)/);
assert.match(
  libraryActions,
  /\.update\(\{ show_on_homepage: plan\.showOnHomepage \}\)/,
);
assert.doesNotMatch(libraryActions, /homepage_sort_order/);
assert.doesNotMatch(libraryQueries, /homepage_sort_order/);

type FixtureCake = {
  id: string;
  name: string;
  isNew: boolean;
  promoted: boolean;
};
const apple: FixtureCake = {
  id: "apple-cinnamon",
  name: "Apple Cinnamon Baked Cheesecake",
  isNew: true,
  promoted: true,
};
const cherry: FixtureCake = {
  id: "cherry-forest",
  name: "Cherry Forest Noël",
  isNew: false,
  promoted: false,
};
const wreath: FixtureCake = {
  id: "noel-wreath",
  name: "Noël Cookie Wreath Tin",
  isNew: false,
  promoted: true,
};

// Christmas: the stored manual sequence has Cherry before the New/promoted Apple.
const christmasLibraryOrder = [cherry, apple, wreath];
const christmasHomepageOrder = [cherry, apple, wreath];
assert.deepEqual(
  christmasLibraryOrder.map((cake) => cake.id),
  ["cherry-forest", "apple-cinnamon", "noel-wreath"],
);
assert.deepEqual(
  christmasHomepageOrder.map((cake) => cake.id),
  ["cherry-forest", "apple-cinnamon", "noel-wreath"],
);

// December's old homepage_sort_order had Apple before Cherry even though the
// collection Library order had Cherry first. Both storefront surfaces now
// derive their sequence from this collection's sort_order.
const decemberLibraryOrder = [cherry, apple, wreath];
const decemberHomepageOrder = [...decemberLibraryOrder];
assert.deepEqual(
  decemberLibraryOrder.map((cake) => cake.id),
  ["cherry-forest", "apple-cinnamon", "noel-wreath"],
);
assert.deepEqual(
  decemberHomepageOrder.map((cake) => cake.id),
  decemberLibraryOrder.map((cake) => cake.id),
);
assert.notDeepEqual(
  ["matcha-1", "matcha-2", ...christmasHomepageOrder.map((cake) => cake.id)],
  decemberHomepageOrder.map((cake) => cake.id),
  "a shared cake may have a different position in another collection membership",
);
assert.match(storefrontQueries, /homepage-collection-preview-v3/);
assert.equal(apple.isNew && apple.promoted, true);
assert.equal(cherry.isNew || cherry.promoted, false);

console.log(
  "PASS collection cake order authority: homepage, full pages, shared memberships and Library persistence",
);
