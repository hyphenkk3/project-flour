/**
 * Browse → Cake Detail first-paint hint. Public metadata only.
 * Run: npx tsx scripts/test-storefront-cake-paint-hint.ts
 *
 * Static only. Does not call Supabase or mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { storefrontCakeDetailHref } from "@/engines/menu/customer-browse";
import {
  cakeIdFromCakeDetailPath,
  isStorefrontCakeDetailPaintReady,
  readStorefrontCakePaintHint,
  rememberStorefrontCakePaintHint,
  resetStorefrontCakePaintHintForTests,
  showStorefrontCakePaintOverlay,
} from "@/workspaces/storefront/catalog/storefront-cake-paint-hint";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const CAKE_ID = "adad3bfa-8f40-46ec-afc4-ab03144a027c";
const href = storefrontCakeDetailHref(CAKE_ID);
const imageSrc =
  "https://example.supabase.co/storage/v1/object/public/library-cake-photos/cake.png";

resetStorefrontCakePaintHintForTests();
assert.equal(cakeIdFromCakeDetailPath(href), CAKE_ID);
assert.equal(cakeIdFromCakeDetailPath("/browse"), null);
assert.equal(
  rememberStorefrontCakePaintHint({
    href: `${href}?pickup=2026-09-01`,
    name: "Avocado",
    imageSrc,
  }),
  null,
  "query-string cake URLs are never used as first-paint truth",
);

const remembered = rememberStorefrontCakePaintHint({
  href,
  name: "Avocado",
  imageSrc,
});
assert.deepEqual(remembered, {
  cakeId: CAKE_ID,
  name: "Avocado",
  imageSrc,
});
assert.deepEqual(readStorefrontCakePaintHint(CAKE_ID), remembered);
assert.equal(readStorefrontCakePaintHint("other"), null);
assert.equal(isStorefrontCakeDetailPaintReady(CAKE_ID), false);
assert.equal(showStorefrontCakePaintOverlay(), false);

const hintSrc = readSrc(
  "src/workspaces/storefront/catalog/storefront-cake-paint-hint.ts",
);
assert.match(hintSrc, /Opening cake/);
assert.match(hintSrc, /cakeHeroImageSrcSet/);
assert.match(hintSrc, /pointer-events-none/);
assert.doesNotMatch(hintSrc, /From RM|Add to Order|currentlyOffered|price/);
assert.doesNotMatch(hintSrc, /sessionStorage|localStorage|cookies\(/);

const viewSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailView.tsx",
);
assert.match(viewSrc, /markStorefrontCakeDetailPaintReady/);

const shellSrc = readSrc("src/workspaces/storefront/StorefrontShell.tsx");
assert.match(shellSrc, /StorefrontCakePaintRouteSync/);

const loadingSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailLoading.tsx",
);
assert.doesNotMatch(loadingSrc, /["']use client["']/);
assert.doesNotMatch(loadingSrc, /CakePhotoImage|showStorefrontCakePaintOverlay/);

console.log("PASS storefront cake paint hint");
