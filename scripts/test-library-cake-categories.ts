/**
 * Cake category master list: migration, editor, Browse, and permissions.
 * Run: npx tsx scripts/test-library-cake-categories.ts
 *
 * Static only. Does not mutate cakes, catalogues, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGACY_LIBRARY_CAKE_CATEGORIES,
  activeCakeCategories,
  browseCategoryOptionsFromCakes,
  cakeEditorCategoryOptions,
  categoryNameConflicts,
  legacyCakeCategoryFields,
  legacyCakeCategoryId,
  moveCakeCategoryInOrder,
  normalizeCakeCategoryName,
  sortCakeCategories,
} from "@/engines/menu/cake-categories";
import { canManageLibrary } from "@/foundation/navigation/access";
import type { StorefrontCake } from "@/types/storefront";
import { filterLibraryCakes } from "@/workspaces/library/cakes/directory-view";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const migration = readSrc(
  "supabase/migrations/20260905120000_library_cake_categories.sql",
);

assert.match(migration, /create table public\.library_cake_categories/);
assert.match(migration, /is_active boolean not null default true/);
assert.match(migration, /sort_order integer not null/);
assert.match(migration, /created_at timestamptz/);
assert.match(migration, /updated_at timestamptz/);
assert.match(migration, /'Celebration'/);
assert.match(migration, /'Classic'/);
assert.match(migration, /'Seasonal'/);
assert.match(migration, /'Specialty'/);
assert.match(migration, /'Other'/);
assert.match(migration, /add column category_id/);
assert.match(migration, /on delete restrict/);
assert.match(migration, /drop column category/);
assert.match(migration, /drop type public\.library_cake_category/);
assert.doesNotMatch(migration, /delete from public\.library_cakes/);
assert.doesNotMatch(
  migration,
  /on delete cascade[\s\S]*library_cake_categories/,
);

assert.deepEqual(
  LEGACY_LIBRARY_CAKE_CATEGORIES.map((row) => row.name),
  ["Celebration", "Classic", "Seasonal", "Specialty", "Other"],
);

const celebration = {
  id: legacyCakeCategoryId("celebration"),
  name: "Celebration",
  isActive: true,
  sortOrder: 1,
};
const classic = {
  id: legacyCakeCategoryId("classic"),
  name: "Classic",
  isActive: true,
  sortOrder: 2,
};
const seasonal = {
  id: legacyCakeCategoryId("seasonal"),
  name: "Seasonal",
  isActive: true,
  sortOrder: 3,
};
const specialty = {
  id: legacyCakeCategoryId("specialty"),
  name: "Specialty",
  isActive: false,
  sortOrder: 4,
};
const other = {
  id: legacyCakeCategoryId("other"),
  name: "Other",
  isActive: true,
  sortOrder: 5,
};
const wedding = {
  id: "cat-wedding",
  name: "Wedding",
  isActive: true,
  sortOrder: 6,
};

const master = [other, specialty, seasonal, classic, celebration];
assert.deepEqual(
  sortCakeCategories(master).map((row) => row.name),
  ["Celebration", "Classic", "Seasonal", "Specialty", "Other"],
  "active categories load in configured sort order",
);
assert.deepEqual(
  activeCakeCategories(sortCakeCategories(master)).map((row) => row.name),
  ["Celebration", "Classic", "Seasonal", "Other"],
  "inactive categories are excluded from active lists",
);

const editorCreate = cakeEditorCategoryOptions(master);
assert.deepEqual(
  editorCreate.map((row) => row.name),
  ["Celebration", "Classic", "Seasonal", "Other"],
);
const editorExistingInactive = cakeEditorCategoryOptions(
  master,
  specialty.id,
);
assert.equal(
  editorExistingInactive.some((row) => row.id === specialty.id),
  true,
  "existing inactive assignment remains selectable",
);
assert.equal(
  editorExistingInactive.find((row) => row.id === specialty.id)?.isActive,
  false,
);

const withWedding = cakeEditorCategoryOptions([...master, wedding]);
assert.equal(
  withWedding.some((row) => row.id === wedding.id),
  true,
  "new category becomes available in cake editor",
);

const renamed = master.map((row) =>
  row.id === classic.id ? { ...row, name: "Everyday" } : row,
);
const banana = {
  id: "banana",
  name: "Banana",
  ...legacyCakeCategoryFields("classic"),
  categoryName: "Everyday",
  description: null,
  sharingGuide: null,
  allergens: [] as string[],
  bakeryNotes: null,
  status: "active" as const,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  sizes: [],
};
assert.equal(banana.categoryId, classic.id);
assert.deepEqual(
  filterLibraryCakes([banana], { category: classic.id }).map((row) => row.id),
  ["banana"],
  "renaming a category preserves cake assignments",
);
assert.equal(categoryNameConflicts(renamed, "Everyday", classic.id), false);
assert.equal(categoryNameConflicts(renamed, "Seasonal"), true);

const deactivatedAssignment = {
  ...banana,
  categoryActive: false,
  categoryId: specialty.id,
  categoryName: "Specialty",
};
assert.equal(deactivatedAssignment.categoryId, specialty.id);
assert.deepEqual(
  filterLibraryCakes([deactivatedAssignment], { category: specialty.id }).map(
    (row) => row.id,
  ),
  ["banana"],
  "deactivating a category does not orphan assigned cakes",
);

function storefront(
  id: string,
  slug: "classic" | "seasonal" | "specialty",
  active = true,
): StorefrontCake {
  const fields = legacyCakeCategoryFields(slug);
  return {
    id,
    name: id,
    description: null,
    ...fields,
    categoryActive: active,
    image: null,
    photos: [],
    sharingGuide: null,
    allergens: [],
    sizes: [
      {
        id: `${id}-6`,
        cakeId: id,
        size: '6"',
        price: 120,
        sortOrder: 0,
        preorderDays: 2,
      },
    ],
  };
}

const browseCakes = [
  storefront("a", "seasonal"),
  storefront("b", "classic"),
  storefront("c", "specialty", false),
];
assert.deepEqual(
  browseCategoryOptionsFromCakes(browseCakes).map((row) => row.label),
  ["Classic", "Seasonal"],
  "inactive categories are excluded from customer Browse",
);
assert.equal(
  browseCategoryOptionsFromCakes(browseCakes).some(
    (row) => row.value === legacyCakeCategoryId("specialty"),
  ),
  false,
);

const reordered = moveCakeCategoryInOrder(
  [classic, seasonal].map((row) => ({ ...row })),
  classic.id,
  1,
);
assert.deepEqual(
  reordered.map((row) => row.name),
  ["Seasonal", "Classic"],
);
const reorderedBrowse = [
  {
    ...storefront("a", "seasonal"),
    categorySortOrder: reordered.find((row) => row.id === seasonal.id)!.sortOrder,
  },
  {
    ...storefront("b", "classic"),
    categorySortOrder: reordered.find((row) => row.id === classic.id)!.sortOrder,
  },
];
assert.deepEqual(
  browseCategoryOptionsFromCakes(reorderedBrowse).map((row) => row.label),
  ["Seasonal", "Classic"],
  "reordering changes Browse category order",
);

assert.equal(normalizeCakeCategoryName("  Wedding  cake  "), "Wedding cake");
assert.equal(normalizeCakeCategoryName("   "), null);

assert.equal(canManageLibrary("owner"), true);
assert.equal(canManageLibrary("manager"), true);
assert.equal(canManageLibrary("bakery"), false);
assert.equal(canManageLibrary("customer_operations"), false);

const categoryActionsSrc = readSrc(
  "src/workspaces/library/cakes/category-actions.ts",
);
assert.match(categoryActionsSrc, /canManageLibrary/);
assert.match(categoryActionsSrc, /createCakeCategoryAction/);
assert.match(categoryActionsSrc, /renameCakeCategoryAction/);
assert.match(categoryActionsSrc, /setCakeCategoryActiveAction/);
assert.match(categoryActionsSrc, /moveCakeCategoryAction/);
assert.doesNotMatch(categoryActionsSrc, /canManageCakePhotos/);
assert.doesNotMatch(categoryActionsSrc, /\.delete\(/);

const categoriesPageSrc = readSrc(
  "src/app/(app)/library/cakes/categories/page.tsx",
);
assert.match(categoriesPageSrc, /canManageLibrary/);
assert.match(categoriesPageSrc, /redirect\("\/home"\)/);
assert.match(categoriesPageSrc, /CakeCategoryManager/);

const cakesPageSrc = readSrc("src/app/(app)/library/cakes/page.tsx");
assert.match(cakesPageSrc, /Manage categories/);
assert.match(cakesPageSrc, /canManage/);

const formSrc = readSrc("src/workspaces/library/cakes/CakeForm.tsx");
assert.match(formSrc, /cakeEditorCategoryOptions/);
assert.match(formSrc, /categories/);
assert.doesNotMatch(formSrc, /LIBRARY_CAKE_CATEGORIES/);
assert.doesNotMatch(formSrc, /celebration/);
assert.doesNotMatch(formSrc, /createCakeCategoryAction/);
assert.match(formSrc, /inactive/);

const filterSrc = readSrc("src/workspaces/storefront/catalog/browse-filters.ts");
assert.match(filterSrc, /browseCategoryOptionsFromCakes/);
assert.doesNotMatch(filterSrc, /LIBRARY_CAKE_CATEGORIES/);
assert.doesNotMatch(filterSrc, /celebration/);
assert.doesNotMatch(filterSrc, /classic/);
assert.doesNotMatch(filterSrc, /seasonal/);
assert.doesNotMatch(filterSrc, /specialty/);

const labelsSrc = readSrc("src/workspaces/library/labels.ts");
assert.doesNotMatch(labelsSrc, /LIBRARY_CAKE_CATEGORIES/);
assert.doesNotMatch(labelsSrc, /case "celebration"/);

const cakeActionsSrc = readSrc("src/workspaces/library/cakes/actions.ts");
assert.match(cakeActionsSrc, /category_id/);
assert.match(cakeActionsSrc, /listCakeCategories/);
assert.doesNotMatch(cakeActionsSrc, /LIBRARY_CAKE_CATEGORIES/);

console.log("PASS library cake categories");
