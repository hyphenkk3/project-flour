/**
 * Cake media / size-specific photo resolution.
 * Run: npx tsx scripts/test-library-cake-photos.ts
 *
 * Does not upload production photos, apply migrations, or mutate catalogue data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cakePhotoGallery,
  customerPhotoForEachSize,
  fallbackDefaultPhotoId,
  resolveCakePhoto,
  shouldAutoDefaultNewPhoto,
  suggestedDefaultPhotoId,
  type ResolvableCakePhoto,
} from "@/engines/menu/cake-photos";
import { mapStorefrontCake } from "@/workspaces/storefront/catalog/queries";
import { storefrontPhotoForSize } from "@/workspaces/storefront/catalog/cake-photo-map";
import {
  libraryCakePhotoObjectPath,
  LIBRARY_CAKE_PHOTO_BUCKET,
} from "@/workspaces/library/cakes/photo-storage";
import { PREORDER_DRAFT_KEY } from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function photo(
  partial: Partial<ResolvableCakePhoto> & Pick<ResolvableCakePhoto, "id" | "url">,
): ResolvableCakePhoto {
  return {
    altText: null,
    sortOrder: 0,
    cakeSizeId: null,
    isDefault: false,
    ...partial,
  };
}

const size4 = { id: "size-4", label: '4"' };
const size6 = { id: "size-6", label: '6"' };
const size8 = { id: "size-8", label: '8"' };
const sizes468 = [size4, size6, size8];

const photo4 = photo({
  id: "p4",
  url: "https://example.test/4.jpg",
  cakeSizeId: "size-4",
  sortOrder: 0,
});
const photo6 = photo({
  id: "p6",
  url: "https://example.test/6.jpg",
  cakeSizeId: "size-6",
  isDefault: true,
  sortOrder: 1,
});
const photo8 = photo({
  id: "p8",
  url: "https://example.test/8.jpg",
  cakeSizeId: "size-8",
  sortOrder: 2,
});
const photos468 = [photo4, photo6, photo8];

assert.equal(resolveCakePhoto(photos468, "size-4")?.id, "p4");
assert.equal(resolveCakePhoto(photos468, "size-6")?.id, "p6");
assert.equal(resolveCakePhoto(photos468, "size-8")?.id, "p8");
assert.equal(storefrontPhotoForSize(photos468, "size-4")?.id, "p4");
assert.equal(storefrontPhotoForSize(photos468, "size-6")?.id, "p6");
assert.equal(storefrontPhotoForSize(photos468, "size-8")?.id, "p8");

const missing8 = [photo4, photo6];
assert.equal(resolveCakePhoto(missing8, "size-8")?.id, "p6");
assert.equal(resolveCakePhoto(missing8, "size-4")?.id, "p4");
assert.equal(resolveCakePhoto(photos468)?.id, "p6");

assert.equal(suggestedDefaultPhotoId(photos468, sizes468), "p6");
assert.equal(
  suggestedDefaultPhotoId(
    [photo4, { ...photo6, isDefault: false }, photo8],
    sizes468,
  ),
  "p6",
);

assert.equal(
  shouldAutoDefaultNewPhoto({
    existing: [],
    newCakeSizeId: null,
    sizes: sizes468,
  }),
  true,
);
assert.equal(
  shouldAutoDefaultNewPhoto({
    existing: [photo({ id: "lifestyle", url: "https://example.test/g.jpg", isDefault: true })],
    newCakeSizeId: "size-6",
    sizes: sizes468,
  }),
  true,
);
assert.equal(
  shouldAutoDefaultNewPhoto({
    existing: [{ ...photo8, isDefault: true }],
    newCakeSizeId: "size-6",
    sizes: sizes468,
  }),
  false,
  "manual size-specific default is not stolen by a later 6\" photo",
);

const remainingAfterDefaultDeleted = [photo4, { ...photo8, isDefault: false }];
assert.equal(
  fallbackDefaultPhotoId({
    remaining: remainingAfterDefaultDeleted,
    sizes: sizes468,
    deletedWasDefault: true,
  }),
  "p4",
);

const sixInchLabel = { id: "size-6b", label: "6 inch" };
assert.equal(
  suggestedDefaultPhotoId(
    [
      photo({
        id: "p6b",
        url: "https://example.test/6b.jpg",
        cakeSizeId: "size-6b",
      }),
    ],
    [size4, sixInchLabel],
  ),
  "p6b",
);

const generalOnly = [
  photo({
    id: "g1",
    url: "https://example.test/g1.jpg",
    isDefault: true,
    sortOrder: 0,
  }),
];
assert.equal(resolveCakePhoto(generalOnly, "size-8")?.id, "g1");
assert.equal(resolveCakePhoto(generalOnly)?.id, "g1");
assert.equal(resolveCakePhoto([]), null);
assert.equal(resolveCakePhoto([], "size-6"), null);

const gallery = [
  photo6,
  photo({
    id: "close-up",
    url: "https://example.test/close.jpg",
    sortOrder: 3,
  }),
  photo({
    id: "lifestyle",
    url: "https://example.test/life.jpg",
    sortOrder: 4,
  }),
  photo8,
];
const hero = resolveCakePhoto(gallery, "size-6");
assert.deepEqual(
  cakePhotoGallery(gallery, hero).map((item) => item.id),
  ["close-up", "lifestyle"],
);

const previews = customerPhotoForEachSize(missing8, sizes468);
assert.equal(previews[0]?.exact, true);
assert.equal(previews[1]?.exact, true);
assert.equal(previews[2]?.exact, false);
assert.equal(previews[2]?.photo?.id, "p6");

const mapped = mapStorefrontCake({
  id: "cake-1",
  name: "Pandan",
  description: null,
  category: "classic",
  status: "active",
  sharing_guide: null,
  allergens: [],
  library_cake_sizes: [
    { id: "size-4", cake_id: "cake-1", label: '4"', price: 75, sort_order: 0 },
    { id: "size-6", cake_id: "cake-1", label: '6"', price: 125, sort_order: 1 },
  ],
  library_cake_photos: [
    {
      id: "p4",
      image_url: "https://example.test/4.jpg",
      alt_text: "4 inch",
      sort_order: 0,
      cake_size_id: "size-4",
      is_default: false,
    },
    {
      id: "p6",
      image_url: "https://example.test/6.jpg",
      alt_text: "6 inch",
      sort_order: 1,
      cake_size_id: "size-6",
      is_default: true,
    },
  ],
});
assert.equal(mapped.image, "https://example.test/6.jpg");
assert.equal(storefrontPhotoForSize(mapped.photos, "size-4")?.url, "https://example.test/4.jpg");
assert.equal(mapped.photos[0]?.cakeSizeId, "size-4");

const mappedLegacy = mapStorefrontCake({
  id: "cake-legacy",
  name: "Legacy",
  description: null,
  category: "classic",
  status: "active",
  sharing_guide: null,
  allergens: [],
  library_cake_sizes: [],
  library_cake_photos: [
    {
      image_url: "https://example.test/only.jpg",
      alt_text: null,
      sort_order: 0,
    },
  ],
});
assert.equal(mappedLegacy.image, "https://example.test/only.jpg");
assert.equal(mappedLegacy.photos[0]?.isDefault, false);
assert.equal(mappedLegacy.photos[0]?.cakeSizeId, null);

assert.equal(
  libraryCakePhotoObjectPath({
    cakeId: "cake-uuid",
    photoId: "photo-uuid",
    mimeType: "image/jpeg",
  }),
  "cake-uuid/photo-uuid/original.jpg",
);
assert.doesNotMatch(
  libraryCakePhotoObjectPath({
    cakeId: "cake-uuid",
    photoId: "photo-uuid",
    mimeType: "image/jpeg",
  }),
  /pandan/i,
);
assert.equal(LIBRARY_CAKE_PHOTO_BUCKET, "library-cake-photos");

assert.equal(PREORDER_DRAFT_KEY, "whitebird-preorder-draft-v1");

const engineSrc = readSrc("src/engines/menu/cake-photos.ts");
const mapSrc = readSrc("src/workspaces/storefront/catalog/cake-photo-map.ts");
const detailViewSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailView.tsx",
);
const cardSrc = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
const sheetSrc = readSrc("src/workspaces/storefront/cart/AddToOrderSheet.tsx");
const extraQuerySrc = readSrc("src/workspaces/storefront/extra/queries.ts");
const managerSrc = readSrc("src/workspaces/library/cakes/CakePhotoManager.tsx");
const photoActionsSrc = readSrc("src/workspaces/library/cakes/photo-actions.ts");
const cakeActionsSrc = readSrc("src/workspaces/library/cakes/actions.ts");
const migrationSrc = readSrc(
  "supabase/migrations/20260903180000_library_cake_photo_media.sql",
);
const draftSrc = readSrc("src/workspaces/storefront/checkout/preorder-draft.ts");
const cartSrc = readSrc("src/workspaces/storefront/cart/StorefrontCartShell.tsx");

assert.match(mapSrc, /resolveCakePhoto/);
assert.match(detailViewSrc, /storefrontPhotoForSize/);
assert.match(cardSrc, /storefrontDefaultPhoto/);
assert.match(sheetSrc, /storefrontPhotoForSize/);
assert.match(extraQuerySrc, /resolveCakePhoto/);
assert.match(managerSrc, /customerPhotoForEachSize/);
assert.match(engineSrc, /STANDARD_PRESENTATION_SIZE_INCHES = 6/);
assert.doesNotMatch(engineSrc, /is_default.*6"/);
assert.doesNotMatch(migrationSrc, /6-inch photo is always primary/i);

assert.match(photoActionsSrc, /canManageLibrary/);
assert.match(photoActionsSrc, /requireStaff/);
assert.match(photoActionsSrc, /LIBRARY_CAKE_PHOTO_BUCKET/);
assert.match(cakeActionsSrc, /saveCakeChildren/);
assert.doesNotMatch(cakeActionsSrc, /library_cake_photos/);
assert.doesNotMatch(cakeActionsSrc, /photo_urls/);
assert.doesNotMatch(cakeActionsSrc, /replaceCakePhotos/);

assert.match(migrationSrc, /add column if not exists cake_size_id/);
assert.match(migrationSrc, /add column if not exists is_default/);
assert.match(migrationSrc, /add column if not exists storage_path/);
assert.match(migrationSrc, /library-cake-photos/);
assert.match(migrationSrc, /r.code in \('owner', 'manager'\)/);
assert.doesNotMatch(migrationSrc, /'bakery'/);
assert.doesNotMatch(migrationSrc, /create policy[\s\S]*to anon/i);
assert.doesNotMatch(migrationSrc, /bytea/);

assert.match(draftSrc, /whitebird-preorder-draft-v1/);
assert.doesNotMatch(draftSrc, /imageUrl/);
assert.doesNotMatch(cartSrc, /storefrontPhotoForSize/);
assert.match(sheetSrc, /mergeDraftItem/);
assert.doesNotMatch(sheetSrc, /imageUrl:/);

console.log("PASS library cake photos");
