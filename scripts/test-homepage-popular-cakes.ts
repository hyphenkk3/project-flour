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
  planPopularCakesChange,
  popularCakesPosition,
  POPULAR_CAKES_MAX_SELECTION,
  POPULAR_CAKES_MAX_SELECTION_MESSAGE,
  sortHomepagePopularCakes,
  type PopularCakesSortable,
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
assert.equal(parsePopularCakesSortOrder("5"), 5);
assert.equal(parsePopularCakesSortOrder("6"), 6);
assert.equal(parsePopularCakesSortOrder("10"), 10);
assert.match(String(parsePopularCakesSortOrder("0")), /whole number/);
assert.match(String(parsePopularCakesSortOrder("1.5")), /whole number/);
assert.match(String(parsePopularCakesSortOrder("11")), /1 to 10/);
assert.equal(POPULAR_CAKES_MAX_SELECTION, 10);
assert.equal(
  POPULAR_CAKES_MAX_SELECTION_MESSAGE,
  "You can feature up to 10 cakes in Popular Cakes. Remove one before adding another.",
);

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

function popularCake(
  id: string,
  order: number | null,
  show = true,
): PopularCakesSortable {
  return {
    id,
    name: id,
    showInPopularCakes: show,
    popularCakesSortOrder: order,
  };
}

assert.equal(
  cakeMayBeSelectedForPopularCakes({ status: "seasonal" }),
  true,
);
assert.equal(
  cakeMayBeSelectedForPopularCakes({ categoryName: "Limited" }),
  true,
);

const firstSelect = planPopularCakesChange({
  selected: [],
  cake: popularCake("seasonal", null, false),
  showInPopularCakes: true,
  requestedOrder: null,
});
assert.equal(firstSelect.ok, true);
if (firstSelect.ok) {
  assert.deepEqual(firstSelect.updates, [
    {
      id: "seasonal",
      showInPopularCakes: true,
      popularCakesSortOrder: 1,
    },
  ]);
}

const limitedSelect = planPopularCakesChange({
  selected: [popularCake("seasonal", 1)],
  cake: popularCake("limited", null, false),
  showInPopularCakes: true,
  requestedOrder: null,
});
assert.equal(limitedSelect.ok, true);
if (limitedSelect.ok) {
  assert.deepEqual(
    limitedSelect.updates.map((row) => [row.id, row.popularCakesSortOrder]),
    [
      ["seasonal", 1],
      ["limited", 2],
    ],
  );
}

const selectedFive = [1, 2, 3, 4, 5].map((order) =>
  popularCake(`cake-${order}`, order),
);
const sixth = planPopularCakesChange({
  selected: selectedFive,
  cake: popularCake("cake-6", null, false),
  showInPopularCakes: true,
  requestedOrder: null,
});
assert.equal(sixth.ok, true);
if (sixth.ok) {
  assert.deepEqual(
    sixth.updates.map((row) => [row.id, row.popularCakesSortOrder]),
    [
      ["cake-1", 1],
      ["cake-2", 2],
      ["cake-3", 3],
      ["cake-4", 4],
      ["cake-5", 5],
      ["cake-6", 6],
    ],
  );
}

const selectedTen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((order) =>
  popularCake(`cake-${order}`, order),
);
const eleventh = planPopularCakesChange({
  selected: selectedTen,
  cake: popularCake("cake-11", null, false),
  showInPopularCakes: true,
  requestedOrder: null,
});
assert.equal(eleventh.ok, false);
if (!eleventh.ok) {
  assert.equal(eleventh.error, POPULAR_CAKES_MAX_SELECTION_MESSAGE);
}

const deselectSecond = planPopularCakesChange({
  selected: [
    popularCake("a", 1),
    popularCake("b", 2),
    popularCake("c", 3),
  ],
  cake: popularCake("b", 2),
  showInPopularCakes: false,
  requestedOrder: null,
});
assert.equal(deselectSecond.ok, true);
if (deselectSecond.ok) {
  assert.deepEqual(
    deselectSecond.updates.map((row) => [
      row.id,
      row.showInPopularCakes,
      row.popularCakesSortOrder,
    ]),
    [
      ["b", false, null],
      ["a", true, 1],
      ["c", true, 2],
    ],
  );
}

