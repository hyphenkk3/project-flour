/**
 * Customer-facing cake categories: five names, max two assignments, Browse.
 * Run: npx tsx scripts/test-customer-cake-categories.ts
 *
 * Static only. Does not mutate cakes, catalogues, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AGREED_CUSTOMER_CAKE_CATEGORY_ASSIGNMENTS,
  CAKE_CATEGORY_ASSIGNMENT_MAX,
  CUSTOMER_CAKE_CATEGORY_NAMES,
  cakeHasAnyCategoryId,
  cakeHasCategoryId,
  legacyCakeCategoryEmbed,
  omitCakeCategoryAssignmentEmbed,
  parseCakeCategoryAssignmentIds,
} from "@/engines/menu/cake-categories";
import { BROWSE_CURRENTLY_UNAVAILABLE_NOTE } from "@/engines/menu/homepage-collection-preview";
import type { StorefrontCake } from "@/types/storefront";
import { mapCake } from "@/workspaces/library/cakes/queries";
import {
  EMPTY_BROWSE_FILTERS,
  filterBrowseCakes,
} from "@/workspaces/storefront/catalog/browse-filters";
import { mapStorefrontCake } from "@/workspaces/storefront/catalog/queries";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.deepEqual(
  [...CUSTOMER_CAKE_CATEGORY_NAMES],
  ["Chocolate", "Fruit", "Tea", "Local Inspired", "Nutty"],
);
assert.equal(CAKE_CATEGORY_ASSIGNMENT_MAX, 2);
assert.equal(AGREED_CUSTOMER_CAKE_CATEGORY_ASSIGNMENTS.length, 20);

for (const row of AGREED_CUSTOMER_CAKE_CATEGORY_ASSIGNMENTS) {
  assert.ok(row.categories.length >= 1);
  assert.ok(row.categories.length <= CAKE_CATEGORY_ASSIGNMENT_MAX);
  for (const name of row.categories) {
    assert.ok(
      (CUSTOMER_CAKE_CATEGORY_NAMES as readonly string[]).includes(name),
    );
  }
}

assert.equal(
  parseCakeCategoryAssignmentIds(["a", "b", "c"]),
  `Choose up to ${CAKE_CATEGORY_ASSIGNMENT_MAX} categories.`,
);
assert.deepEqual(parseCakeCategoryAssignmentIds(["a", "a", "b"]), ["a", "b"]);
assert.deepEqual(parseCakeCategoryAssignmentIds([]), []);
assert.equal(
  cakeHasCategoryId({ categoryId: "legacy-classic", categories: [] }, "legacy-classic"),
  false,
  "empty assignments array is the source of truth",
);
assert.equal(
  cakeHasCategoryId({ categoryId: "legacy-classic" }, "legacy-classic"),
  true,
  "legacy fixtures without categories[] still resolve",
);

const mappedWithoutAssignments = mapCake({
  id: "legacy-mapped",
  name: "Legacy Mapped",
  ...legacyCakeCategoryEmbed("classic"),
  description: null,
  sharing_guide: null,
  allergens: [],
  bakery_notes: null,
  status: "active",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  library_cake_sizes: [],
});
assert.deepEqual(
  mappedWithoutAssignments.categories.map((row) => row.name),
  ["Classic"],
  "omitted assignment embed still uses category_id",
);

const mappedEmptyAssignments = mapCake({
  id: "empty-assignments",
  name: "Empty Assignments",
  ...legacyCakeCategoryEmbed("classic"),
  library_cake_category_assignments: [],
  description: null,
  sharing_guide: null,
  allergens: [],
  bakery_notes: null,
  status: "active",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  library_cake_sizes: [],
});
assert.deepEqual(
  mappedEmptyAssignments.categories,
  [],
  "present empty assignment embed does not fall back to category_id",
);

const storefrontWithoutAssignments = mapStorefrontCake({
  id: "sf-legacy",
  name: "Storefront Legacy",
  ...legacyCakeCategoryEmbed("classic"),
  status: "active",
  description: null,
  sharing_guide: null,
  allergens: [],
  library_cake_sizes: [],
  library_cake_photos: [],
});
assert.equal(storefrontWithoutAssignments.categoryName, "Classic");

const migration = readSrc(
  "supabase/migrations/20260908153000_customer_cake_categories.sql",
);
assert.match(migration, /library_cake_category_assignments/);
assert.match(migration, /grant select on table public\.library_cake_category_assignments/);
assert.match(migration, /notify pgrst/);

assert.equal(
  omitCakeCategoryAssignmentEmbed(`
  library_cake_categories (id),
  library_cake_category_assignments (
    category_id,
    sort_order,
    library_cake_categories (
      id,
      name,
      is_active,
      sort_order
    )
  ),
  library_cake_sizes (id)
`).includes("library_cake_category_assignments"),
  false,
);
assert.match(migration, /at most 2 categories/);
assert.match(migration, /'Chocolate'/);
assert.match(migration, /'Fruit'/);
assert.match(migration, /'Tea'/);
assert.match(migration, /'Local Inspired'/);
assert.match(migration, /'Nutty'/);
assert.match(migration, /is_active = false/);
assert.match(migration, /'celebration'/);
assert.match(migration, /Chocolate Strawberry/);
assert.match(migration, /Salted Peanut/);
assert.doesNotMatch(migration, /delete from public\.library_cakes/);
assert.doesNotMatch(migration, /flavour tag/i);

const remainingMigration = readSrc(
  "supabase/migrations/20260908170000_assign_remaining_customer_cake_categories.sql",
);
assert.match(
  remainingMigration,
  /Decadent Chocolate  \(Dark Chocolate, Slightly Sweeter\)/,
);
assert.match(remainingMigration, /Refreshing Lemon/);
assert.doesNotMatch(remainingMigration, /delete from public\.library_cakes/);

const chocolate = {
  id: "cat-chocolate",
  name: "Chocolate",
  isActive: true,
  sortOrder: 1,
};
const fruit = {
  id: "cat-fruit",
  name: "Fruit",
  isActive: true,
  sortOrder: 2,
};

function cake(
  id: string,
  categories: StorefrontCake["categories"],
): StorefrontCake {
  const primary = categories[0] ?? null;
  return {
    id,
    name: id,
    description: null,
    categoryId: primary?.id ?? null,
    categoryName: primary?.name ?? null,
    categoryActive: true,
    categorySortOrder: primary?.sortOrder ?? 0,
    categories,
    image: null,
    photos: [],
    sharingGuide: null,
    allergens: [],
    sizes: [
      {
        id: `${id}-6`,
        cakeId: id,
        size: '6"',
        price: 95,
        sortOrder: 1,
        preorderDays: 2,
      },
    ],
  };
}

const strawberry = cake("chocolate-strawberry", [chocolate, fruit]);
const avocado = cake("avocado", [fruit]);
const catalogue = [strawberry, avocado];

assert.equal(cakeHasCategoryId(strawberry, chocolate.id), true);
assert.equal(cakeHasCategoryId(strawberry, fruit.id), true);
assert.equal(
  cakeHasAnyCategoryId(strawberry, [chocolate.id, fruit.id]),
  true,
);
assert.deepEqual(
  filterBrowseCakes(
    catalogue,
    { ...EMPTY_BROWSE_FILTERS, category: `${chocolate.id},${fruit.id}` },
    [],
  ).map((row) => row.id),
  ["chocolate-strawberry", "avocado"],
  "multiple selected categories use OR and do not duplicate cakes",
);
assert.deepEqual(
  filterBrowseCakes(
    catalogue,
    { ...EMPTY_BROWSE_FILTERS, category: chocolate.id },
    [],
  ).map((row) => row.id),
  ["chocolate-strawberry"],
);
assert.deepEqual(
  filterBrowseCakes(
    catalogue,
    { ...EMPTY_BROWSE_FILTERS, category: fruit.id },
    [],
  ).map((row) => row.id),
  ["chocolate-strawberry", "avocado"],
);
assert.deepEqual(
  filterBrowseCakes(catalogue, EMPTY_BROWSE_FILTERS, []).map((row) => row.id),
  ["chocolate-strawberry", "avocado"],
  "All Cakes lists each cake once",
);
assert.deepEqual(
  filterBrowseCakes(
    catalogue,
    { ...EMPTY_BROWSE_FILTERS, category: chocolate.id, size: '6"' },
    [],
  ).map((row) => row.id),
  ["chocolate-strawberry"],
  "category filter still combines with size",
);
assert.equal(
  new Set(AGREED_CUSTOMER_CAKE_CATEGORY_ASSIGNMENTS.map((row) => row.cakeName))
    .size,
  AGREED_CUSTOMER_CAKE_CATEGORY_ASSIGNMENTS.length,
);

assert.equal(BROWSE_CURRENTLY_UNAVAILABLE_NOTE, "Currently unavailable");
const browseQueries = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(browseQueries, /BROWSE_CURRENTLY_UNAVAILABLE_NOTE/);
assert.match(browseQueries, /hasAssignmentEmbed/);
assert.match(browseQueries, /library_cake_category_assignments/);
assert.doesNotMatch(
  browseQueries.slice(
    browseQueries.indexOf("export async function listBrowsePublishedCakes"),
    browseQueries.indexOf("export async function getBrowsePublishedCakeById"),
  ),
  /capacity/i,
);

const formSrc = readSrc("src/workspaces/library/cakes/CakeForm.tsx");
assert.match(formSrc, /category_ids/);
assert.match(formSrc, /CAKE_CATEGORY_ASSIGNMENT_MAX/);
assert.doesNotMatch(formSrc, /name="category"/);

const browseSrc = readSrc("src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx");
assert.match(browseSrc, /All Cakes/);
assert.doesNotMatch(browseSrc, /tag_ids|Browse Tags|filter by tag/i);

const homeFiles = [
  "src/workspaces/storefront/home/HomeFreshPicksSection.tsx",
  "src/workspaces/storefront/home/HomeFeaturedCollection.tsx",
  "src/workspaces/storefront/home/HomePopularCakes.tsx",
  "src/workspaces/storefront/home/HomeBrowseAllCakes.tsx",
  "src/workspaces/storefront/home/HomeVisitFooter.tsx",
  "src/workspaces/storefront/home/StorefrontHomePage.tsx",
];
for (const rel of homeFiles) {
  assert.doesNotMatch(readSrc(rel), /See all/);
}
assert.match(readSrc("src/workspaces/storefront/home/HomeFreshPicksSection.tsx"), /View all →/);
assert.match(readSrc("src/workspaces/storefront/home/HomeFeaturedCollection.tsx"), /View all →/);
assert.match(readSrc("src/workspaces/storefront/home/HomePopularCakes.tsx"), /View all →/);

console.log("PASS customer cake categories");
