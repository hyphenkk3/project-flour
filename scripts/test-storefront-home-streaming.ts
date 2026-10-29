/**
 * Public Home streams chrome independently of live Fresh Picks and merchandising.
 * Run: npx tsx scripts/test-storefront-home-streaming.ts
 *
 * Static only. Does not call Supabase or mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const homeSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontHomePage.tsx",
);
assert.doesNotMatch(homeSrc, /force-dynamic/);
assert.match(homeSrc, /export async function StorefrontHomePage/);
assert.match(homeSrc, /<HomeHero/);
assert.match(homeSrc, /Suspense/);
assert.match(homeSrc, /HomeFreshPicksIsland/);
assert.match(homeSrc, /HomeMerchandisingIsland/);
assert.match(homeSrc, /listStorefrontAvailableExtra/);
assert.match(homeSrc, /listHomepagePopularCakes/);
assert.match(homeSrc, /listHomepageCollectionPreviewCakes/);
assert.match(homeSrc, /listOrderableMonthlyCatalogues/);
assert.match(homeSrc, /listCustomerSpecialCatalogues/);
assert.doesNotMatch(homeSrc, /listAvailableCakes/);
assert.doesNotMatch(homeSrc, /listBrowsePublishedCakes/);

const heroPosition = homeSrc.indexOf("<HomeHero");
const freshPicksBoundaryPosition = homeSrc.indexOf("<Suspense fallback={<HomeFreshPicksFallback");
const merchandisingBoundaryPosition = homeSrc.indexOf("<Suspense fallback={<HomeMerchandisingFallback");
assert.ok(
  heroPosition >= 0 &&
    heroPosition < freshPicksBoundaryPosition &&
    freshPicksBoundaryPosition < merchandisingBoundaryPosition,
  "the homepage hero is outside separate Fresh Picks and merchandising Suspense boundaries",
);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queriesSrc, /readCachedStorefrontCakesByIds/);
assert.match(queriesSrc, /STOREFRONT_MERCHANDISING_REVALIDATE_SECONDS/);
assert.match(queriesSrc, /createPublicClient/);

const popularStart = queriesSrc.indexOf(
  "async function loadHomepagePopularCakes",
);
assert.ok(popularStart >= 0);
const popularFn = queriesSrc.slice(
  popularStart,
  queriesSrc.indexOf(
    "export async function listHomepagePopularCakes",
    popularStart,
  ),
);
assert.match(popularFn, /createPublicClient/);
assert.match(popularFn, /\.eq\("show_in_popular_cakes", true\)/);
assert.match(popularFn, /readCachedStorefrontCakesByIds/);
assert.doesNotMatch(popularFn, /withEffectiveStorefrontPrices/);
assert.doesNotMatch(popularFn, /catch/);
assert.doesNotMatch(popularFn, /await createClient\(/);
const popularPublicFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listHomepagePopularCakes"),
  queriesSrc.indexOf("export async function listHomepagePopularCakes") + 240,
);
assert.match(popularPublicFn, /withEffectiveStorefrontPrices/);

const availableStart = queriesSrc.indexOf(
  "export async function listAvailableCakes",
);
const availableFn = queriesSrc.slice(
  availableStart,
  queriesSrc.indexOf(
    "async function loadHomepageCollectionPreviewCakes",
    availableStart,
  ),
);
assert.match(availableFn, /createPublicClient/);
assert.doesNotMatch(availableFn, /unstable_cache/);

const previewStart = queriesSrc.indexOf(
  "async function loadHomepageCollectionPreviewCakes",
);
const previewFn = queriesSrc.slice(
  previewStart,
  queriesSrc.indexOf(
    "const readCachedHomepageCollectionPreviewCakes",
    previewStart,
  ),
);
assert.match(previewFn, /\.select\("library_cake_id, homepage_sort_order"\)/);
assert.match(previewFn, /readCachedStorefrontCakesByIds/);
assert.doesNotMatch(previewFn, /withEffectiveStorefrontPrices/);
assert.doesNotMatch(previewFn, /catch/);
const previewPublicFn = queriesSrc.slice(
  queriesSrc.indexOf(
    "export async function listHomepageCollectionPreviewCakes",
  ),
  queriesSrc.indexOf("async function loadHomepagePopularCakes"),
);
assert.match(previewPublicFn, /withEffectiveStorefrontPrices/);

const browsePublicFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listBrowsePublishedCakes"),
  queriesSrc.indexOf("type LiveCakeCommercialRow"),
);
assert.match(
  browsePublicFn,
  /\.select\("collection_id, library_cake_id, sort_order"\)/,
);
assert.match(browsePublicFn, /readCachedStorefrontCakesByIds/);
assert.match(browsePublicFn, /withEffectiveStorefrontPrices/);

const extraSrc = readSrc("src/workspaces/storefront/extra/queries.ts");
assert.match(extraSrc, /createPublicClient/);
assert.match(extraSrc, /await connection\(\)/);
assert.match(extraSrc, /readCachedExtraPhotoRows = unstable_cache/);
assert.match(extraSrc, /revalidate: 60/);
assert.match(extraSrc, /STOREFRONT_PUBLISHED_CAKES_CACHE_TAG/);
assert.match(extraSrc, /temporarilyUnavailable: true/);
assert.match(extraSrc, /imageLookupFailed/);
const photoCacheStart = extraSrc.indexOf("const readCachedExtraPhotoRows =");
const photoLookupStart = extraSrc.indexOf("async function extraPhotosByCake(");
assert.ok(photoCacheStart >= 0 && photoLookupStart > photoCacheStart);
const photoCache = extraSrc.slice(photoCacheStart, photoLookupStart);
assert.match(photoCache, /library_cake_photos/);
assert.match(photoCache, /Throw so a transient read failure is never cached/);
assert.match(
  photoCache,
  /throw new Error\("Public cake photos are temporarily unavailable\."\)/,
);
assert.doesNotMatch(photoCache, /extra_stock/);
const photoLookup = extraSrc.slice(
  photoLookupStart,
  extraSrc.indexOf("async function extraDescriptionsByCake", photoLookupStart),
);
assert.match(photoLookup, /lookupFailed: true/);
assert.match(photoLookup, /lookupFailed: false/);
assert.doesNotMatch(extraSrc, /await createClient\(/);

const brandSrc = readSrc("src/workspaces/storefront/StorefrontBrand.tsx");
assert.match(brandSrc, /href="\/"/);
assert.match(brandSrc, /prefetch/);

const browseSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
);
assert.doesNotMatch(browseSrc, /force-dynamic/);
assert.match(browseSrc, /Suspense/);
assert.match(browseSrc, /listBrowsePublishedCakes/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.doesNotMatch(collectionSrc, /force-dynamic/);
assert.match(collectionSrc, /Promise\.all/);
assert.match(collectionSrc, /listAvailableCakes/);
assert.match(collectionSrc, /Suspense/);

assert.equal(
  existsSync(resolve(process.cwd(), "src/app/browse/loading.tsx")),
  true,
);
assert.equal(
  existsSync(
    resolve(process.cwd(), "src/app/order/collection/[id]/loading.tsx"),
  ),
  true,
);
assert.equal(
  existsSync(resolve(process.cwd(), "src/app/loading.tsx")),
  false,
  "root loading.tsx would wrap staff routes",
);

console.log("PASS storefront home streaming");
