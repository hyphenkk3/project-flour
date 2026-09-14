/**
 * Customer-facing cake photo disclaimer placement.
 * Run: npx tsx scripts/test-cake-photo-disclaimer.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CAKE_PHOTO_DISCLAIMER } from "@/workspaces/storefront/catalog/CakePhotoDisclaimer";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.match(
  CAKE_PHOTO_DISCLAIMER,
  /Photos are for illustration purposes only/,
);
assert.match(CAKE_PHOTO_DISCLAIMER, /handmade/);

const componentSrc = readSrc(
  "src/workspaces/storefront/catalog/CakePhotoDisclaimer.tsx",
);
assert.match(componentSrc, /CAKE_PHOTO_DISCLAIMER/);
assert.doesNotMatch(componentSrc, /library/);

const browseSrc = readSrc("src/workspaces/storefront/home/StorefrontBrowsePage.tsx");
assert.match(browseSrc, /CakePhotoDisclaimer/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionSrc, /CakePhotoDisclaimer/);

const detailSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailView.tsx",
);
assert.match(detailSrc, /CakePhotoDisclaimer/);

const cardSrc = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
assert.doesNotMatch(
  cardSrc,
  /CakePhotoDisclaimer/,
  "Do not repeat the disclaimer on every cake card",
);

const libraryCakeForm = readSrc("src/workspaces/library/cakes/CakeForm.tsx");
assert.doesNotMatch(libraryCakeForm, /CakePhotoDisclaimer/);
assert.doesNotMatch(libraryCakeForm, /illustration purposes only/);

const ownerOrder = readSrc("src/workspaces/owner/OwnerOrderDetail.tsx");
assert.doesNotMatch(ownerOrder, /CakePhotoDisclaimer/);

console.log("PASS cake photo disclaimer");
