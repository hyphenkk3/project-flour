/**
 * Cake-detail intent prefetch — canonical only, deduped.
 * Run: npx tsx scripts/test-storefront-cake-detail-prefetch.ts
 *
 * Static only. Does not call Supabase or mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { storefrontCakeDetailHref } from "@/engines/menu/customer-browse";
import {
  browseCakeViewportPrefetchCount,
  cakeDetailPrefetchStartCount,
  canonicalCakeDetailPath,
  prefetchCanonicalCakeDetail,
  resetCakeDetailPrefetchStateForTests,
  wasCakeDetailPrefetchedForTests,
} from "@/workspaces/storefront/catalog/cake-detail-prefetch";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const CAKE_ID = "adad3bfa-8f40-46ec-afc4-ab03144a027c";
const canonical = storefrontCakeDetailHref(CAKE_ID);

assert.equal(canonicalCakeDetailPath(canonical), canonical);
assert.equal(canonicalCakeDetailPath(`/cakes/${CAKE_ID}`), canonical);
assert.equal(
  canonicalCakeDetailPath(
    `/cakes/${CAKE_ID}?pickup=2026-09-01&from=2026-09-01&to=2026-09-30`,
  ),
  null,
  "query-string cake URLs are never prefetched",
);
assert.equal(canonicalCakeDetailPath("/browse"), null);

resetCakeDetailPrefetchStateForTests();
const calls: string[] = [];
assert.equal(
  prefetchCanonicalCakeDetail(canonical, (path) => {
    calls.push(path);
  }),
  true,
);
assert.equal(
  prefetchCanonicalCakeDetail(canonical, (path) => {
    calls.push(path);
  }),
  false,
  "duplicate canonical prefetch is skipped",
);
assert.equal(
  prefetchCanonicalCakeDetail(
    `/cakes/${CAKE_ID}?from=2026-09-01&to=2026-09-30`,
    (path) => {
      calls.push(path);
    },
  ),
  false,
);
assert.deepEqual(calls, [canonical]);
assert.equal(wasCakeDetailPrefetchedForTests(canonical), true);
assert.equal(cakeDetailPrefetchStartCount(), 1);
assert.equal(browseCakeViewportPrefetchCount(9), 0);

resetCakeDetailPrefetchStateForTests();
const inflightCalls: string[] = [];
assert.equal(
  prefetchCanonicalCakeDetail("/cakes/one", () => {
    inflightCalls.push("one");
    return new Promise(() => {});
  }),
  true,
);
assert.equal(
  prefetchCanonicalCakeDetail("/cakes/two", () => {
    inflightCalls.push("two");
    return new Promise(() => {});
  }),
  true,
);
assert.equal(
  prefetchCanonicalCakeDetail("/cakes/three", () => {
    inflightCalls.push("three");
  }),
  false,
  "non-urgent prefetch is capped",
);
assert.equal(
  prefetchCanonicalCakeDetail(
    "/cakes/three",
    () => {
      inflightCalls.push("three-urgent");
    },
    { urgent: true },
  ),
  true,
  "pointerdown prefetch is not capped",
);
assert.deepEqual(inflightCalls, ["one", "two", "three-urgent"]);

resetCakeDetailPrefetchStateForTests();
assert.equal(wasCakeDetailPrefetchedForTests(canonical), false);
assert.equal(
  prefetchCanonicalCakeDetail("/cakes/other", () => {}),
  true,
);

const cardSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeCard.tsx",
);
assert.match(cardSrc, /StorefrontCakeDetailLink/);
assert.match(cardSrc, /detailHref \?\? `\/cakes\/\$\{cake\.id\}`/);
assert.doesNotMatch(cardSrc, /detailIntent/);
assert.doesNotMatch(cardSrc, /onIntent/);
assert.doesNotMatch(cardSrc, /useState/);

const linkSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailLink.tsx",
);
assert.match(linkSrc, /prefetch=\{false\}/);
assert.doesNotMatch(linkSrc, /prefetch=\{Boolean\(canonical\)\}/);
assert.doesNotMatch(linkSrc, /prefetch=\{true\}/);
assert.match(linkSrc, /onPointerDown/);
assert.match(linkSrc, /onPointerEnter/);
assert.match(linkSrc, /canonicalCakeDetailPath/);
assert.match(linkSrc, /prefetchCanonicalCakeDetail/);
assert.match(linkSrc, /router\.prefetch/);
assert.match(linkSrc, /urgent:\s*true/);
assert.match(linkSrc, /active:opacity-70/);
assert.doesNotMatch(linkSrc, /onIntent/);
assert.doesNotMatch(linkSrc, /intent && canonical/);

const homeSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontHomePage.tsx",
);
assert.match(homeSrc, /storefrontCakeDetailHref/);
assert.doesNotMatch(homeSrc, /collectionScopedCakeHref/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionSrc, /storefrontCakeDetailHref/);
assert.doesNotMatch(collectionSrc, /collectionScopedCakeHref/);

const popularSrc = readSrc(
  "src/workspaces/storefront/home/HomePopularCakes.tsx",
);
assert.match(popularSrc, /href=\{`\/cakes\/\$\{cake\.id\}`\}/);
assert.match(popularSrc, /prefetch=\{false\}/);

const featuredSrc = readSrc(
  "src/workspaces/storefront/home/HomeFeaturedCollection.tsx",
);
assert.match(featuredSrc, /StorefrontCakeDetailLink/);
assert.match(featuredSrc, /<StorefrontCakeDetailLink className="group block" href=\{href\}>/);
assert.doesNotMatch(
  featuredSrc,
  /<Link className="group block" href=\{href\}>/,
);
assert.match(featuredSrc, /href=\{viewAllHref\}/);

const offersCardSrc = readSrc(
  "src/workspaces/storefront/offers/CatalogueOfferCard.tsx",
);
assert.match(offersCardSrc, /href="\/browse"/);
assert.doesNotMatch(offersCardSrc, /\/cakes\//);

const cakeDetailSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
assert.match(cakeDetailSrc, /CakeOfferHint/);
assert.doesNotMatch(cakeDetailSrc, /createClient|cookies\(/);

const prefetchSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCakePrefetch.tsx",
);
assert.match(prefetchSrc, /canonicalCakeDetailPath/);
assert.doesNotMatch(prefetchSrc, /<Link/);
assert.doesNotMatch(prefetchSrc, /prefetch=/);
assert.doesNotMatch(prefetchSrc, /\?pickup=/);

const pickupSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPickupScope.tsx",
);
assert.match(pickupSrc, /resolveCakeDetailPickupScope/);
assert.match(pickupSrc, /getStoredCakeEntryScopeSnapshot/);
assert.doesNotMatch(pickupSrc, /useSearchParams/);

console.log("PASS storefront cake detail prefetch");
