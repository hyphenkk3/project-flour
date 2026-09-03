/**
 * Phase 4.2.6 — customer catalogue menu/context links (static).
 * Run: npx tsx scripts/test-storefront-browse-context.ts
 *
 * Does not mutate catalogues, cakes, carts, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const homeSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.match(homeSrc, /href="\/order"/);
assert.match(homeSrc, /href="\/browse"/);
assert.match(homeSrc, /StorefrontFreshPicksCard/);
assert.match(homeSrc, /monthly collection or Special Menu/);
assert.doesNotMatch(homeSrc, /step by step/);
assert.doesNotMatch(homeSrc, /listBrowsePublishedCakes/);
assert.doesNotMatch(homeSrc, /writePreorderDraft/);

const browseSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
);
assert.match(browseSrc, /listBrowsePublishedCakes/);
assert.match(browseSrc, /BrowseCakeCatalogue/);
assert.match(browseSrc, /href="\/order"/);
assert.doesNotMatch(browseSrc, /writePreorderDraft/);

const orderSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontOrderCollectionsPage.tsx",
);
assert.match(orderSrc, /listOrderableMonthlyCatalogues/);
assert.match(orderSrc, /listCustomerSpecialCatalogues/);
assert.match(orderSrc, /Choose your collection/);
assert.match(orderSrc, /href="\/browse"/);
assert.doesNotMatch(orderSrc, /listBrowsePublishedCakes/);
assert.doesNotMatch(orderSrc, /BrowseCakeCatalogue/);
assert.doesNotMatch(orderSrc, /GuestCheckoutForm/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionSrc, /listAvailableCakes/);
assert.match(collectionSrc, /href="\/order"/);
assert.match(collectionSrc, /href="\/browse"/);
assert.doesNotMatch(collectionSrc, /BrowseCakeCatalogue/);
assert.doesNotMatch(collectionSrc, /filterBrowseCatalogue/);
assert.doesNotMatch(collectionSrc, /viewBrowseCatalogue/);

const detailSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
assert.match(detailSrc, /getBrowsePublishedCakeById/);
assert.match(detailSrc, /StorefrontCakeDetailView/);
assert.match(detailSrc, /fromCollection \? "\/order" : "\/browse"/);
assert.doesNotMatch(detailSrc, /router\.push/);
assert.doesNotMatch(detailSrc, /writePreorderDraft/);

const extraSrc = readSrc("src/workspaces/storefront/home/StorefrontExtraPage.tsx");
assert.match(extraSrc, /Fresh Picks/);
assert.doesNotMatch(extraSrc, /PreorderInProgressBar/);
assert.doesNotMatch(extraSrc, /StorefrontCartShell/);
assert.doesNotMatch(extraSrc, /listBrowsePublishedCakes/);

const extraOrderSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
assert.doesNotMatch(extraOrderSrc, /PreorderInProgressBar/);
assert.doesNotMatch(extraOrderSrc, /StorefrontCartShell/);
assert.doesNotMatch(extraOrderSrc, /AddToOrderButton/);

const browseRedirectSrc = readSrc("src/app/browse/[id]/page.tsx");
assert.match(browseRedirectSrc, /redirect\(`\/cakes\/\$\{id\}`\)/);

const pastMenuRouteSrc = readSrc("src/app/browse/menu/[id]/page.tsx");
assert.match(pastMenuRouteSrc, /StorefrontPastMenuPage/);

const addCakeSrc = readSrc("src/app/order/add-cake/page.tsx");
assert.match(addCakeSrc, /redirect\("\/browse"\)/);

const extraRouteSrc = readSrc("src/app/extra/page.tsx");
assert.match(extraRouteSrc, /StorefrontExtraPage/);

const cardSrc = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
assert.match(cardSrc, /cakeCardPreorderLabel/);
assert.match(cardSrc, /AddToOrderButton/);

const catalogueSrc = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
assert.match(catalogueSrc, /viewBrowseCatalogue/);
assert.match(catalogueSrc, /filterBrowseCatalogue|browseFilterOptionsFromCatalogue/);
assert.match(catalogueSrc, /BROWSE_SORT_OPTIONS/);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queriesSrc, /isCurrentlyCustomerOrderable/);
assert.match(queriesSrc, /listBrowsePublishedCakes/);

console.log("PASS storefront browse context");
