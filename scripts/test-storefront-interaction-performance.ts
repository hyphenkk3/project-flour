/**
 * Storefront interaction performance — navigation, prefetch, streaming.
 * Run: npx tsx scripts/test-storefront-interaction-performance.ts
 *
 * Static only. Does not call Supabase or mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const cakePage = readSrc("src/app/cakes/[id]/page.tsx");
assert.match(cakePage, /export default function CakePage/);
assert.doesNotMatch(cakePage, /export default async function/);
assert.doesNotMatch(cakePage, /await params/);
assert.match(cakePage, /StorefrontCakeDetail params=\{params\}/);

const cakeDetail = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
assert.match(cakeDetail, /Promise\.all/);
assert.match(cakeDetail, /displayPromise/);
assert.match(cakeDetail, /livePromise/);
assert.match(cakeDetail, /searchParams/);
assert.match(cakeDetail, /CakeDetailResolved/);
assert.doesNotMatch(cakeDetail, /force-dynamic/);

const cakeLink = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailLink.tsx",
);
assert.match(cakeLink, /prefetch=\{false\}/);
assert.match(cakeLink, /onPointerDown/);
assert.match(cakeLink, /prefetchCanonicalCakeDetail/);
assert.match(cakeLink, /markStorefrontNavIntent/);
assert.match(cakeLink, /preloadStorefrontCakeHero/);
assert.match(cakeLink, /urgent:\s*true/);
assert.match(cakeLink, /active:opacity-70/);
assert.doesNotMatch(cakeLink, /onIntent/);
assert.doesNotMatch(cakeLink, /useState/);
assert.doesNotMatch(cakeLink, /setDetailIntent/);

const cakeCard = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeCard.tsx",
);
assert.doesNotMatch(cakeCard, /detailIntent/);
assert.doesNotMatch(cakeCard, /useState/);
assert.match(cakeCard, /active:opacity-70/);

const popular = readSrc(
  "src/workspaces/storefront/home/HomePopularCakes.tsx",
);
assert.match(popular, /prefetch=\{false\}/);

const featured = readSrc(
  "src/workspaces/storefront/home/HomeFeaturedCollection.tsx",
);
assert.match(featured, /StorefrontCakeDetailLink/);
assert.doesNotMatch(featured, /<Link className="group block" href=\{href\}>/);
assert.match(popular, /active:opacity-70/);

const queries = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queries, /readCachedBrowsePublishedCakeById/);
assert.match(
  queries,
  /const readCachedBrowsePublishedCakeById = cache\(/,
);

const collectionPage = readSrc("src/app/order/collection/[id]/page.tsx");
assert.match(collectionPage, /export default function CollectionOrderPage/);
assert.doesNotMatch(collectionPage, /export default async function/);
assert.doesNotMatch(collectionPage, /await params/);

const collection = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collection, /CollectionCakesFromParams/);
assert.match(collection, /Suspense/);
assert.match(collection, /Promise\.all/);

const extraPage = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
assert.match(extraPage, /export function StorefrontExtraPage/);
assert.match(extraPage, /Suspense/);
assert.match(extraPage, /FreshPicksCatalogue/);
assert.match(extraPage, /listStorefrontAvailableExtra/);

const extraOrderRoute = readSrc("src/app/extra/[id]/page.tsx");
assert.match(extraOrderRoute, /export default function ExtraOrderRoute/);
assert.doesNotMatch(extraOrderRoute, /export default async function/);
assert.doesNotMatch(extraOrderRoute, /await params/);

const extraOrder = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
assert.match(extraOrder, /Promise\.all/);
assert.match(extraOrder, /getStorefrontExtraById/);
assert.match(extraOrder, /loadOperatingHoursSnapshot/);
assert.match(extraOrder, /loadFreshPicksPreparationConfig/);
assert.match(extraOrder, /Suspense/);
assert.doesNotMatch(extraOrder, /StorefrontCartShell/);

const checkoutRoute = readSrc("src/app/order/checkout/page.tsx");
assert.match(checkoutRoute, /export default function OrderCheckoutPage/);
assert.doesNotMatch(checkoutRoute, /await searchParams/);
assert.match(
  readSrc("src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx"),
  /useSearchParams/,
);

const addToOrder = readSrc(
  "src/workspaces/storefront/cart/AddToOrderSheet.tsx",
);
assert.match(addToOrder, /addingRef/);
assert.match(addToOrder, /setOpen\(true\)/);
assert.match(addToOrder, /active:opacity-80/);

const browse = readSrc(
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
);
assert.match(browse, /Suspense/);
assert.match(browse, /BrowseCakeCatalogue/);
assert.doesNotMatch(browse, /router\.refresh/);

const browseCatalogue = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
assert.doesNotMatch(browseCatalogue, /router\.push/);
assert.doesNotMatch(browseCatalogue, /router\.replace/);
assert.doesNotMatch(browseCatalogue, /router\.refresh/);

console.log("PASS storefront interaction performance");
