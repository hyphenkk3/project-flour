/**
 * Homepage structure pass 2: Fresh Picks order, featured collections,
 * Browse All historical cakes, homepage section order.
 * Run: npx tsx scripts/test-homepage-structure.ts
 *
 * Static / engine only. Does not mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sortHomepageFreshPicks } from "@/engines/extra/customer-fresh-picks";
import { orderableMonthlyCatalogues } from "@/engines/menu/customer-browse";
import {
  BROWSE_CURRENTLY_UNAVAILABLE_NOTE,
  HOMEPAGE_COLLECTION_PREVIEW_DISPLAY_MAX,
  HOMEPAGE_COLLECTION_PREVIEW_MAX,
  isCustomerFacingHistoricalCatalogue,
  planHomepageCollectionPreviewChange,
  takeHomepageCollectionPreviewCakes,
} from "@/engines/menu/homepage-collection-preview";
import { selectHomepageFeaturedCollections } from "@/engines/menu/homepage-featured-collections";
import {
  formatHomepagePrice,
  isStartingFromPrice,
} from "@/workspaces/storefront/catalog/pricing";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

// A. Fresh Picks grouping: today only, today+tomorrow, tomorrow only.
// Offering order is preserved within each group.
assert.deepEqual(
  sortHomepageFreshPicks([
    { id: "tomorrow-a", days: ["tomorrow"] as const },
    { id: "today-b", days: ["today"] as const },
    { id: "both-a", days: ["today", "tomorrow"] as const },
    { id: "today-a", days: ["today"] as const },
    { id: "tomorrow-b", days: ["tomorrow"] as const },
    { id: "both-b", days: ["today", "tomorrow"] as const },
  ]).map((pick) => pick.id),
  ["today-b", "today-a", "both-a", "both-b", "tomorrow-a", "tomorrow-b"],
);

const freshSectionSrc = readSrc(
  "src/workspaces/storefront/home/HomeFreshPicksSection.tsx",
);
assert.match(freshSectionSrc, /Nothing extra is available right now/);
assert.match(freshSectionSrc, /Check back here for last-minute cake availability/);
assert.match(freshSectionSrc, /empty \?/);
assert.doesNotMatch(freshSectionSrc, /return null/);
assert.doesNotMatch(freshSectionSrc, /if \(picks\.length === 0\) return null/);
assert.doesNotMatch(freshSectionSrc, /text-status-danger/);
assert.doesNotMatch(freshSectionSrc, /homepageFreshPicksCountCopy/);

const homeSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.match(homeSrc, /sortHomepageFreshPicks/);
assert.match(homeSrc, /HomeFreshPicksSection picks=\{picks\}/);

// B. Empty Fresh Picks still render the section on the homepage.
const heroIndex = homeSrc.indexOf("<HomeHero");
const freshIndex = homeSrc.indexOf("<HomeFreshPicksSection");
const featuredIndex = homeSrc.indexOf("<HomeFeaturedCollection");
const moreIndex = homeSrc.indexOf("<HomeMoreCollections");
const browseIndex = homeSrc.indexOf("<HomeBrowseAllCakes");
const visitIndex = homeSrc.indexOf("<HomeVisitFooter");
assert.ok(heroIndex >= 0 && freshIndex > heroIndex);
assert.ok(featuredIndex > freshIndex);
assert.ok(moreIndex > featuredIndex);
assert.ok(browseIndex > moreIndex);
assert.ok(visitIndex > browseIndex);
assert.match(
  homeSrc,
  /HomeVisitFooter lead=\{<HomePopularCakes cakes=\{popular\} \/>\}/,
);

assert.doesNotMatch(homeSrc, /HomeCurrentCollection/);
assert.doesNotMatch(homeSrc, /HomeDestinationCard/);
assert.doesNotMatch(homeSrc, /StorefrontFreshPicksCard/);
assert.doesNotMatch(homeSrc, /grid gap-4 md:grid-cols-3/);
assert.match(homeSrc, /selectHomepageFeaturedCollections/);
assert.match(homeSrc, /listHomepageCollectionPreviewCakes/);
assert.match(homeSrc, /listCustomerSpecialCatalogues/);
assert.match(homeSrc, /listOrderableMonthlyCatalogues/);
assert.doesNotMatch(homeSrc, /listAvailableCakes/);

// C. Collection selection cases.
const special = { id: "special", displayOrder: 0, startDate: "2026-09-16" };
const september = { id: "sep", month: "2026-09-01" };
const october = { id: "oct", month: "2026-10-01" };
const todayYm = "2026-09";

assert.deepEqual(
  selectHomepageFeaturedCollections({
    todayYearMonth: todayYm,
    specials: [special],
    monthlies: [september],
  }),
  {
    featured: [
      { id: "special", kind: "special" },
      { id: "sep", kind: "current_monthly" },
    ],
    more: [],
  },
  "Special + current → Special + current",
);

assert.deepEqual(
  selectHomepageFeaturedCollections({
    todayYearMonth: todayYm,
    specials: [],
    monthlies: [october, september],
  }),
  {
    featured: [
      { id: "sep", kind: "current_monthly" },
      { id: "oct", kind: "upcoming_monthly" },
    ],
    more: [],
  },
  "current + upcoming → current + upcoming",
);

assert.deepEqual(
  selectHomepageFeaturedCollections({
    todayYearMonth: todayYm,
    specials: [special],
    monthlies: [september, october],
  }),
  {
    featured: [
      { id: "special", kind: "special" },
      { id: "sep", kind: "current_monthly" },
    ],
    more: [{ id: "oct", kind: "upcoming_monthly" }],
  },
  "Special + current + upcoming → Special + current, October remains a quiet link",
);

assert.deepEqual(
  selectHomepageFeaturedCollections({
    todayYearMonth: todayYm,
    specials: [special],
    monthlies: [october],
  }),
  {
    featured: [
      { id: "special", kind: "special" },
      { id: "oct", kind: "upcoming_monthly" },
    ],
    more: [],
  },
  "Special + October with no current monthly",
);

assert.deepEqual(
  selectHomepageFeaturedCollections({
    todayYearMonth: todayYm,
    specials: [],
    monthlies: [september],
  }),
  {
    featured: [{ id: "sep", kind: "current_monthly" }],
    more: [],
  },
  "only current monthly collection",
);

assert.deepEqual(
  selectHomepageFeaturedCollections({
    todayYearMonth: todayYm,
    specials: [],
    monthlies: [october],
  }),
  {
    featured: [{ id: "oct", kind: "upcoming_monthly" }],
    more: [],
  },
  "only upcoming monthly collection",
);

const overflow = selectHomepageFeaturedCollections({
  todayYearMonth: todayYm,
  specials: [special],
  monthlies: [september, october, { id: "nov", month: "2026-11-01" }],
});
assert.equal(overflow.featured.length, 2);
assert.ok(overflow.more.some((row) => row.id === "oct"));
assert.ok(overflow.more.some((row) => row.id === "nov"));

const moreSrc = readSrc(
  "src/workspaces/storefront/home/HomeMoreCollections.tsx",
);
assert.match(moreSrc, /item\.heading/);
assert.match(moreSrc, /item\.supporting/);
assert.doesNotMatch(moreSrc, /More collections/);
assert.doesNotMatch(moreSrc, /HomeDestinationCard/);
assert.match(homeSrc, /Now accepting orders/);

const featuredSrc = readSrc(
  "src/workspaces/storefront/home/HomeFeaturedCollection.tsx",
);
assert.match(featuredSrc, /rounded-\[10px\]/);
assert.match(featuredSrc, /aspect-square/);
assert.match(featuredSrc, /w-\[8\.5rem\]/);
assert.match(featuredSrc, /overflow-x-auto/);
assert.match(featuredSrc, /-mx-6/);
assert.match(featuredSrc, /takeHomepageCollectionPreviewCakes/);
assert.match(featuredSrc, /viewAllLabel/);
assert.match(featuredSrc, /See all →/);
assert.match(featuredSrc, /items-baseline justify-between/);
assert.match(featuredSrc, /bg-ink\/\[0\.035\]/);
assert.doesNotMatch(featuredSrc, /border-ink\/\[0\.12\]/);
assert.match(
  featuredSrc,
  /previewCakes\.map\([\s\S]*\}\)\}\s*<li className="w-\[8\.5rem\] shrink-0">[\s\S]*viewAllHref/,
);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queriesSrc, /takeHomepageCollectionPreviewCakes/);
assert.doesNotMatch(
  queriesSrc,
  /slice\(0,\s*HOMEPAGE_COLLECTION_PREVIEW_MAX\)/,
);
assert.match(homeSrc, /View all \$\{heading\}/);
assert.doesNotMatch(featuredSrc, /01 \/ 02/);
assert.doesNotMatch(featuredSrc, /VIEW FULL CATALOG/);

// D. Unpublished / not customer-orderable future catalogues are not featured.
assert.deepEqual(
  orderableMonthlyCatalogues(
    [
      {
        id: "sep",
        status: "active",
        purpose: "monthly",
        month: "2026-09-01",
      },
      {
        id: "oct-draft",
        status: "draft",
        purpose: "monthly",
        month: "2026-10-01",
      },
    ],
    todayYm,
  ).map((row) => row.id),
  ["sep"],
);

assert.deepEqual(
  selectHomepageFeaturedCollections({
    todayYearMonth: todayYm,
    specials: [],
    monthlies: [{ id: "sep", month: "2026-09-01" }],
  }).featured.map((row) => row.id),
  ["sep"],
  "future collection not passed as orderable is not featured",
);

assert.equal(
  isCustomerFacingHistoricalCatalogue({
    purpose: "monthly",
    status: "draft",
  }),
  false,
);

// E. Browse All historical vs currently offered.
assert.equal(BROWSE_CURRENTLY_UNAVAILABLE_NOTE, "Currently unavailable");
assert.equal(
  isCustomerFacingHistoricalCatalogue({
    purpose: "monthly",
    status: "archived",
  }),
  true,
);
assert.equal(
  isCustomerFacingHistoricalCatalogue({
    purpose: "monthly",
    status: "active",
  }),
  true,
);
assert.equal(
  isCustomerFacingHistoricalCatalogue({
    purpose: "special",
    status: "active",
  }),
  false,
);
assert.equal(
  isCustomerFacingHistoricalCatalogue({
    purpose: "special",
    status: "active",
    websiteOverride: true,
  }),
  true,
);

const browseQueries = readSrc("src/workspaces/storefront/catalog/queries.ts");
const browseFn = browseQueries.slice(
  browseQueries.indexOf("export async function listBrowsePublishedCakes"),
  browseQueries.indexOf("export async function getBrowsePublishedCakeById"),
);
assert.match(browseFn, /isCurrentlyCustomerOrderable/);
assert.match(browseFn, /isCustomerFacingHistoricalCatalogue/);
assert.match(browseFn, /BROWSE_CURRENTLY_UNAVAILABLE_NOTE/);
assert.match(browseFn, /currentlyOffered/);
assert.match(browseFn, /\["active", "archived"\]/);
assert.doesNotMatch(browseFn, /capacity/i);
assert.doesNotMatch(browseFn, /units remaining/i);

const browsePageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
);
assert.match(browsePageSrc, /Explore the full Whitebird collection/);
assert.doesNotMatch(browsePageSrc, /Past menus/);
assert.doesNotMatch(browsePageSrc, /Archive/);
assert.doesNotMatch(browsePageSrc, /Discontinued/);
assert.doesNotMatch(browsePageSrc, /Old Cakes/);
assert.doesNotMatch(browsePageSrc, /listHistoricalCatalogues/);
assert.doesNotMatch(browsePageSrc, /capacity/i);

const cakeCardSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeCard.tsx",
);
assert.match(cakeCardSrc, /hideAddToOrder/);
assert.match(cakeCardSrc, /BROWSE_CURRENTLY_UNAVAILABLE_NOTE/);
assert.match(cakeCardSrc, /text-skyline/);
assert.match(cakeCardSrc, /text-status-danger/);

const catalogueSrc = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
assert.match(catalogueSrc, /hideAddToOrder=\{cake\.currentlyOffered === false\}/);

const detailSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
assert.match(detailSrc, /hideAddToOrder=\{cake\.currentlyOffered === false\}/);

assert.equal(HOMEPAGE_COLLECTION_PREVIEW_MAX, 6);
assert.equal(HOMEPAGE_COLLECTION_PREVIEW_DISPLAY_MAX, 4);
assert.equal(
  takeHomepageCollectionPreviewCakes(["a", "b", "c", "d", "e", "f"]).length,
  4,
);
assert.deepEqual(
  takeHomepageCollectionPreviewCakes(["a", "b", "c", "d", "e", "f"]),
  ["a", "b", "c", "d"],
);

const size = (id: string, price: number) => ({
  id,
  cakeId: "cake",
  size: id,
  price,
  sortOrder: 1,
  preorderDays: 2,
});
assert.equal(
  formatHomepagePrice({ sizes: [size("6\"", 78)] }),
  "RM78",
);
assert.equal(
  isStartingFromPrice({ sizes: [size("6\"", 78)] }),
  false,
);
assert.equal(
  formatHomepagePrice({
    sizes: [size("4\"", 75), size("6\"", 95)],
  }),
  "RM75~",
);
assert.equal(
  formatHomepagePrice({
    sizes: [size("6\"", 78), size("8\"", 78)],
  }),
  "RM78",
);

const previewPlan = planHomepageCollectionPreviewChange(
  [
    { id: "a", showOnHomepage: true, homepageSortOrder: 1 },
    { id: "b", showOnHomepage: false, homepageSortOrder: null },
  ],
  "b",
  { showOnHomepage: true, homepageSortOrder: 1 },
);
assert.equal(previewPlan.ok, true);
if (previewPlan.ok) {
  assert.deepEqual(
    previewPlan.updates
      .filter((row) => row.showOnHomepage)
      .sort(
        (left, right) =>
          (left.homepageSortOrder ?? 0) - (right.homepageSortOrder ?? 0),
      )
      .map((row) => row.id),
    ["b", "a"],
  );
}

const builderSrc = readSrc(
  "src/workspaces/library/collections/CollectionBuilder.tsx",
);
assert.match(builderSrc, /CollectionHomepagePreviewControl/);
assert.match(builderSrc, /Homepage preview/);

const copyFn = readSrc("src/workspaces/library/collections/catalogue.ts");
assert.match(copyFn, /copyCatalogueMembershipRows/);
assert.doesNotMatch(
  copyFn.slice(copyFn.indexOf("export function copyCatalogueMembershipRows")),
  /showOnHomepage|show_on_homepage/,
);

const migrationSrc = readSrc(
  "supabase/migrations/20260908120000_collection_cakes_homepage_preview.sql",
);
assert.match(migrationSrc, /show_on_homepage/);
assert.match(migrationSrc, /homepage_sort_order/);
assert.match(migrationSrc, /collections_public_select_customer_history/);

console.log("PASS homepage structure pass 2");
