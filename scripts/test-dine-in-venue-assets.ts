/**
 * Dine-in venue cards ← Library Asset ids.
 * Run: npx tsx scripts/test-dine-in-venue-assets.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_DINE_IN_VENUE_PHOTOS,
  dineInVenuePhoto,
  resolveDineInVenuePhotos,
} from "@/engines/orders/dine-in-venue-photos";
import { DINE_IN_VENUE_PHOTO_SRC } from "@/engines/orders/dine-in-party";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const hyphenActive = {
  venue: "hyphen",
  imageUrl: "https://example.test/library-assets/hyphen.jpg",
  altText: "Hyphen dining room",
  title: "Hyphen Venue",
  status: "active",
};
const whitebirdActive = {
  venue: "whitebird",
  imageUrl: "https://example.test/library-assets/whitebird.jpg",
  altText: "Whitebird dining room",
  title: "Whitebird Venue",
  status: "active",
};

const resolved = resolveDineInVenuePhotos([hyphenActive, whitebirdActive]);
assert.equal(resolved.hyphen?.src, hyphenActive.imageUrl);
assert.equal(resolved.hyphen?.alt, "Hyphen dining room");
assert.equal(resolved.whitebird?.src, whitebirdActive.imageUrl);
assert.equal(resolved.whitebird?.alt, "Whitebird dining room");
assert.equal(dineInVenuePhoto(resolved, "hyphen")?.src, hyphenActive.imageUrl);
assert.equal(
  dineInVenuePhoto(resolved, "whitebird")?.src,
  whitebirdActive.imageUrl,
);

const missing = resolveDineInVenuePhotos([hyphenActive]);
assert.equal(missing.hyphen?.src, hyphenActive.imageUrl);
assert.equal(missing.whitebird, null);

const inactive = resolveDineInVenuePhotos([
  hyphenActive,
  { ...whitebirdActive, status: "retired" },
]);
assert.equal(inactive.hyphen?.src, hyphenActive.imageUrl);
assert.equal(inactive.whitebird, null);

const blankUrl = resolveDineInVenuePhotos([
  { ...hyphenActive, imageUrl: "   " },
  whitebirdActive,
]);
assert.equal(blankUrl.hyphen, null);
assert.equal(blankUrl.whitebird?.src, whitebirdActive.imageUrl);

const fallbackAlt = resolveDineInVenuePhotos([
  { ...hyphenActive, altText: null },
]);
assert.equal(fallbackAlt.hyphen?.alt, "Hyphen Venue");

const nameFallback = resolveDineInVenuePhotos([
  { ...hyphenActive, altText: "  ", title: "  " },
]);
assert.equal(nameFallback.hyphen?.alt, "Hyphen");

assert.deepEqual(EMPTY_DINE_IN_VENUE_PHOTOS, {
  hyphen: null,
  whitebird: null,
});
assert.equal(DINE_IN_VENUE_PHOTO_SRC.hyphen, null);
assert.equal(DINE_IN_VENUE_PHOTO_SRC.whitebird, null);
assert.equal(dineInVenuePhoto(null, "hyphen"), null);
assert.equal(dineInVenuePhoto(undefined, "whitebird"), null);

const ignored = resolveDineInVenuePhotos([
  { ...hyphenActive, venue: "unknown" },
]);
assert.deepEqual(ignored, EMPTY_DINE_IN_VENUE_PHOTOS);

const migrationSrc = readSrc(
  "supabase/migrations/20260923170000_dine_in_venue_library_assets.sql",
);
const querySrc = readSrc("src/workspaces/storefront/dine-in/queries.ts");
const cardSrc = readSrc("src/components/ui/DineInVenuePartyFields.tsx");
const checkoutSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const extraSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const waitingSrc = readSrc(
  "src/workspaces/storefront/waiting-list/WaitingListConfirmationForm.tsx",
);
const uploadActionsSrc = readSrc("src/workspaces/library/assets/actions.ts");
const photoActionsSrc = readSrc(
  "src/workspaces/library/cakes/photo-actions.ts",
);

assert.match(migrationSrc, /create table if not exists public.dine_in_venue_assets/);
assert.match(migrationSrc, /venue public.dine_in_venue primary key/);
assert.match(migrationSrc, /references public.library_assets/);
assert.match(migrationSrc, /title = 'Hyphen Venue'/);
assert.match(migrationSrc, /title = 'Whitebird Venue'/);
assert.match(migrationSrc, /library_assets_public_select_dine_in_venues/);
assert.match(migrationSrc, /status = 'active'/);
assert.doesNotMatch(migrationSrc, /update public.library_assets/);
assert.doesNotMatch(migrationSrc, /bytea/);

assert.match(querySrc, /createPublicClient/);
assert.match(querySrc, /dine_in_venue_assets/);
assert.match(querySrc, /resolveDineInVenuePhotos/);
assert.doesNotMatch(querySrc, /service_role/);
assert.doesNotMatch(querySrc, /Hyphen Venue/);
assert.doesNotMatch(querySrc, /Whitebird Venue/);

assert.match(cardSrc, /photos\?: DineInVenuePhotoMap/);
assert.match(cardSrc, /dineInVenuePhoto\(photos, venue\)/);
assert.match(cardSrc, /alt=\{photo.alt\}/);
assert.match(cardSrc, /onError/);
assert.match(cardSrc, /aspect-\[16\/7\]/);
assert.match(cardSrc, /object-cover/);
assert.match(cardSrc, /object-center/);
assert.doesNotMatch(cardSrc, /h-16/);
assert.doesNotMatch(cardSrc, /supabase\.co/);
assert.doesNotMatch(cardSrc, /library-assets\//);

assert.match(checkoutSrc, /photos=\{venuePhotos\}/);
assert.match(extraSrc, /photos=\{venuePhotos\}/);
assert.match(waitingSrc, /photos=\{venuePhotos\}/);

assert.doesNotMatch(uploadActionsSrc, /dine_in_venue_assets/);
assert.match(photoActionsSrc, /LIBRARY_CAKE_PHOTO_BUCKET/);

console.log("PASS dine-in venue library assets");
