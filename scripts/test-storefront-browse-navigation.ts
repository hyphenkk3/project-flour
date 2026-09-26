/**
 * Browse navigation: hrefs stay, viewport cake-detail prefetch does not.
 * Run: npx tsx scripts/test-storefront-browse-navigation.ts
 *
 * Static only. Does not call Supabase or mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  browseCakeViewportPrefetchCount,
  cakeDetailPrefetchStartCount,
  prefetchCanonicalCakeDetail,
  resetCakeDetailPrefetchStateForTests,
} from "@/workspaces/storefront/catalog/cake-detail-prefetch";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const browsePage = readSrc("src/app/browse/page.tsx");
const browseSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
);
const catalogueSrc = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
const cardSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeCard.tsx",
);
const linkSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailLink.tsx",
);
const backSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailBackNav.tsx",
);
const probeSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontBrowsePerfProbe.tsx",
);

assert.match(browsePage, /StorefrontBrowsePage/);
assert.match(browseSrc, /listBrowsePublishedCakes/);
assert.match(browseSrc, /BrowseCakeCatalogue cakes=\{cakes\}/);
assert.match(browseSrc, /StorefrontBrowsePerfProbe cakeCount=\{cakes\.length\}/);
assert.match(catalogueSrc, /StorefrontCakeCard/);
assert.match(catalogueSrc, /detailHref=\{detailHrefs\?\.\[cake\.id\]\}/);

assert.equal(
  (cardSrc.match(/<StorefrontCakeDetailLink/g) ?? []).length,
  3,
);
assert.match(cardSrc, /detailHref \?\? `\/cakes\/\$\{cake\.id\}`/);
assert.doesNotMatch(cardSrc, /href=""/);

assert.match(linkSrc, /prefetch=\{false\}/);
assert.match(linkSrc, /onPointerDown/);
assert.match(linkSrc, /prefetchCanonicalCakeDetail/);
assert.match(linkSrc, /preloadStorefrontCakeHero/);
assert.match(linkSrc, /rememberStorefrontCakePaintHint/);
assert.match(linkSrc, /router\.prefetch/);
assert.doesNotMatch(linkSrc, /prefetch=\{true\}/);
assert.doesNotMatch(linkSrc, /prefetch=\{Boolean\(canonical\)\}/);

assert.match(backSrc, /resolveCakeDetailBackNav/);
assert.match(backSrc, /shouldRestoreCakeDetailBackFromHistory/);
assert.match(backSrc, /router\.back\(\)/);
assert.match(backSrc, /prefetch/);

const listingIntentSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontListingIntentPrefetch.tsx",
);
assert.match(listingIntentSrc, /router\.prefetch/);
assert.match(listingIntentSrc, /href === "\/browse"/);
assert.doesNotMatch(listingIntentSrc, /\/cakes\//);
assert.match(
  readSrc("src/workspaces/storefront/StorefrontShell.tsx"),
  /StorefrontListingIntentPrefetch/,
);
assert.match(
  readSrc("src/workspaces/storefront/StorefrontShell.tsx"),
  /StorefrontCakePaintRouteSync/,
);

assert.match(probeSrc, /BROWSE_NAV/);
assert.match(probeSrc, /viewportCakePrefetches: 0/);
assert.match(probeSrc, /intentPrefetchStarts/);
assert.match(probeSrc, /isDevPerfEnabled|logCheckoutClient/);

resetCakeDetailPrefetchStateForTests();
assert.equal(browseCakeViewportPrefetchCount(9), 0);
assert.equal(cakeDetailPrefetchStartCount(), 0);
assert.equal(
  prefetchCanonicalCakeDetail("/cakes/one", () => {}),
  true,
);
assert.equal(cakeDetailPrefetchStartCount(), 1);
assert.equal(browseCakeViewportPrefetchCount(27), 0);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queriesSrc, /listBrowsePublishedCakes/);
assert.doesNotMatch(browseSrc, /useEffect/);
assert.doesNotMatch(catalogueSrc, /listBrowsePublishedCakes/);
assert.doesNotMatch(catalogueSrc, /createClient/);

console.log("PASS storefront browse navigation");
