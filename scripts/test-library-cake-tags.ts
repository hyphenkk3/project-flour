/**
 * Cake merchandising tags: seed names, Library management, card display.
 * Run: npx tsx scripts/test-library-cake-tags.ts
 *
 * Static only. Does not mutate cakes, catalogues, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AGREED_CUSTOMER_CAKE_TAG_ASSIGNMENTS,
  SEEDED_CAKE_TAG_NAMES,
  cakeEditorTagOptions,
  customerFacingCakeTags,
  formatCakeTagNames,
  moveCakeTagInOrder,
  normalizeCakeTagName,
  omitCakeTagAssignmentEmbed,
  parseCakeTagAssignmentIds,
  tagNameConflicts,
} from "@/engines/menu/cake-tags";
import { canManageLibrary } from "@/foundation/navigation/access";
import { storefrontTagLabel } from "@/workspaces/storefront/catalog/pricing";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.deepEqual(
  [...SEEDED_CAKE_TAG_NAMES],
  ["New!", "Popular", "Back Again", "Seasonal", "Limited"],
);
assert.deepEqual(AGREED_CUSTOMER_CAKE_TAG_ASSIGNMENTS, [
  { cakeName: "Avocado", tags: ["Limited"] },
  { cakeName: "Japanese Strawberry", tags: ["Limited"] },
]);

const limited = {
  id: "tag-limited",
  name: "Limited",
  isActive: true,
  sortOrder: 5,
};
const popular = {
  id: "tag-popular",
  name: "Popular",
  isActive: true,
  sortOrder: 2,
};
const backAgain = {
  id: "tag-back",
  name: "Back Again",
  isActive: false,
  sortOrder: 3,
};

assert.equal(normalizeCakeTagName("  New!  "), "New!");
assert.equal(normalizeCakeTagName("   "), null);
assert.deepEqual(parseCakeTagAssignmentIds(["a", "a", "b", "c"]), ["a", "b", "c"]);
assert.deepEqual(parseCakeTagAssignmentIds([]), []);
assert.equal(tagNameConflicts([limited, popular], "limited"), true);
assert.equal(tagNameConflicts([limited], "Limited", limited.id), false);

const editor = cakeEditorTagOptions([limited, popular, backAgain]);
assert.deepEqual(
  editor.map((row) => row.name),
  ["Popular", "Limited"],
);
assert.equal(
  cakeEditorTagOptions([limited, popular, backAgain], backAgain.id).some(
    (row) => row.id === backAgain.id,
  ),
  true,
  "existing inactive assignment remains selectable",
);

const reordered = moveCakeTagInOrder([popular, limited], limited.id, -1);
assert.deepEqual(
  reordered.map((row) => row.name),
  ["Limited", "Popular"],
);

assert.equal(
  formatCakeTagNames([limited, popular, backAgain]),
  "Popular · Limited",
);
assert.equal(
  formatCakeTagNames([limited, popular, backAgain], { includeInactive: true }),
  "Popular · Back Again · Limited",
);
assert.deepEqual(
  customerFacingCakeTags([limited, backAgain, popular]).map((row) => row.name),
  ["Popular", "Limited"],
);
assert.equal(
  storefrontTagLabel({ tags: [limited, backAgain, popular] }),
  "Popular · Limited",
);
assert.equal(storefrontTagLabel({ tags: [backAgain] }), null);

assert.equal(canManageLibrary("owner"), true);
assert.equal(canManageLibrary("manager"), true);
assert.equal(canManageLibrary("bakery"), false);
assert.equal(canManageLibrary("customer_operations"), false);

const migration = readSrc(
  "supabase/migrations/20260911090000_library_cake_tags.sql",
);
assert.match(migration, /create table public\.library_cake_tags/);
assert.match(migration, /create table public\.library_cake_tag_assignments/);
assert.match(migration, /library_cake_tags_name_ci_idx/);
assert.match(migration, /'New!'/);
assert.match(migration, /'Popular'/);
assert.match(migration, /'Back Again'/);
assert.match(migration, /'Seasonal'/);
assert.match(migration, /'Limited'/);
assert.match(migration, /Avocado/);
assert.match(migration, /Japanese Strawberry/);
assert.doesNotMatch(migration, /Chocolate Strawberry/);
assert.doesNotMatch(migration, /delete from public\.library_cakes/);
assert.doesNotMatch(migration, /at most \d+ tags/i);
assert.match(migration, /No delete policy/);

assert.equal(
  omitCakeTagAssignmentEmbed(`
  library_cake_categories (id),
  library_cake_tag_assignments (
    tag_id,
    sort_order,
    library_cake_tags (
      id,
      name,
      is_active,
      sort_order
    )
  ),
  library_cake_sizes (id)
`).includes("library_cake_tag_assignments"),
  false,
);

const tagActionsSrc = readSrc("src/workspaces/library/cakes/tag-actions.ts");
assert.match(tagActionsSrc, /canManageLibrary/);
assert.match(tagActionsSrc, /createCakeTagAction/);
assert.match(tagActionsSrc, /renameCakeTagAction/);
assert.match(tagActionsSrc, /setCakeTagActiveAction/);
assert.match(tagActionsSrc, /moveCakeTagAction/);
assert.doesNotMatch(tagActionsSrc, /canManageCakePhotos/);
assert.doesNotMatch(tagActionsSrc, /\.delete\(/);

const tagsPageSrc = readSrc("src/app/(app)/library/cakes/tags/page.tsx");
assert.match(tagsPageSrc, /canManageLibrary/);
assert.match(tagsPageSrc, /redirect\("\/home"\)/);
assert.match(tagsPageSrc, /CakeTagManager/);

const cakesPageSrc = readSrc("src/app/(app)/library/cakes/page.tsx");
assert.match(cakesPageSrc, /Manage tags/);

const formSrc = readSrc("src/workspaces/library/cakes/CakeForm.tsx");
assert.match(formSrc, /tag_ids/);
assert.match(formSrc, /cakeEditorTagOptions/);
assert.match(formSrc, /Manage tags/);

const browseSrc = readSrc("src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx");
assert.doesNotMatch(browseSrc, /tag_ids/);
assert.doesNotMatch(browseSrc, /Browse Tags/);
assert.doesNotMatch(browseSrc, /options\.tags/);

const browseFiltersSrc = readSrc(
  "src/workspaces/storefront/catalog/browse-filters.ts",
);
assert.doesNotMatch(browseFiltersSrc, /filters\.tag/);
assert.match(browseFiltersSrc, /cakeHasAnyCategoryId/);

const cardSrc = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
assert.match(cardSrc, /storefrontTagLabel/);
assert.doesNotMatch(cardSrc, /BEST SELLER|REVIVED/);

console.log("PASS library cake tags");
