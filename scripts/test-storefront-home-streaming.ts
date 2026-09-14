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

const homeSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.doesNotMatch(homeSrc, /force-dynamic/);
assert.match(homeSrc, /export function StorefrontHomePage/);
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

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queriesSrc, /homepageCakeCardEmbedSelect/);
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
assert.match(popularFn, /homepageCakeCardEmbedSelect/);
assert.doesNotMatch(popularFn, /await createClient\(/);

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

const extraSrc = readSrc("src/workspaces/storefront/extra/queries.ts");
assert.match(extraSrc, /createPublicClient/);
assert.match(extraSrc, /await connection\(\)/);
assert.doesNotMatch(extraSrc, /unstable_cache/);
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

assert.equal(existsSync(resolve(process.cwd(), "src/app/browse/loading.tsx")), true);
assert.equal(
  existsSync(resolve(process.cwd(), "src/app/order/collection/[id]/loading.tsx")),
  true,
);
assert.equal(
  existsSync(resolve(process.cwd(), "src/app/loading.tsx")),
  false,
  "root loading.tsx would wrap staff routes",
);

console.log("PASS storefront home streaming");
