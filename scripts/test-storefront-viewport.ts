/**
 * Public storefront keeps a standard accessible viewport.
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
assert.doesNotMatch(viewportSrc, /maximumScale/);
assert.doesNotMatch(viewportSrc, /userScalable/);

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
  assert.doesNotMatch(src, /userScalable: false/, rel);
  assert.doesNotMatch(src, /maximumScale: 1/, rel);
}

console.log("PASS storefront viewport pinch-zoom scope");
