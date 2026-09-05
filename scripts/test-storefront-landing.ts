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
  homepageFreshPicksCountCopy,
  homepageFreshPicksDescription,
  homepageFreshPicksHorizon,
} from "@/engines/extra/customer-fresh-picks";
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

const homeSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.match(homeSrc, /Order a Cake/);
assert.match(homeSrc, /href="\/order"/);
assert.match(homeSrc, /Browse Cakes/);
assert.match(homeSrc, /href="\/browse"/);
assert.match(homeSrc, /StorefrontFreshPicksCard/);
assert.match(homeSrc, /days=\{picks\.map\(\(pick\) => pick\.day\)\}/);
assert.match(homeSrc, /listStorefrontAvailableExtra/);
assert.doesNotMatch(homeSrc, /listAvailableCakes/);
assert.doesNotMatch(homeSrc, /getCurrentCollection/);
assert.doesNotMatch(homeSrc, /submit_guest_preorder/);
assert.doesNotMatch(homeSrc, /collection_id/);
assert.doesNotMatch(homeSrc, /Only 3 cakes remaining today/);

const freshCardSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontFreshPicksCard.tsx",
);
assert.match(freshCardSrc, /Fresh Picks/);
assert.match(freshCardSrc, /href="\/extra"/);
assert.match(freshCardSrc, /View Fresh Picks/);
assert.match(freshCardSrc, /homepageFreshPicksDescription/);
assert.match(freshCardSrc, /homepageFreshPicksHorizon/);
assert.match(freshCardSrc, /homepageFreshPicksCountCopy/);
assert.doesNotMatch(freshCardSrc, /Today&apos;s Fresh Picks/);

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
assert.doesNotMatch(extraSrc, /monthly catalogue/);
assert.doesNotMatch(extraSrc, /×\s*2/);
assert.doesNotMatch(extraSrc, /units available/i);

const extraQueriesSrc = readSrc("src/workspaces/storefront/extra/queries.ts");
assert.match(extraQueriesSrc, /selectCustomerFreshPickOfferings/);
assert.match(extraQueriesSrc, /listStorefrontAvailableExtra/);

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
assert.match(browseSrc, /listHistoricalCatalogues/);
assert.match(browseSrc, /Past menus/);
assert.doesNotMatch(browseSrc, /getCurrentCollection/);
assert.doesNotMatch(browseSrc, /submit_guest_preorder/);

const cardSrc = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
assert.match(cardSrc, /availabilityNote/);
assert.match(cardSrc, /text-status-danger/);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queriesSrc, /listBrowsePublishedCakes/);
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