const moveToFirst = planPopularCakesChange({
  selected: [
    popularCake("a", 1),
    popularCake("b", 2),
    popularCake("c", 3),
  ],
  cake: popularCake("c", 3),
  showInPopularCakes: true,
  requestedOrder: 1,
});
assert.equal(moveToFirst.ok, true);
if (moveToFirst.ok) {
  assert.deepEqual(
    moveToFirst.updates.map((row) => [row.id, row.popularCakesSortOrder]),
    [
      ["c", 1],
      ["a", 2],
      ["b", 3],
    ],
  );
}

const resolveDuplicate = planPopularCakesChange({
  selected: [popularCake("zebra", 1), popularCake("apple", 1)],
  cake: popularCake("apple", 1),
  showInPopularCakes: true,
  requestedOrder: 1,
});
assert.equal(resolveDuplicate.ok, true);
if (resolveDuplicate.ok) {
  assert.deepEqual(
    resolveDuplicate.updates.map((row) => [
      row.id,
      row.popularCakesSortOrder,
    ]),
    [
      ["apple", 1],
      ["zebra", 2],
    ],
  );
}

assert.equal(popularCakesPosition(selectedFive, "cake-3"), 3);
assert.equal(popularCakesPosition(selectedFive, "missing"), null);
assert.equal(popularCakesPosition(selectedTen, "cake-10"), 10);

const leaveUnselected = planPopularCakesChange({
  selected: [popularCake("a", 1)],
  cake: popularCake("b", null, false),
  showInPopularCakes: false,
  requestedOrder: null,
});
assert.equal(leaveUnselected.ok, true);
if (leaveUnselected.ok) {
  assert.deepEqual(leaveUnselected.updates, [
    {
      id: "b",
      showInPopularCakes: false,
      popularCakesSortOrder: null,
    },
  ]);
}

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
assert.doesNotMatch(queriesSrc, /POPULAR_CAKES_MAX_SELECTION/);
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
assert.match(formSrc, /Up to \$\{POPULAR_CAKES_MAX_SELECTION\} cakes/);

const actionsSrc = readSrc("src/workspaces/library/cakes/actions.ts");
assert.match(actionsSrc, /canManageLibrary/);
assert.match(actionsSrc, /show_in_popular_cakes/);
assert.match(actionsSrc, /popular_cakes_sort_order/);
assert.match(actionsSrc, /revalidatePath\("\/"\)/);
assert.match(actionsSrc, /updateCakePopularCakesFromLibraryAction/);
assert.match(actionsSrc, /planPopularCakesChange/);
assert.match(actionsSrc, /requireLibraryStaff/);
assert.doesNotMatch(actionsSrc, /owner-id|manager-id|user_id ===/);

const detailSrc = readSrc("src/app/(app)/library/cakes/[id]/page.tsx");
assert.match(detailSrc, /Popular Cakes/);
assert.match(detailSrc, /showInPopularCakes/);

const directorySrc = readSrc(
  "src/workspaces/library/cakes/CakeDirectory.tsx",
);
assert.match(directorySrc, /CakePopularCakesControl/);
assert.match(directorySrc, /canManage/);
assert.match(directorySrc, /library-cake-popular/);
assert.match(directorySrc, /sm:grid-cols-2/);

const controlSrc = readSrc(
  "src/workspaces/library/cakes/CakePopularCakesControl.tsx",
);
assert.match(controlSrc, /Show in Popular Cakes/);
assert.match(controlSrc, /Not shown/);
assert.match(controlSrc, /Popular · #/);
assert.match(controlSrc, /updateCakePopularCakesFromLibraryAction/);
assert.match(controlSrc, /canManage/);
assert.match(controlSrc, /POPULAR_CAKES_MAX_SELECTION/);

const popularSrc = readSrc(
  "src/workspaces/storefront/home/HomePopularCakes.tsx",
);
assert.match(popularSrc, /Popular Cakes/);
assert.match(popularSrc, /formatHomepagePrice/);
assert.match(popularSrc, /href="\/browse"/);
assert.match(popularSrc, /overflow-hidden rounded-\[10px\]/);
assert.match(popularSrc, /mx-auto w-full max-w-6xl/);
assert.match(popularSrc, /w-24 shrink-0 lg:w-\[10\.5rem\]/);
assert.match(popularSrc, /h-24 w-24/);
assert.match(popularSrc, /lg:h-\[10\.5rem\] lg:w-\[10\.5rem\]/);
assert.match(popularSrc, /sm:px-10/);
assert.match(popularSrc, /sm:-mx-10 lg:mx-0/);
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
