/**
 * Public storefront disables pinch-to-zoom. Staff layouts stay untouched.
 * Run: npx tsx scripts/test-storefront-viewport.ts
 *
 * Static only. Pinch gestures cannot be unit-tested here.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const viewportSrc = readSrc("src/workspaces/storefront/storefront-viewport.ts");
assert.match(viewportSrc, /export const storefrontViewport/);
assert.match(viewportSrc, /width: "device-width"/);
assert.match(viewportSrc, /initialScale: 1/);
assert.match(viewportSrc, /maximumScale: 1/);
assert.match(viewportSrc, /userScalable: false/);
assert.doesNotMatch(viewportSrc, /<meta[^>]*name=["']viewport["']/);

const lockSrc = readSrc("src/workspaces/storefront/StorefrontPinchZoomLock.tsx");
assert.match(lockSrc, /export function StorefrontPinchZoomLock/);
assert.match(lockSrc, /storefront-no-pinch-zoom/);
assert.match(lockSrc, /gesturestart/);
assert.match(lockSrc, /gesturechange/);
assert.doesNotMatch(lockSrc, /touchmove/);
assert.doesNotMatch(lockSrc, /<meta[^>]*name=["']viewport["']/);

const globalsSrc = readSrc("src/app/globals.css");
assert.match(globalsSrc, /html\.storefront-no-pinch-zoom/);
assert.match(globalsSrc, /html\.storefront-no-pinch-zoom img/);
assert.match(globalsSrc, /\[class\*="overflow-x-auto"\]/);
assert.match(globalsSrc, /touch-action:\s*pan-x\s+pan-y/);

const featuredSrc = readSrc(
  "src/workspaces/storefront/home/HomeFeaturedCollection.tsx",
);
const popularSrc = readSrc("src/workspaces/storefront/home/HomePopularCakes.tsx");
const freshSrc = readSrc(
  "src/workspaces/storefront/home/HomeFreshPicksSection.tsx",
);
assert.match(featuredSrc, /overflow-x-auto/);
assert.match(popularSrc, /overflow-x-auto/);
assert.match(freshSrc, /max-lg:contents/);
assert.match(freshSrc, /lg:overflow-x-auto/);

const publicLayouts = [
  "src/app/page.tsx",
  "src/app/browse/layout.tsx",
  "src/app/cakes/layout.tsx",
  "src/app/extra/layout.tsx",
  "src/app/faq/layout.tsx",
  "src/app/order/layout.tsx",
];
for (const rel of publicLayouts) {
  assert.equal(existsSync(resolve(process.cwd(), rel)), true, rel);
  const src = readSrc(rel);
  assert.match(src, /storefrontViewport/, rel);
  assert.match(src, /export const viewport/, rel);
  assert.match(src, /StorefrontPinchZoomLock/, rel);
  assert.doesNotMatch(src, /<meta[^>]*name=["']viewport["']/, rel);
}

const staffLayouts = [
  "src/app/layout.tsx",
  "src/app/(app)/layout.tsx",
  "src/app/(app)/bakery/layout.tsx",
  "src/app/(app)/collection/layout.tsx",
  "src/app/(app)/customer-operations/layout.tsx",
  "src/app/(app)/library/layout.tsx",
  "src/app/(app)/owner/layout.tsx",
  "src/app/login/page.tsx",
];
for (const rel of staffLayouts) {
  const src = readSrc(rel);
  assert.doesNotMatch(src, /storefrontViewport/, rel);
  assert.doesNotMatch(src, /StorefrontPinchZoomLock/, rel);
  assert.doesNotMatch(src, /userScalable: false/, rel);
  assert.doesNotMatch(src, /maximumScale: 1/, rel);
}

console.log("PASS storefront viewport pinch-zoom scope");
