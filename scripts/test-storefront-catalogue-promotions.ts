/**
 * Storefront catalogue promotion discovery wiring.
 * Run: npx tsx scripts/test-storefront-catalogue-promotions.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const home = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.match(home, /listPublicCatalogueVouchers/);
assert.match(home, /sortCakesForCataloguePromotionPresentation/);
assert.match(home, /buildTargetedPromotionBadgeByCakeId/);
assert.match(home, /collectionMerchandising: true/);
assert.match(home, /cataloguePromotionPeriodFromWindow/);
assert.equal((home.match(/listPublicCatalogueVouchers\(\)/g) ?? []).length, 1);

const collectionPage = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionPage, /listPublicCatalogueVouchers/);
assert.match(collectionPage, /collectionMerchandising: true/);
assert.match(collectionPage, /sortCakesForCataloguePromotionPresentation/);

const browse = readSrc("src/workspaces/storefront/home/StorefrontBrowsePage.tsx");
assert.match(browse, /listPublicCatalogueVouchers/);
assert.match(browse, /buildTargetedPromotionBadgeByCakeId/);
assert.equal((browse.match(/listPublicCatalogueVouchers\(\)/g) ?? []).length, 1);

const card = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
assert.match(card, /StorefrontPromotionBadge/);
assert.doesNotMatch(card, /listPublicCatalogueVouchers/);

const featured = readSrc(
  "src/workspaces/storefront/home/HomeFeaturedCollection.tsx",
);
assert.match(featured, /StorefrontPromotionBadge/);
assert.doesNotMatch(featured, /listPublicCatalogueVouchers/);

const popular = readSrc("src/workspaces/storefront/home/HomePopularCakes.tsx");
assert.doesNotMatch(popular, /listPublicCatalogueVouchers/);

const catalogue = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
assert.match(catalogue, /promotions\?\.\[cake\.id\]/);
assert.doesNotMatch(catalogue, /listPublicCatalogueVouchers/);

const detail = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
assert.match(detail, /loadCakeOfferVoucher/);
assert.match(detail, /offerPromise=\{offerPromise\}/);
assert.doesNotMatch(detail, /<CakeOfferHint/);

const panel = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPurchasePanel.tsx",
);
assert.match(panel, /CakeOfferCard/);
assert.match(panel, /selectedSizeLabel=\{selectedSize\?\.size/);
assert.match(panel, /catalogueVoucherAppliesToPromotionPeriod/);
assert.match(panel, /CakeDetailOfferFromPromise/);
assert.match(panel, /<Suspense fallback=\{null\}>/);

const hint = readSrc("src/workspaces/storefront/offers/CakeOfferHint.tsx");
assert.match(hint, /cataloguePromotionPeriodFromWindow/);

const offerCard = readSrc("src/workspaces/storefront/offers/CakeOfferCard.tsx");
assert.match(offerCard, /View offer details/);
assert.doesNotMatch(offerCard, /Available for this cake|Discount available/);

const offersCard = readSrc(
  "src/workspaces/storefront/offers/CatalogueOfferCard.tsx",
);
assert.match(offersCard, /listCataloguePromotionOfferCakes/);
assert.match(offersCard, /offer\.sizeLine/);
assert.match(offersCard, /View cake →/);
assert.match(offersCard, /Browse cakes →/);

const prefetch = readSrc(
  "src/workspaces/storefront/catalog/cake-detail-prefetch.ts",
);
assert.match(prefetch, /return 0;/);

const link = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailLink.tsx",
);
assert.match(link, /prefetch=\{false\}/);
assert.match(link, /preloadStorefrontCakeHero/);

console.log("PASS storefront catalogue promotions");
