/**
 * Customer landing / Browse Cakes / Order collection selection.
 * Run: npx tsx scripts/test-storefront-landing.ts
 *
 * Engine + source assertions for 25 Aug 2026 / September-early-publish safety.
 * Does not mutate Library cakes, catalogues, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  browseCakeAvailabilityNote,
  CUSTOMER_PICKUP_DATE_CAKE_NOTICE,
  SPECIAL_MENU_DESCRIPTION,
  SPECIAL_MENU_HEADING,
  SPECIAL_PERIOD_CAKES_NOTE,
  catalogueMonthPickupBounds,
  clampCustomerPickupWindow,
  collectionScopedCheckoutHref,
  customerSpecialMenuPeriodLabel,
  homepageUpcomingPreorderPromo,
  isCustomerOrderableMonthlyMonth,
  monthOverlapsDateRange,
  nextPublishedMonthlyYearMonth,
  orderableMonthlyCatalogues,
  orderCollectionHeadline,
  orderCollectionPickupCopy,
  suggestedPickupDateForCatalogueMonth,
} from "@/engines/menu/customer-browse";
import {
  freshPickAvailabilityLabel,
  freshPickDay,
  homepageFeaturedFreshPickDateYmd,
  homepageFreshPicksAvailabilityLines,
  homepageFreshPicksCountCopy,
  homepageFreshPicksDescription,
  homepageFreshPicksHorizon,
  freshPickProductDescription,
  sortCustomerFreshPicksByAvailabilityDay,
  freshPickAvailabilityDateLabel,
} from "@/engines/extra/customer-fresh-picks";
import { formatShortBusinessDate } from "@/lib/dates";
import { unpublishedCataloguePreorderMessage } from "@/workspaces/storefront/catalog/queries";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const TODAY_YM = "2026-08";

const rows = [
  {
    id: "aug",
    status: "active",
    purpose: "monthly",
    month: "2026-08-01",
  },
  {
    id: "sep",
    status: "active",
    purpose: "monthly",
    month: "2026-09-01",
  },
  {
    id: "sep-draft",
    status: "draft",
    purpose: "monthly",
    month: "2026-09-01",
  },
  {
    id: "jul",
    status: "active",
    purpose: "monthly",
    month: "2026-07-01",
  },
  {
    id: "special",
    status: "active",
    purpose: "special",
    month: null,
  },
];

const orderable = orderableMonthlyCatalogues(rows, TODAY_YM);
assert.deepEqual(
  orderable.map((row) => row.id),
  ["aug", "sep"],
);
assert.equal(
  orderable.some((row) => row.status !== "active"),
  false,
  "Draft catalogues are not orderable collections",
);
assert.equal(
  orderable.some((row) => row.purpose !== "monthly"),
  false,
  "Special catalogues do not replace monthly Order landing",
);
assert.equal(isCustomerOrderableMonthlyMonth("2026-09-01", TODAY_YM), true);
assert.equal(isCustomerOrderableMonthlyMonth("2026-07-01", TODAY_YM), false);

assert.equal(
  browseCakeAvailabilityNote(TODAY_YM, ["2026-09-01"]),
  "Available from Sep",
);
assert.equal(
  browseCakeAvailabilityNote(TODAY_YM, ["2026-09"]),
  "Available from Sep",
);
assert.equal(
  browseCakeAvailabilityNote(TODAY_YM, ["2026-08-01", "2026-09-01"]),
  null,
);
assert.equal(
  browseCakeAvailabilityNote(TODAY_YM, ["2027-09-01"]),
  "Available from Sep 2027",
);

assert.equal(
  suggestedPickupDateForCatalogueMonth("2026-09-01", "2026-08-26"),
  "2026-09-01",
);
assert.equal(
  suggestedPickupDateForCatalogueMonth("2026-08-01", "2026-08-26"),
  "2026-08-26",
);

assert.equal(orderCollectionHeadline("2026-08-01"), "August 2026 Collection");
assert.equal(
  orderCollectionHeadline("2026-09-01"),
  "September 2026 Collection",
);
assert.equal(
  orderCollectionPickupCopy("2026-08-01", TODAY_YM),
  "Available for August pickup",
);
assert.equal(
  orderCollectionPickupCopy("2026-09-01", TODAY_YM),
  "Preorders now open for September pickup",
);
assert.deepEqual(catalogueMonthPickupBounds("2026-08-01"), {
  from: "2026-08-01",
  to: "2026-08-31",
});
assert.deepEqual(catalogueMonthPickupBounds("2026-09-01"), {
  from: "2026-09-01",
  to: "2026-09-30",
});
assert.deepEqual(
  clampCustomerPickupWindow("2026-08-26", "2026-08-01", "2026-08-31"),
  { min: "2026-08-26", max: "2026-08-31" },
);
assert.deepEqual(
  clampCustomerPickupWindow("2026-08-26", "2026-09-01", "2026-09-30"),
  { min: "2026-09-01", max: "2026-09-30" },
);
assert.equal(
  monthOverlapsDateRange("2026-09-01", "2026-09-16", "2026-09-24"),
  true,
);
assert.equal(
  monthOverlapsDateRange("2026-08-01", "2026-09-16", "2026-09-24"),
  false,
);
assert.equal(
  collectionScopedCheckoutHref({
    pickupDate: "2026-08-26",
    from: "2026-08-01",
    to: "2026-08-31",
  }),
  "/order/checkout?pickup=2026-08-26&from=2026-08-01&to=2026-08-31",
);
assert.equal(SPECIAL_MENU_HEADING, "Special Menu");
assert.equal(SPECIAL_MENU_DESCRIPTION, "Special cakes for selected periods");
assert.equal(
  customerSpecialMenuPeriodLabel("2026-09-16", "2026-09-17"),
  "16–17 September 2026",
);
assert.equal(
  customerSpecialMenuPeriodLabel("2026-12-31", "2027-01-02"),
  "31 December 2026 → 2 January 2027",
);
assert.equal(
  SPECIAL_PERIOD_CAKES_NOTE,
  "Special-period cakes are listed in the Special Menu.",
);

assert.equal(nextPublishedMonthlyYearMonth(TODAY_YM, ["2026-08", "2026-09"]), "2026-09");
assert.deepEqual(homepageUpcomingPreorderPromo("2026-09"), {
  heading: "September preorders are now open",
  cta: "Browse September",
});

assert.equal(
  unpublishedCataloguePreorderMessage("2026-09-01"),
  "September 2026 catalogue is not yet available for preorder.",
);
assert.equal(
  CUSTOMER_PICKUP_DATE_CAKE_NOTICE,
  "Your available cakes depend on your pickup date.",
);

assert.equal(freshPickDay("2026-08-17", "2026-08-17"), "today");
assert.equal(freshPickDay("2026-08-18", "2026-08-17"), "tomorrow");
assert.equal(freshPickDay("2026-08-22", "2026-08-17"), null);
assert.equal(freshPickDay("2026-08-16", "2026-08-17"), null);
assert.equal(freshPickAvailabilityLabel("today"), "Available today");
assert.equal(freshPickAvailabilityLabel("tomorrow"), "Available tomorrow");
assert.equal(
  freshPickAvailabilityLabel(["today"]),
  "Available today",
);
assert.equal(
  freshPickAvailabilityLabel(["tomorrow"]),
  "Available tomorrow",
);
assert.equal(
  freshPickAvailabilityLabel(["today", "tomorrow"]),
  "Available today & tomorrow",
);
assert.equal(homepageFreshPicksCountCopy(0), "No Fresh Picks right now");
assert.equal(
  homepageFreshPicksCountCopy(1),
  "1 cake available today or tomorrow",
);
assert.equal(
  homepageFreshPicksCountCopy(3),
  "3 cakes available today or tomorrow",
);
assert.equal(
  homepageFreshPicksDescription(homepageFreshPicksHorizon(["today", "tomorrow"])),
  "Special cakes released by Bakery for today or tomorrow.",
);
assert.equal(
  homepageFreshPicksDescription(homepageFreshPicksHorizon(["tomorrow"])),
  "Special cakes released by Bakery for tomorrow.",
);
assert.equal(
  homepageFreshPicksDescription(homepageFreshPicksHorizon(["today"])),
  "Special cakes released by Bakery for today.",
);
assert.equal(
  homepageFreshPicksDescription(homepageFreshPicksHorizon([])),
  "Fresh Picks are currently unavailable.",
);
assert.equal(
  homepageFreshPicksCountCopy(2, homepageFreshPicksHorizon(["today", "tomorrow"])),
  "2 cakes available today or tomorrow",
);
assert.equal(
  homepageFreshPicksCountCopy(1, homepageFreshPicksHorizon(["tomorrow"])),
  "1 cake available tomorrow",
);
assert.equal(
  homepageFreshPicksCountCopy(3, homepageFreshPicksHorizon(["today"])),
  "3 cakes available today",
);
assert.equal(
  homepageFeaturedFreshPickDateYmd("today", "2026-09-07"),
  "2026-09-07",
);
assert.equal(
  homepageFeaturedFreshPickDateYmd("tomorrow", "2026-09-07"),
  "2026-09-08",
);
assert.equal(formatShortBusinessDate("2026-09-07"), "7 Sep");
assert.equal(formatShortBusinessDate("2026-09-08"), "8 Sep");
assert.equal(freshPickAvailabilityDateLabel(["today"], "2026-09-07"), "7 SEP");
assert.equal(
  freshPickAvailabilityDateLabel(["tomorrow"], "2026-09-07"),
  "8 SEP",
);
assert.equal(
  freshPickAvailabilityDateLabel(["today", "tomorrow"], "2026-09-07"),
  "7–8 SEP",
);
assert.equal(
  freshPickAvailabilityDateLabel(["today", "tomorrow"], "2026-09-30"),
  "30 SEP–1 OCT",
);
assert.deepEqual(
  sortCustomerFreshPicksByAvailabilityDay([
    { id: "tomorrow-first", day: "tomorrow" as const },
    { id: "today-a", day: "today" as const },
    { id: "today-b", day: "today" as const },
  ]).map((pick) => pick.id),
  ["today-a", "today-b", "tomorrow-first"],
);
assert.equal(freshPickProductDescription(null), null);
assert.equal(freshPickProductDescription("  "), null);
assert.equal(
  freshPickProductDescription("Creamy avocado sponge with a light finish."),
  "Creamy avocado sponge with a light finish.",
);
assert.equal(
  freshPickProductDescription(
    "Available tomorrow. Limited quantity, available for pickup during the stated window.",
  ),
  "Limited quantity, available for pickup during the stated window.",
);
assert.equal(freshPickProductDescription("Available today."), null);
assert.deepEqual(homepageFreshPicksAvailabilityLines([], "2026-09-07"), []);
assert.deepEqual(homepageFreshPicksAvailabilityLines(["today"], "2026-09-07"), [
  "1 cake available today · 7 SEP",
]);
assert.deepEqual(
  homepageFreshPicksAvailabilityLines(["tomorrow", "tomorrow"], "2026-09-07"),
  ["2 cakes available tomorrow · 8 SEP"],
);
assert.deepEqual(
  homepageFreshPicksAvailabilityLines(
    ["today", "tomorrow", "tomorrow"],
    "2026-09-07",
  ),
  [
    "1 cake available today · 7 SEP",
    "2 cakes available tomorrow · 8 SEP",
  ],
);
assert.deepEqual(
  homepageFreshPicksAvailabilityLines(["today", "today", "today"], "2026-09-07"),
  ["3 cakes available today · 7 SEP"],
);

const homeSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.match(homeSrc, /href="\/order"/);
assert.match(homeSrc, /Browse Cakes/);
assert.match(homeSrc, /href="\/browse"/);
assert.match(homeSrc, /listStorefrontAvailableExtra/);
assert.match(homeSrc, /listHomepagePopularCakes/);
assert.match(homeSrc, /listOrderableMonthlyCatalogues/);
assert.match(homeSrc, /listCustomerSpecialCatalogues/);
assert.match(homeSrc, /selectHomepageFeaturedCollections/);
assert.match(homeSrc, /listHomepageCollectionPreviewCakes/);
assert.match(homeSrc, /sortHomepageFreshPicks/);
assert.match(homeSrc, /HomeFeaturedCollection/);
assert.match(homeSrc, /HomeMoreCollections/);
assert.match(homeSrc, /HomeBrowseAllCakes/);
assert.match(homeSrc, /HomeFreshPicksSection/);
assert.doesNotMatch(homeSrc, /HomeCurrentCollection/);
assert.doesNotMatch(homeSrc, /HomeDestinationCard/);
assert.doesNotMatch(homeSrc, /StorefrontFreshPicksCard/);
assert.doesNotMatch(homeSrc, /listAvailableCakes/);
assert.doesNotMatch(homeSrc, /listBrowsePublishedCakes/);
assert.doesNotMatch(homeSrc, /getCurrentCollection/);
assert.doesNotMatch(homeSrc, /submit_guest_preorder/);
assert.doesNotMatch(homeSrc, /collection_id/);
assert.doesNotMatch(homeSrc, /Only 3 cakes remaining today/);
assert.match(homeSrc, /desktopRail=\{false\}/);
assert.match(homeSrc, /HomeHero/);
assert.match(homeSrc, /HomePopularCakes/);
assert.match(
  homeSrc,
  /HomeVisitFooter lead=\{<HomePopularCakes cakes=\{popular\} \/>\}/,
);
assert.doesNotMatch(homeSrc, /HomeFeaturedFreshPick/);
assert.doesNotMatch(homeSrc, /getStorefrontExtraById/);
assert.doesNotMatch(
  homeSrc,
  /md:grid-cols-\[minmax\(0,0\.37fr\)_minmax\(0,0\.63fr\)\]/,
);
assert.doesNotMatch(homeSrc, />Fresh Pick</);
assert.doesNotMatch(homeSrc, /View Details/);

assert.doesNotMatch(homeSrc, /whitebird-homepage-hero/);

const homeHeroSrc = readSrc("src/workspaces/storefront/home/HomeHero.tsx");
assert.match(homeHeroSrc, /\/storefront\/whitebird-homepage-hero\.jpg/);
assert.match(homeHeroSrc, /grid-cols-3/);
assert.match(homeHeroSrc, /md:mt-6\.5/);
assert.match(homeHeroSrc, /md:flex md:flex-wrap md:gap-x-5 md:gap-y-2 lg:gap-x-7/);
assert.match(homeHeroSrc, /md:pb-6/);
assert.match(homeHeroSrc, /md:max-w-\[20rem\] lg:max-w-\[23\.5rem\]/);
assert.match(homeHeroSrc, /h-\[22\.5rem\]/);
assert.match(homeHeroSrc, /backgroundPosition: "28% 46%"/);
assert.match(homeHeroSrc, /backgroundSize: "auto 122%"/);
assert.match(homeHeroSrc, /bg-no-repeat/);
assert.match(homeHeroSrc, /maskImage/);
assert.match(homeHeroSrc, /whitespace-nowrap/);
assert.match(homeHeroSrc, /Every celebration/);
assert.match(homeHeroSrc, /begins here/);
assert.match(homeHeroSrc, /bg-paper\/80/);
assert.match(homeHeroSrc, /radial-gradient/);
assert.match(homeHeroSrc, /h-\[5\.35rem\] w-\[3\.55rem\]/);
assert.doesNotMatch(homeHeroSrc, /shadow-\[/);
assert.match(homeHeroSrc, /text-\[1\.98rem\]/);
assert.match(homeHeroSrc, /text-\[0\.82rem\]/);
assert.match(homeHeroSrc, /w-\[12\.5rem\]/);
assert.doesNotMatch(homeHeroSrc, /max-w-\[16\.75rem\]/);
assert.doesNotMatch(homeHeroSrc, /h-\[24\.5rem\]/);
assert.doesNotMatch(homeHeroSrc, /h-\[26\.25rem\]/);
assert.doesNotMatch(homeHeroSrc, /VIEW FULL CATALOG/);
assert.doesNotMatch(homeHeroSrc, /View Full Catalog/);
assert.match(homeHeroSrc, /absolute inset-x-0 top-0 z-20 md:relative/);
assert.doesNotMatch(
  homeHeroSrc,
  /2–3 days preorder · Quality ingredients · Made with care/,
);
assert.doesNotMatch(homeHeroSrc, /backgroundPosition: "30% 20%"/);
assert.doesNotMatch(homeHeroSrc, /backgroundSize: "auto 178%"/);
assert.doesNotMatch(homeHeroSrc, /h-\[18\.5rem\]/);
assert.match(homeHeroSrc, /h-7 w-7/);
assert.match(homeHeroSrc, /md:h-8 md:w-8/);
assert.doesNotMatch(homeHeroSrc, /md:h-9 md:w-9/);
assert.doesNotMatch(homeHeroSrc, /h-\[21\.5rem\]/);
assert.doesNotMatch(homeHeroSrc, /min-h-\[34rem\]/);
assert.doesNotMatch(homeHeroSrc, /object-\[64%_52%\]/);
assert.match(homeHeroSrc, /hidden[\s\S]*md:block[\s\S]*md:pb-6/);
assert.doesNotMatch(homeHeroSrc, /aspect-\[3\/2\]/);
assert.doesNotMatch(homeHeroSrc, /h-32/);
assert.doesNotMatch(homeHeroSrc, /listHomepagePopularCakes/);
assert.doesNotMatch(homeHeroSrc, /listStorefrontAvailableExtra/);

const freshCardSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontFreshPicksCard.tsx",
);
assert.match(freshCardSrc, /Fresh Picks/);
assert.match(freshCardSrc, /href="\/extra"/);
assert.match(freshCardSrc, /See Fresh Picks/);
assert.match(freshCardSrc, /View Fresh Picks/);
assert.match(freshCardSrc, /Extra cakes available for selected dates/);
assert.match(freshCardSrc, /For last-minute orders, subject to availability/);
assert.doesNotMatch(freshCardSrc, /limited-time pickup/);
assert.doesNotMatch(freshCardSrc, /earlier pickup/);
assert.match(freshCardSrc, /homepageFreshPicksAvailabilityLines/);
assert.doesNotMatch(freshCardSrc, /homepageFreshPicksDescription/);
assert.match(freshCardSrc, /homepageFreshPicksHorizon/);
assert.match(freshCardSrc, /homepageFreshPicksCountCopy/);
assert.match(freshCardSrc, /dense/);
assert.match(freshCardSrc, /tall/);
assert.match(freshCardSrc, /mt-2 space-y-0\.5/);
assert.doesNotMatch(freshCardSrc, /Today&apos;s Fresh Picks/);

const currentCollectionSrc = readSrc(
  "src/workspaces/storefront/home/HomeFeaturedCollection.tsx",
);
assert.match(currentCollectionSrc, /kicker/);
assert.match(currentCollectionSrc, /viewAllLabel/);
assert.match(currentCollectionSrc, /rounded-\[10px\]/);
assert.match(currentCollectionSrc, /aspect-square/);
assert.match(currentCollectionSrc, /overflow-x-auto/);
assert.match(currentCollectionSrc, /-mx-6/);
assert.match(currentCollectionSrc, /takeHomepageCollectionPreviewCakes/);
assert.match(currentCollectionSrc, /viewAllHref/);
assert.match(currentCollectionSrc, /View all →/);
assert.doesNotMatch(currentCollectionSrc, /See all →/);
assert.match(currentCollectionSrc, /items-baseline justify-between/);
assert.match(currentCollectionSrc, /bg-ink\/\[0\.035\]/);
assert.doesNotMatch(currentCollectionSrc, /border-ink\/\[0\.12\]/);
assert.doesNotMatch(currentCollectionSrc, /aspect-\[4\/5\]/);
assert.doesNotMatch(currentCollectionSrc, /01 \/ 02/);
assert.doesNotMatch(currentCollectionSrc, /VIEW FULL CATALOG/);
assert.match(homeSrc, /Current collection/);
assert.match(homeSrc, /Our current selection of cakes for your celebrations/);

const browseAllSrc = readSrc(
  "src/workspaces/storefront/home/HomeBrowseAllCakes.tsx",
);
assert.match(browseAllSrc, /href="\/browse"/);
assert.match(browseAllSrc, /Browse all cakes/);
assert.match(browseAllSrc, /Explore the full Whitebird collection/);
assert.match(browseAllSrc, /Catalogue/);
assert.doesNotMatch(browseAllSrc, /HomeDestinationCard/);

const freshSectionSrc = readSrc(
  "src/workspaces/storefront/home/HomeFreshPicksSection.tsx",
);
assert.match(freshSectionSrc, /Extra cakes available for selected dates/);
assert.match(freshSectionSrc, /For last-minute orders, subject to availability/);
assert.match(freshSectionSrc, /Nothing extra is available right now/);
assert.match(freshSectionSrc, /Check back here for last-minute cake availability/);
assert.match(freshSectionSrc, /\/extra\/\$\{pick\.id\}/);
assert.match(freshSectionSrc, /href="\/extra"/);
assert.match(freshSectionSrc, /rounded-\[10px\]/);
assert.match(freshSectionSrc, /aspect-square/);
assert.match(freshSectionSrc, /h-\[5\.5rem\] w-\[5\.5rem\]/);
assert.match(freshSectionSrc, /pick\.sizeLabel/);
assert.match(freshSectionSrc, /Last-minute/);
assert.doesNotMatch(freshSectionSrc, /-mt-6/);
assert.doesNotMatch(freshSectionSrc, /h-\[6\.75rem\]/);
assert.doesNotMatch(freshSectionSrc, /w-\[5\.4rem\]/);
assert.doesNotMatch(freshSectionSrc, /earlier pickup/);
assert.doesNotMatch(freshSectionSrc, /leftover/);
assert.doesNotMatch(freshSectionSrc, /clearance/);
assert.doesNotMatch(freshSectionSrc, /seasonal/);
assert.doesNotMatch(freshSectionSrc, /HomeDestinationCard/);

const extraSrc = readSrc("src/workspaces/storefront/home/StorefrontExtraPage.tsx");
assert.match(extraSrc, /Fresh Picks/);
assert.match(extraSrc, /freshPickAvailabilityLabel/);
assert.match(extraSrc, /No Fresh Picks right now/);
assert.match(extraSrc, /Photo coming soon/);
assert.match(extraSrc, /StorefrontHomeLink/);
assert.match(extraSrc, /Extra cakes available today or tomorrow/);
assert.match(extraSrc, /Limited quantities, available for pickup during the stated window/);
assert.doesNotMatch(extraSrc, /Through /);
assert.doesNotMatch(extraSrc, /Malaysia time/);
assert.doesNotMatch(extraSrc, /Today.?s Fresh Picks/);
assert.doesNotMatch(extraSrc, /Prepared /);
assert.doesNotMatch(extraSrc, /\/bakery\/extra/);
assert.doesNotMatch(extraSrc, /submit_guest_preorder/);
assert.match(extraSrc, /\/extra\/\$\{pick\.id\}/);
assert.match(extraSrc, /freshPickAvailabilityDateLabel/);
assert.match(extraSrc, /freshPickAvailabilityLabel\(pick\.days\)/);
assert.match(extraSrc, /pick\.days/);
assert.match(extraSrc, /formatRm/);
assert.match(extraSrc, /pick\.description/);
assert.match(extraSrc, /pick\.unitPrice/);
assert.match(extraSrc, /FRESH_PICKS_ORDER_CTA/);
assert.match(extraSrc, /overflow-hidden rounded-\[10px\]/);
assert.match(extraSrc, /md:h-\[12rem\]/);
assert.doesNotMatch(extraSrc, /md:min-h-\[12rem\]/);
assert.doesNotMatch(extraSrc, /monthly catalogue/);
assert.doesNotMatch(extraSrc, /×\s*2/);
assert.doesNotMatch(extraSrc, /units available/i);
assert.doesNotMatch(extraSrc, /View Details/);
assert.doesNotMatch(
  extraSrc,
  /Limited quantity, available for pickup during the stated window/,
);

const extraQueriesSrc = readSrc("src/workspaces/storefront/extra/queries.ts");
assert.match(extraQueriesSrc, /selectCustomerFreshPickOfferings/);
assert.match(extraQueriesSrc, /listStorefrontAvailableExtra/);
assert.match(extraQueriesSrc, /sortCustomerFreshPicksByAvailabilityDay/);
assert.match(extraQueriesSrc, /extraActionableFreshPickDays/);
assert.match(extraQueriesSrc, /freshPickProductDescription/);
assert.match(extraQueriesSrc, /library_cakes/);
assert.match(extraQueriesSrc, /library_cake_sizes/);
assert.match(extraQueriesSrc, /description: string \| null/);

const extraOrderSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
assert.match(extraOrderSrc, /overflow-hidden rounded-\[10px\]/);

const popularSrc = readSrc(
  "src/workspaces/storefront/home/HomePopularCakes.tsx",
);
assert.match(popularSrc, /overflow-hidden rounded-\[10px\]/);
assert.match(popularSrc, /h-24 w-24/);
assert.match(popularSrc, /w-24 shrink-0/);
assert.match(popularSrc, /Popular Cakes/);
assert.match(popularSrc, /formatHomepagePrice/);
assert.match(popularSrc, /View all →/);
assert.match(popularSrc, /cakes.length > 0 \?/);
assert.doesNotMatch(popularSrc, /aspect-\[4\/5\]/);
assert.doesNotMatch(popularSrc, /w-\[7\.5rem\]/);
assert.doesNotMatch(popularSrc, /if \(cakes.length === 0\) return null/);

const homeLinkSrc = readSrc("src/workspaces/storefront/StorefrontBrand.tsx");
assert.match(homeLinkSrc, /← Whitebird/);
assert.match(homeLinkSrc, /href="\/"/);

const middlewareSrc = readSrc("src/middleware.ts");
assert.match(middlewareSrc, /"\/extra"/);
assert.match(middlewareSrc, /startsWith\("\/extra\/"\)/);

const browseSrc = readSrc("src/workspaces/storefront/home/StorefrontBrowsePage.tsx");
assert.match(browseSrc, /listBrowsePublishedCakes/);
assert.match(browseSrc, /BrowseCakeCatalogue/);
assert.match(browseSrc, /href="\/order"/);
assert.match(browseSrc, /Explore the full Whitebird collection/);
assert.doesNotMatch(browseSrc, /Past menus/);
assert.doesNotMatch(browseSrc, /listHistoricalCatalogues/);
assert.doesNotMatch(browseSrc, /getCurrentCollection/);
assert.doesNotMatch(browseSrc, /submit_guest_preorder/);

const cardSrc = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
assert.match(cardSrc, /availabilityNote/);
assert.match(cardSrc, /text-status-danger/);
assert.match(cardSrc, /overflow-hidden rounded-\[10px\]/);

const photoImageSrc = readSrc("src/components/ui/CakePhotoImage.tsx");
assert.match(photoImageSrc, /overflow-hidden rounded-\[10px\]/);

const detailViewSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailView.tsx",
);
assert.match(detailViewSrc, /overflow-hidden rounded-\[10px\]/);

const addToOrderSrc = readSrc(
  "src/workspaces/storefront/cart/AddToOrderSheet.tsx",
);
assert.match(addToOrderSrc, /overflow-hidden rounded-\[10px\]/);

const cartSrc = readSrc(
  "src/workspaces/storefront/cart/StorefrontCartShell.tsx",
);
assert.match(cartSrc, /h-14 w-14 shrink-0 overflow-hidden rounded-\[10px\]/);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queriesSrc, /listBrowsePublishedCakes/);
assert.match(queriesSrc, /listHomepagePopularCakes/);
assert.match(queriesSrc, /show_in_popular_cakes/);
assert.match(queriesSrc, /comparePopularCakesOrder/);
assert.doesNotMatch(queriesSrc, /HOMEPAGE_POPULAR_CAKE_LIMIT/);
assert.doesNotMatch(queriesSrc, /HOMEPAGE_POPULAR_SCAN_LIMIT/);
assert.match(queriesSrc, /isCurrentlyCustomerOrderable/);
assert.match(queriesSrc, /eq\("status", "active"\)/);
assert.match(queriesSrc, /eq\("purpose", "monthly"\)/);
assert.match(queriesSrc, /getStorefrontCollectionForPickupDate/);
assert.match(queriesSrc, /storefront_collection_for_pickup_date/);

const orderSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontOrderCollectionsPage.tsx",
);
assert.match(browseSrc, /StorefrontHomeLink/);
assert.match(orderSrc, /Choose your collection/);
assert.match(orderSrc, /href="\/browse"/);
assert.match(orderSrc, /listOrderableMonthlyCatalogues/);
assert.match(orderSrc, /listCustomerSpecialCatalogues/);
assert.match(orderSrc, /SPECIAL_MENU_HEADING/);
assert.match(orderSrc, /customerSpecialMenuPeriodLabel/);
assert.match(orderSrc, /View & order/);
assert.match(orderSrc, /View Special Menu/);
assert.match(orderSrc, /SPECIAL_PERIOD_CAKES_NOTE/);
assert.match(orderSrc, /StorefrontHomeLink/);
assert.doesNotMatch(orderSrc, /GuestCheckoutForm/);
assert.doesNotMatch(orderSrc, /status === "draft"/);

const collectionPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionPageSrc, /StorefrontHomeLink/);
assert.match(collectionPageSrc, /collectionScopedCheckoutHref/);
assert.match(collectionPageSrc, /catalogueMonthPickupBounds/);
assert.match(collectionPageSrc, /getCustomerSpecialCatalogueById/);
assert.match(collectionPageSrc, /customerSpecialMenuPeriodLabel/);
assert.match(collectionPageSrc, /SPECIAL_PERIOD_CAKES_NOTE/);
assert.doesNotMatch(collectionPageSrc, /collection_id=/);
assert.match(collectionPageSrc, /suggestedPickupDateForCatalogueMonth/);
assert.match(collectionPageSrc, /href="\/browse"/);
assert.match(collectionPageSrc, /listAvailableCakes/);

const checkoutPageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
assert.match(checkoutPageSrc, /GuestCheckoutForm/);
assert.match(checkoutPageSrc, /suggestedPickupDate/);
assert.match(checkoutPageSrc, /latestOrderableCataloguePickupEnd/);
assert.match(checkoutPageSrc, /StorefrontHomeLink/);
assert.match(checkoutPageSrc, /resolveCheckoutPickupScope/);
assert.match(checkoutPageSrc, /pickupScopeFrom/);
assert.match(checkoutPageSrc, /entrySpecialUnavailableDates/);
assert.doesNotMatch(checkoutPageSrc, /collection_id/);
assert.doesNotMatch(checkoutPageSrc, /getCurrentCollection/);
assert.doesNotMatch(checkoutPageSrc, /addBusinessCalendarDays\(fromDate, 120\)/);

const checkoutRouteSrc = readSrc("src/app/order/checkout/page.tsx");
assert.match(checkoutRouteSrc, /params\.pickup/);
assert.doesNotMatch(checkoutRouteSrc, /collection_id/);

const orderRouteSrc = readSrc("src/app/order/page.tsx");
assert.match(orderRouteSrc, /StorefrontOrderCollectionsPage/);
assert.doesNotMatch(orderRouteSrc, /StorefrontCheckoutPage/);

const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
assert.match(actionsSrc, /getStorefrontCollectionForPickupDate/);
assert.match(actionsSrc, /loadCheckoutPickupOffer/);
assert.doesNotMatch(actionsSrc, /formData\.get\("collection_id"\)/);
assert.doesNotMatch(actionsSrc, /rpcArgs\.p_collection_id/);
assert.doesNotMatch(actionsSrc, /getCurrentCollection/);
assert.match(actionsSrc, /storefront_customer_preorder_options/);

const formSrc = readSrc("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
assert.match(formSrc, /loadCheckoutPickupOffer/);
assert.match(formSrc, /suggestedPickupDate/);
assert.match(formSrc, /resolveCartPickupDateBounds/);
assert.match(formSrc, /effectivePickupBounds/);
assert.doesNotMatch(formSrc, /name="collection_id"/);

const detailSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
assert.match(detailSrc, /getBrowsePublishedCakeById/);
assert.doesNotMatch(detailSrc, /getAvailableCakeById/);
assert.match(detailSrc, /CUSTOMER_PICKUP_DATE_CAKE_NOTICE/);

const panelSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPurchasePanel.tsx",
);
assert.match(panelSrc, /pickupScopeFrom/);
assert.match(panelSrc, /AddToOrderButton/);
assert.doesNotMatch(panelSrc, /formatCollectionAvailabilityLabel/);

const progressSrc = readSrc(
  "src/workspaces/storefront/cart/StorefrontCartShell.tsx",
);
assert.match(progressSrc, /preorderCheckoutHref/);
assert.match(progressSrc, /View Order/);
assert.match(progressSrc, /View My Order/);
assert.match(progressSrc, /Continue Ordering/);

const extraPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
assert.doesNotMatch(extraPageSrc, /PreorderInProgressBar/);
assert.doesNotMatch(extraPageSrc, /StorefrontCartShell/);

console.log("PASS storefront landing (25 Aug 2026 / September-before-August safety)");
