/**
 * Collection membership merchandising rules.
 * Run: npx tsx scripts/test-library-collection-membership.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  LibraryCake,
  LibraryCakeCategory,
  LibraryCakeStatus,
} from "@/types/library-cake";
import {
  addCollectionMembership,
  cakesNotInCollection,
  collectionCakeStorefrontEligibility,
  dropIndexAfterRemoval,
  isVisibleOnCustomerStorefront,
  moveCollectionMembership,
  moveCollectionMembershipTo,
  removeCollectionMembership,
  setCollectionMembershipAvailable,
  sortCollectionMembership,
  storefrontVisibilityReason,
  type CollectionMembership,
} from "@/workspaces/library/collections/membership";
import { WORKSPACE_CATALOG } from "@/foundation/navigation/workspaces";
import {
  CATALOGUE_PURPOSES,
  catalogueDateLine,
  catalogueDisplayTitle,
  catalogueInsertRow,
  catalogueMonthOptions,
  catalogueSupportingLine,
  formatCatalogueCalendarDate,
  formatCatalogueDateRange,
  isStorefrontEligiblePurpose,
  parseCatalogueCalendarDate,
  parseCatalogueCreateInput,
  parseCatalogueMonthDate,
} from "@/workspaces/library/collections/catalogue";
import {
  formatLibraryCollectionMonth,
  LIBRARY_COLLECTION_STATUSES,
} from "@/workspaces/library/labels";

function cake(input: {
  id: string;
  name: string;
  status: LibraryCakeStatus;
  category?: LibraryCakeCategory;
  price?: number;
}): LibraryCake {
  return {
    id: input.id,
    name: input.name,
    category: input.category ?? "classic",
    description: null,
    sharingGuide: null,
    allergens: [],
    bakeryNotes: null,
    status: input.status,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    sizes: [
      {
        id: `${input.id}-4`,
        cakeId: input.id,
        label: '4"',
        price: input.price ?? 75,
        sortOrder: 0,
      },
    ],
  };
}

function member(
  id: string,
  libraryCakeId: string,
  sortOrder: number,
  available = true,
): CollectionMembership {
  return { id, libraryCakeId, available, sortOrder };
}

assert.deepEqual(LIBRARY_COLLECTION_STATUSES, ["draft", "active", "archived"]);
assert.equal(formatLibraryCollectionMonth("2026-08-01"), "August 2026");

const chocolate = cake({
  id: "chocolate",
  name: "Chocolate D'Amour",
  status: "active",
});
const strawberry = cake({
  id: "strawberry",
  name: "Japanese Strawberry",
  status: "active",
});
const draftCake = cake({
  id: "draft-cake",
  name: "Draft Gateau",
  status: "draft",
});

let members = addCollectionMembership([], chocolate.id);
assert.equal(members.length, 1);
assert.equal(members[0]?.libraryCakeId, chocolate.id);
assert.equal(members[0]?.available, true);
assert.equal(members[0]?.sortOrder, 0);

members = addCollectionMembership(members, strawberry.id);
assert.deepEqual(
  members.map((row) => row.libraryCakeId),
  [chocolate.id, strawberry.id],
);
assert.deepEqual(
  members.map((row) => row.sortOrder),
  [0, 1],
);

assert.throws(
  () => addCollectionMembership(members, chocolate.id),
  /already in the collection/,
);
assert.equal(members.length, 2, "duplicate add must not mutate members");

assert.deepEqual(
  cakesNotInCollection([chocolate, strawberry, draftCake], members).map(
    (row) => row.id,
  ),
  [draftCake.id],
);

const beforeToggle = members[0];
assert.ok(beforeToggle);
members = setCollectionMembershipAvailable(members, beforeToggle.id, false);
assert.equal(
  members.find((row) => row.id === beforeToggle.id)?.available,
  false,
);
assert.equal(
  members.find((row) => row.libraryCakeId === strawberry.id)?.available,
  true,
);
assert.equal(
  chocolate.status,
  "active",
  "Library status stays independent of collection availability",
);
assert.equal(draftCake.status, "draft");

members = setCollectionMembershipAvailable(members, beforeToggle.id, true);

members = addCollectionMembership(members, draftCake.id);
const draftMember = members.find((row) => row.libraryCakeId === draftCake.id);
assert.ok(draftMember);
assert.equal(draftMember.available, true);
assert.equal(draftCake.status, "draft");

const offeredDraft = collectionCakeStorefrontEligibility({
  collectionStatus: "active",
  isCurrentStorefront: true,
  available: true,
  cakeStatus: draftCake.status,
  sizeCount: draftCake.sizes.length,
});
assert.equal(offeredDraft.membershipAvailable, true);
assert.equal(offeredDraft.libraryStatusEligible, false);
assert.equal(isVisibleOnCustomerStorefront(offeredDraft), false);
assert.match(
  storefrontVisibilityReason(offeredDraft),
  /Library status is not Active or Seasonal/,
);

const offeredActive = collectionCakeStorefrontEligibility({
  collectionStatus: "active",
  isCurrentStorefront: true,
  available: true,
  cakeStatus: chocolate.status,
  sizeCount: chocolate.sizes.length,
});
assert.equal(isVisibleOnCustomerStorefront(offeredActive), true);

const hiddenActive = collectionCakeStorefrontEligibility({
  collectionStatus: "active",
  isCurrentStorefront: true,
  available: false,
  cakeStatus: chocolate.status,
  sizeCount: chocolate.sizes.length,
});
assert.equal(isVisibleOnCustomerStorefront(hiddenActive), false);
assert.match(storefrontVisibilityReason(hiddenActive), /not marked available/);

const specialActive = collectionCakeStorefrontEligibility({
  collectionStatus: "active",
  isCurrentStorefront: false,
  available: true,
  cakeStatus: chocolate.status,
  sizeCount: chocolate.sizes.length,
});
assert.equal(isVisibleOnCustomerStorefront(specialActive), false);
assert.match(
  storefrontVisibilityReason(specialActive),
  /not the current website catalogue/,
);

members = removeCollectionMembership(members, draftMember.id);
assert.equal(
  members.some((row) => row.libraryCakeId === draftCake.id),
  false,
);
assert.deepEqual(
  members.map((row) => row.sortOrder),
  [0, 1],
);
assert.equal(draftCake.status, "draft");

members = [
  member("a", "one", 0),
  member("b", "two", 1),
  member("c", "three", 2),
];
members = moveCollectionMembership(members, "b", -1);
assert.deepEqual(
  members.map((row) => row.libraryCakeId),
  ["two", "one", "three"],
);
assert.deepEqual(
  members.map((row) => row.sortOrder),
  [0, 1, 2],
);
members = moveCollectionMembership(members, "b", 1);
assert.deepEqual(
  members.map((row) => row.libraryCakeId),
  ["one", "two", "three"],
);
members = moveCollectionMembership(members, "a", -1);
assert.deepEqual(
  members.map((row) => row.libraryCakeId),
  ["one", "two", "three"],
  "moving the first item up is a no-op",
);

members = [
  member("a", "one", 0),
  member("b", "two", 1),
  member("c", "three", 2),
  member("d", "four", 3),
];
members[1] = { ...members[1]!, available: false };
const availableBefore = members.map((row) => row.available);
members = moveCollectionMembershipTo(members, "d", 1);
assert.deepEqual(
  members.map((row) => row.libraryCakeId),
  ["one", "four", "two", "three"],
  "arbitrary reorder places a cake at any index",
);
assert.deepEqual(
  members.map((row) => row.sortOrder),
  [0, 1, 2, 3],
  "reorder normalizes sort_order to 0..n-1",
);
assert.equal(
  members.find((row) => row.id === "b")?.available,
  false,
  "reorder does not change collection availability",
);
assert.deepEqual(
  members.map((row) => row.available),
  [true, true, false, true],
);

assert.equal(dropIndexAfterRemoval(1, 3), 2);
assert.equal(dropIndexAfterRemoval(3, 0), 0);
assert.equal(dropIndexAfterRemoval(0, 0), 0);

const apple = cake({
  id: "apple",
  name: "Apple",
  status: "active",
  category: "classic",
  price: 100,
});
const bananaCake = cake({
  id: "banana",
  name: "Banana",
  status: "active",
  category: "specialty",
  price: 50,
});
const cherryCake = cake({
  id: "cherry",
  name: "Cherry",
  status: "seasonal",
  category: "celebration",
  price: 80,
});
const sortCakes = [apple, bananaCake, cherryCake];
const merchOrder = [
  member("m-banana", bananaCake.id, 0),
  member("m-cherry", cherryCake.id, 1, false),
  member("m-apple", apple.id, 2),
];
const merchSnapshot = merchOrder.map((row) => ({ ...row }));
const cakePrices = sortCakes.map((row) => row.sizes[0]?.price);

function idsOf(sort: Parameters<typeof sortCollectionMembership>[2]): string[] {
  return sortCollectionMembership(merchOrder, sortCakes, sort).map(
    (row) => row.libraryCakeId,
  );
}

assert.deepEqual(idsOf("current"), [bananaCake.id, cherryCake.id, apple.id]);
assert.deepEqual(idsOf("name_asc"), [apple.id, bananaCake.id, cherryCake.id]);
assert.deepEqual(idsOf("name_desc"), [cherryCake.id, bananaCake.id, apple.id]);
assert.deepEqual(idsOf("price_asc"), [bananaCake.id, cherryCake.id, apple.id]);
assert.deepEqual(idsOf("price_desc"), [apple.id, cherryCake.id, bananaCake.id]);
assert.deepEqual(idsOf("category_asc"), [
  cherryCake.id,
  apple.id,
  bananaCake.id,
]);
assert.deepEqual(idsOf("category_desc"), [
  bananaCake.id,
  apple.id,
  cherryCake.id,
]);
assert.deepEqual(
  sortCollectionMembership(merchOrder, sortCakes, "name_asc").map(
    (row) => row.sortOrder,
  ),
  [0, 1, 2],
);
assert.deepEqual(
  sortCollectionMembership(merchOrder, sortCakes, "name_asc").map(
    (row) => row.available,
  ),
  [true, true, false],
);
assert.deepEqual(
  merchOrder,
  merchSnapshot,
  "bulk sort does not mutate the source membership array",
);
assert.deepEqual(
  sortCakes.map((row) => row.sizes[0]?.price),
  cakePrices,
  "Library cake prices stay unchanged after collection sort",
);
assert.equal(apple.name, "Apple");
assert.equal(bananaCake.category, "specialty");

assert.equal(WORKSPACE_CATALOG.collection.label, "Pickup");
assert.equal(WORKSPACE_CATALOG.collection.href, "/collection");
assert.deepEqual(CATALOGUE_PURPOSES, ["monthly", "special"]);
assert.equal(parseCatalogueMonthDate("2026-09"), "2026-09-01");
assert.equal(parseCatalogueMonthDate("2026-09-15"), "2026-09-01");
assert.equal(parseCatalogueMonthDate("nope"), null);
assert.equal(
  catalogueMonthOptions("2026-08-16").find((option) => option.value === "2026-09")
    ?.label,
  "September 2026",
);
assert.equal(
  catalogueDisplayTitle({
    name: "Collection 2026-08",
    month: "2026-08-01",
    startDate: null,
    endDate: null,
    purpose: "monthly",
  }),
  "August 2026",
);
assert.equal(
  catalogueDisplayTitle({
    name: "Christmas 2026",
    month: null,
    startDate: "2026-12-20",
    endDate: "2026-12-25",
    purpose: "special",
  }),
  "Christmas 2026",
);
assert.equal(
  catalogueDateLine({
    name: "September 2026",
    month: "2026-09-01",
    startDate: null,
    endDate: null,
    purpose: "monthly",
  }),
  "Month: September 2026",
);
assert.equal(
  catalogueDateLine({
    name: "Christmas 2026",
    month: null,
    startDate: "2026-12-20",
    endDate: "2026-12-25",
    purpose: "special",
  }),
  "20 Dec 2026 → 25 Dec 2026",
);
assert.equal(
  catalogueSupportingLine({
    name: "Christmas 2026",
    month: null,
    startDate: "2026-12-20",
    endDate: "2026-12-25",
    purpose: "special",
  }),
  null,
);
assert.equal(
  catalogueSupportingLine({
    name: "Collection 2026-08",
    month: "2026-08-01",
    startDate: null,
    endDate: null,
    purpose: "monthly",
  }),
  "Collection 2026-08",
);
assert.equal(isStorefrontEligiblePurpose("monthly"), true);
assert.equal(isStorefrontEligiblePurpose("special"), false);

const missingName = parseCatalogueCreateInput(new FormData());
assert.equal(missingName, "Name is required.");

const monthlyForm = new FormData();
monthlyForm.set("name", "September 2026");
monthlyForm.set("purpose", "monthly");
monthlyForm.set("month", "2026-09");
monthlyForm.set("status", "draft");
assert.deepEqual(parseCatalogueCreateInput(monthlyForm), {
  name: "September 2026",
  purpose: "monthly",
  status: "draft",
  month: "2026-09-01",
  startDate: null,
  endDate: null,
  websiteOverride: false,
});
assert.deepEqual(
  catalogueInsertRow(parseCatalogueCreateInput(monthlyForm) as never),
  {
    name: "September 2026",
    purpose: "monthly",
    status: "draft",
    month: "2026-09-01",
  },
);

const createForm = new FormData();
createForm.set("name", "Wedding Collection");
createForm.set("purpose", "special");
createForm.set("start_date", "2027-06-01");
createForm.set("end_date", "2027-06-30");
createForm.set("status", "draft");
assert.deepEqual(parseCatalogueCreateInput(createForm), {
  name: "Wedding Collection",
  purpose: "special",
  status: "draft",
  month: null,
  startDate: "2027-06-01",
  endDate: "2027-06-30",
  websiteOverride: false,
});
assert.equal(parseCatalogueCalendarDate("2026-02-31"), null);
assert.equal(formatCatalogueCalendarDate("2026-12-20"), "20 Dec 2026");
assert.equal(
  formatCatalogueDateRange("2027-02-12", "2027-02-14"),
  "12 Feb 2027 → 14 Feb 2027",
);
assert.equal(
  formatCatalogueDateRange("2027-02-14", "2027-02-14"),
  "14 Feb 2027",
);

const specialMissingStart = new FormData();
specialMissingStart.set("name", "Christmas 2026");
specialMissingStart.set("purpose", "special");
specialMissingStart.set("end_date", "2026-12-25");
specialMissingStart.set("status", "draft");
assert.equal(
  parseCatalogueCreateInput(specialMissingStart),
  "Start date is required.",
);

const specialMissingEnd = new FormData();
specialMissingEnd.set("name", "Christmas 2026");
specialMissingEnd.set("purpose", "special");
specialMissingEnd.set("start_date", "2026-12-20");
specialMissingEnd.set("status", "draft");
assert.equal(
  parseCatalogueCreateInput(specialMissingEnd),
  "End date is required.",
);

const specialEndBeforeStart = new FormData();
specialEndBeforeStart.set("name", "Christmas 2026");
specialEndBeforeStart.set("purpose", "special");
specialEndBeforeStart.set("start_date", "2026-12-25");
specialEndBeforeStart.set("end_date", "2026-12-20");
specialEndBeforeStart.set("status", "draft");
assert.equal(
  parseCatalogueCreateInput(specialEndBeforeStart),
  "End date must not be before start date.",
);

const oneDaySpecial = new FormData();
oneDaySpecial.set("name", "Mother's Day 2027");
oneDaySpecial.set("purpose", "special");
oneDaySpecial.set("start_date", "2027-05-09");
oneDaySpecial.set("end_date", "2027-05-09");
oneDaySpecial.set("status", "draft");
assert.deepEqual(parseCatalogueCreateInput(oneDaySpecial), {
  name: "Mother's Day 2027",
  purpose: "special",
  status: "draft",
  month: null,
  startDate: "2027-05-09",
  endDate: "2027-05-09",
  websiteOverride: false,
});

const schema = readFileSync(
  resolve(
    "supabase/migrations/20260806150000_milestone1_architecture_unify.sql",
  ),
  "utf8",
);
assert.match(
  schema,
  /constraint collection_cakes_unique unique \(collection_id, library_cake_id\)/,
);
assert.match(schema, /collection_cakes_authenticated_all/);

const actionsSrc = readFileSync(
  resolve("src/workspaces/library/collections/actions.ts"),
  "utf8",
);
const createFn = actionsSrc.slice(
  actionsSrc.indexOf("createCatalogueAction"),
  actionsSrc.indexOf("revalidateCollectionPaths"),
);
assert.match(actionsSrc, /setCatalogueWebsiteOverrideAction/);
assert.match(actionsSrc, /website_override: true/);
assert.match(actionsSrc, /catalogueInsertRow\(createInput\)/);
assert.match(createFn, /copyCatalogueMembershipRows/);
assert.match(actionsSrc, /publishCatalogueAction/);
assert.match(actionsSrc, /update\(\{ status: "active" \}\)/);
assert.match(createFn, /collection_cakes/);
assert.match(createFn, /status: "draft"/);
assert.doesNotMatch(createFn, /\.from\("library_cakes"\)\.insert/);
assert.match(actionsSrc, /\.from\("collection_cakes"\)\.insert/);
assert.match(actionsSrc, /available: true/);
assert.match(actionsSrc, /sort_order/);
assert.match(actionsSrc, /error\.code === "23505"/);
assert.match(actionsSrc, /reorderCollectionCakesAction/);
assert.match(actionsSrc, /update\(\{ sort_order: index \}\)/);
assert.doesNotMatch(
  actionsSrc,
  /\.from\("library_cakes"\)\.(insert|update|delete)/,
);
assert.doesNotMatch(actionsSrc, /\.from\("orders"\)/);
assert.doesNotMatch(actionsSrc, /\.from\("order_items"\)/);

const navSrc = readFileSync(
  resolve("src/workspaces/library/LibraryNav.tsx"),
  "utf8",
);
assert.match(navSrc, /href: "\/library\/collections"/);
assert.match(navSrc, /label: "Catalogues"/);

const purposeMigration = readFileSync(
  resolve("supabase/migrations/20260816160000_catalogue_purpose.sql"),
  "utf8",
);
assert.match(purposeMigration, /purpose text not null default 'monthly'/);
assert.match(purposeMigration, /c\.purpose = 'monthly'/);
assert.match(purposeMigration, /purpose = special/);

const datesMigration = readFileSync(
  resolve("supabase/migrations/20260816170000_catalogue_special_dates.sql"),
  "utf8",
);
assert.match(datesMigration, /add column if not exists start_date date/);
assert.match(datesMigration, /add column if not exists end_date date/);
assert.match(datesMigration, /alter column month drop not null/);
assert.match(datesMigration, /purpose = 'special'/);
assert.match(datesMigration, /end_date >= start_date/);
assert.match(datesMigration, /c\.purpose = 'monthly'/);
assert.match(datesMigration, /c\.month is not null/);
assert.match(
  datesMigration,
  /Special-occasion catalogues \(purpose = special\) are never selected/,
);
assert.match(datesMigration, /where purpose = 'special'/);

const queriesSrc = readFileSync(
  resolve("src/workspaces/library/collections/queries.ts"),
  "utf8",
);
assert.match(queriesSrc, /isMissingSpecialDateColumn/);
assert.match(queriesSrc, /start_date, end_date/);

const formSrc = readFileSync(
  resolve("src/workspaces/library/collections/CatalogueForm.tsx"),
  "utf8",
);
assert.match(formSrc, /catalogueMonthOptions/);
assert.match(formSrc, /Choose a month/);
assert.match(formSrc, /name="start_date"/);
assert.match(formSrc, /type="date"/);
assert.match(formSrc, /name="end_date"/);
assert.match(formSrc, /label="Start date"/);
assert.match(formSrc, /label="End date"/);
assert.match(formSrc, /Website override/);
assert.match(formSrc, /name="website_override"/);
assert.doesNotMatch(formSrc, /type="month"/);

const pickupSrc = readFileSync(
  resolve("src/app/(app)/collection/page.tsx"),
  "utf8",
);
assert.match(pickupSrc, /CollectionLiveBoard/);
assert.doesNotMatch(pickupSrc, /CollectionBuilder/);

const builderSrc = readFileSync(
  resolve("src/workspaces/library/collections/CollectionBuilder.tsx"),
  "utf8",
);
assert.match(
  builderSrc,
  /Library status and catalogue availability are separate/,
);
assert.match(builderSrc, /draggable/);
assert.match(builderSrc, /data-drop-indicator/);
assert.match(builderSrc, /Sort catalogue/);
assert.match(builderSrc, /Move .* up/);
assert.match(builderSrc, /reorderCollectionCakesAction/);
assert.match(builderSrc, /collection-add-category/);
assert.doesNotMatch(builderSrc, /listCakes\(\)/);

const cakeDetailSrc = readFileSync(
  resolve("src/app/(app)/library/cakes/[id]/page.tsx"),
  "utf8",
);
assert.match(cakeDetailSrc, /min-w-0 flex-1/);
assert.match(cakeDetailSrc, /shrink-0/);
assert.match(cakeDetailSrc, /sm:flex-row sm:items-start sm:justify-between/);
assert.match(cakeDetailSrc, /flex-col gap-4/);
assert.match(cakeDetailSrc, /break-words/);
assert.doesNotMatch(cakeDetailSrc, /truncate/);
assert.doesNotMatch(cakeDetailSrc, /line-clamp/);
assert.doesNotMatch(cakeDetailSrc, /sm:items-center/);

console.log("library collection membership tests passed");
