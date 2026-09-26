/**
 * P0.3 — cake detail route loading shell (static).
 * Run: npx tsx scripts/test-storefront-cake-detail-loading.ts
 *
 * Does not call Supabase or mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const loadingRoute = "src/app/cakes/[id]/loading.tsx";
const loadingShell =
  "src/workspaces/storefront/catalog/StorefrontCakeDetailLoading.tsx";
const detailPage = "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx";
const detailRoute = "src/app/cakes/[id]/page.tsx";
const detailQuery = "src/workspaces/storefront/catalog/queries.ts";

assert.equal(existsSync(resolve(process.cwd(), loadingRoute)), true);
assert.equal(existsSync(resolve(process.cwd(), loadingShell)), true);

const loadingRouteSrc = readSrc(loadingRoute);
const loadingShellSrc = readSrc(loadingShell);
const combined = `${loadingRouteSrc}\n${loadingShellSrc}`;

assert.match(loadingRouteSrc, /StorefrontCakeDetailLoading/);
assert.doesNotMatch(loadingRouteSrc, /["']use client["']/);
assert.doesNotMatch(loadingShellSrc, /["']use client["']/);

assert.doesNotMatch(combined, /createClient|supabase|from\("/);
assert.doesNotMatch(combined, /cookies\(|sessionStorage|localStorage/);
assert.doesNotMatch(combined, /fetch\(|getBrowsePublishedCakeById/);
assert.doesNotMatch(
  combined,
  /listBrowsePublishedCakes|listStorefrontCakesByIds/,
);
assert.doesNotMatch(combined, /next\/image|CakePhotoImage/);
assert.doesNotMatch(combined, /useEffect|useState|useRouter/);

assert.match(loadingShellSrc, /bg-paper mx-auto min-h-screen max-w-5xl/);
assert.match(loadingShellSrc, /aspect-square/);
assert.match(
  loadingShellSrc,
  /lg:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(0,0\.95fr\)\]/,
);
assert.match(loadingShellSrc, /Opening cake/);
assert.match(loadingShellSrc, /aria-busy/);
assert.match(loadingShellSrc, /min-h-12/);
assert.match(
  loadingShellSrc,
  /h-\[calc\(4\.25rem\+env\(safe-area-inset-bottom,0px\)\)\] md:hidden/,
);

const detailSrc = readSrc(detailPage);
assert.match(detailSrc, /getBrowsePublishedCakeById/);
assert.doesNotMatch(detailSrc, /StorefrontCakeDetailLoading/);

const pageSrc = readSrc(detailRoute);
assert.match(pageSrc, /StorefrontCakeDetail/);
assert.doesNotMatch(pageSrc, /StorefrontCakeDetailLoading/);

const queriesSrc = readSrc(detailQuery);
assert.doesNotMatch(detailSrc, /createClient|cookies\(/);
assert.match(detailSrc, /loadCakeOfferVoucher|CakeOfferHint/);
assert.match(detailSrc, /offerPromise=\{offerPromise\}/);
const liveFn = detailSrc.slice(
  detailSrc.indexOf("async function CakeDetailLive"),
  detailSrc.indexOf("async function CakeDetailWithDisplay"),
);
const liveAll = liveFn.slice(
  liveFn.indexOf("Promise.all"),
  liveFn.indexOf("]);") + 2,
);
assert.match(liveAll, /livePromise/);
assert.doesNotMatch(liveAll, /offerPromise/);

const offerHintSrc = readSrc("src/workspaces/storefront/offers/CakeOfferHint.tsx");
assert.match(offerHintSrc, /listPublicCatalogueVouchers/);
assert.match(offerHintSrc, /catalogueVoucherAllowsOrderType/);
assert.doesNotMatch(offerHintSrc, /["']use client["']/);
assert.doesNotMatch(offerHintSrc, /CakeOfferHintView|fresh-pick-cart|createClient|cookies\(/);
assert.match(offerHintSrc, /try \{/);
assert.match(offerHintSrc, /return null/);

const offerCardSrc = readSrc("src/workspaces/storefront/offers/CakeOfferCard.tsx");
assert.match(offerCardSrc, /<aside/);
assert.match(offerCardSrc, /href="\/offers"/);
assert.match(offerCardSrc, /offer\.autoApplyNote/);
assert.match(
  readSrc("src/engines/vouchers/catalogue-promotion-presentation.ts"),
  /Automatically applied at checkout when eligible/,
);
assert.doesNotMatch(offerCardSrc, /Available for this cake|Discount available/);

const publicVoucherQueries = readSrc(
  "src/workspaces/vouchers/catalogue-queries.ts",
);
const publicListStart = publicVoucherQueries.indexOf(
  "async function loadPublicCatalogueVouchers",
);
const staffListStart = publicVoucherQueries.indexOf(
  "export async function listStaffCatalogueVouchers",
);
assert.ok(publicListStart >= 0 && staffListStart > publicListStart);
const publicListFn = publicVoucherQueries.slice(publicListStart, staffListStart);
assert.match(publicListFn, /createPublicClient/);
assert.doesNotMatch(publicListFn, /createClient\(/);
assert.doesNotMatch(publicListFn, /cookies\(/);

const detailFnStart = queriesSrc.indexOf(
  "async function loadLibraryCakeDisplayById",
);
assert.ok(detailFnStart >= 0);
const detailFnNext = queriesSrc.indexOf(
  "\nexport async function listHomepagePopularCakes",
  detailFnStart + 1,
);
const detailFn = queriesSrc.slice(
  detailFnStart,
  detailFnNext === -1 ? undefined : detailFnNext,
);
assert.match(detailFn, /\.eq\(\s*"id"/);
assert.match(detailFn, /createPublicClient/);
assert.match(detailFn, /loadLiveCakeCommercialState/);
assert.doesNotMatch(detailFn, /listBrowsePublishedCakes/);

console.log("PASS storefront cake detail loading shell");
