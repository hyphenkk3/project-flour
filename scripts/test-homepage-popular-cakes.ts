/**
 * Owner-curated homepage Popular Cakes.
 * Run: npx tsx scripts/test-homepage-popular-cakes.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cakeMayBeSelectedForPopularCakes,
  comparePopularCakesOrder,
  nextPopularCakesSortOrder,
  parsePopularCakesSortOrder,
  sortHomepagePopularCakes,
} from "@/engines/menu/homepage-popular-cakes";
import {
  canManageLibrary,
  canViewLibrary,
} from "@/foundation/navigation/access";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.equal(cakeMayBeSelectedForPopularCakes({ status: "seasonal" }), true);
assert.equal(cakeMayBeSelectedForPopularCakes({ status: "active" }), true);
assert.equal(cakeMayBeSelectedForPopularCakes({ status: "draft" }), true);
assert.equal(
  cakeMayBeSelectedForPopularCakes({ categoryName: "Local Delight" }),
  true,
);
assert.equal(
  cakeMayBeSelectedForPopularCakes({ categoryName: "September Collection" }),
  true,
);

assert.equal(nextPopularCakesSortOrder([]), 1);
assert.equal(nextPopularCakesSortOrder([1, 3]), 4);
assert.equal(nextPopularCakesSortOrder([null, 2]), 3);

assert.equal(parsePopularCakesSortOrder(""), null);
assert.equal(parsePopularCakesSortOrder("1"), 1);
assert.equal(parsePopularCakesSortOrder(" 4 "), 4);
assert.match(String(parsePopularCakesSortOrder("0")), /whole number/);
assert.match(String(parsePopularCakesSortOrder("1.5")), /whole number/);

const ordered = sortHomepagePopularCakes([
  {
    id: "b",
    name: "Pistachio Raspberry",
    showInPopularCakes: true,
    popularCakesSortOrder: 2,
  },
  {
    id: "skip",
    name: "Not selected",
    showInPopularCakes: false,
    popularCakesSortOrder: 1,
  },
  {
    id: "a",
    name: "Matcha Caramel Miso",
    showInPopularCakes: true,
    popularCakesSortOrder: 1,
  },
  {
    id: "d",
    name: "Earl Grey Pistachio",
    showInPopularCakes: true,
    popularCakesSortOrder: 4,
  },
  {
    id: "c",
    name: "Apam Balik",
    showInPopularCakes: true,
    popularCakesSortOrder: 3,
  },
]);
assert.deepEqual(
  ordered.map((cake) => cake.name),
  [
    "Matcha Caramel Miso",
    "Pistachio Raspberry",
    "Apam Balik",
    "Earl Grey Pistachio",
  ],
);

const duplicateOrder = sortHomepagePopularCakes([
  {
    id: "z",
    name: "Zebra",
    showInPopularCakes: true,
    popularCakesSortOrder: 1,
  },
  {
    id: "a",
    name: "Apple",
    showInPopularCakes: true,
    popularCakesSortOrder: 1,
  },
]);
assert.deepEqual(
  duplicateOrder.map((cake) => cake.name),
  ["Apple", "Zebra"],
);

const missingOrder = sortHomepagePopularCakes([
  {
    id: "later",
    name: "Later",
    showInPopularCakes: true,
    popularCakesSortOrder: null,
  },
  {
    id: "first",
    name: "First",
    showInPopularCakes: true,
    popularCakesSortOrder: 1,
  },
]);
assert.deepEqual(
  missingOrder.map((cake) => cake.id),
  ["first", "later"],
);

assert.deepEqual(sortHomepagePopularCakes([]), []);

assert.equal(comparePopularCakesOrder(missingOrder[0]!, missingOrder[0]!), 0);

assert.equal(canManageLibrary("owner"), true);
assert.equal(canManageLibrary("manager"), true);
assert.equal(canManageLibrary("bakery"), false);
assert.equal(canManageLibrary("customer_operations"), false);
assert.equal(canViewLibrary("bakery"), true);
assert.equal(canViewLibrary("customer_operations"), true);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queriesSrc, /show_in_popular_cakes/);
assert.match(queriesSrc, /comparePopularCakesOrder/);
assert.match(queriesSrc, /\.eq\("show_in_popular_cakes", true\)/);
assert.doesNotMatch(queriesSrc, /HOMEPAGE_POPULAR_CAKE_LIMIT/);
assert.doesNotMatch(queriesSrc, /HOMEPAGE_POPULAR_SCAN_LIMIT/);
assert.doesNotMatch(
  queriesSrc.slice(
    queriesSrc.indexOf("export async function listHomepagePopularCakes"),
  ),
  /from\("collection_cakes"\)/,
);

const formSrc = readSrc("src/workspaces/library/cakes/CakeForm.tsx");
assert.match(formSrc, /Show in Popular Cakes/);
assert.match(formSrc, /name="show_in_popular_cakes"/);
assert.match(formSrc, /Popular Cakes order/);
assert.match(formSrc, /name="popular_cakes_sort_order"/);
assert.match(formSrc, /Seasonal and limited cakes may be included/);

const actionsSrc = readSrc("src/workspaces/library/cakes/actions.ts");
assert.match(actionsSrc, /canManageLibrary/);
assert.match(actionsSrc, /show_in_popular_cakes/);
assert.match(actionsSrc, /popular_cakes_sort_order/);
assert.match(actionsSrc, /revalidatePath\("\/"\)/);

const detailSrc = readSrc("src/app/(app)/library/cakes/[id]/page.tsx");
assert.match(detailSrc, /Popular Cakes/);
assert.match(detailSrc, /showInPopularCakes/);

const popularSrc = readSrc(
  "src/workspaces/storefront/home/HomePopularCakes.tsx",
);
assert.match(popularSrc, /Popular Cakes/);
assert.match(popularSrc, /href="\/browse"/);
assert.match(popularSrc, /overflow-hidden rounded-\[10px\]/);
assert.doesNotMatch(popularSrc, /return null/);

const migrationSrc = readSrc(
  "supabase/migrations/20260907120000_library_cakes_popular_cakes.sql",
);
assert.match(
  migrationSrc,
  /show_in_popular_cakes boolean not null default false/,
);
assert.match(migrationSrc, /popular_cakes_sort_order integer/);
assert.match(migrationSrc, /library_cakes_public_select_popular_cakes/);
assert.doesNotMatch(
  migrationSrc,
  /drop policy if exists library_cakes_public_select_in_active_collection/,
);
assert.doesNotMatch(migrationSrc, /count\(\*\)/);
assert.doesNotMatch(migrationSrc, /order_items/);

console.log("PASS homepage Popular Cakes owner curation");
