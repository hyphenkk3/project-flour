/**
 * Library asset image upload — reuse cake-photo validation and storage pattern.
 * Run: npx tsx scripts/test-library-asset-upload.ts
 *
 * Does not upload production files, apply migrations, or change storefront pages.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canManageCakePhotos, canManageLibrary } from "@/foundation/navigation/access";
import {
  LIBRARY_ASSET_BUCKET,
  LIBRARY_ASSET_MAX_BYTES,
  libraryAssetObjectPath,
  libraryAssetReplacePath,
  validateLibraryAssetImageFile,
} from "@/workspaces/library/assets/asset-storage";
import {
  LIBRARY_CAKE_PHOTO_BUCKET,
  LIBRARY_CAKE_PHOTO_MAX_BYTES,
  validateLibraryCakePhotoFile,
} from "@/workspaces/library/cakes/photo-storage";
import { mapAsset } from "@/workspaces/library/assets/queries";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function fakeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

assert.equal(LIBRARY_ASSET_BUCKET, "library-assets");
assert.equal(LIBRARY_ASSET_MAX_BYTES, LIBRARY_CAKE_PHOTO_MAX_BYTES);
assert.equal(LIBRARY_CAKE_PHOTO_MAX_BYTES, 8 * 1024 * 1024);
assert.equal(LIBRARY_CAKE_PHOTO_BUCKET, "library-cake-photos");
assert.notEqual(LIBRARY_ASSET_BUCKET, LIBRARY_CAKE_PHOTO_BUCKET);

assert.equal(
  libraryAssetObjectPath({ assetId: "asset-uuid", mimeType: "image/jpeg" }),
  "asset-uuid/original.jpg",
);
assert.equal(
  libraryAssetObjectPath({ assetId: "asset-uuid", mimeType: "image/png" }),
  "asset-uuid/original.png",
);
assert.equal(
  libraryAssetObjectPath({ assetId: "asset-uuid", mimeType: "image/webp" }),
  "asset-uuid/original.webp",
);
assert.match(
  libraryAssetReplacePath({ assetId: "asset-uuid", mimeType: "image/jpeg" }),
  /^asset-uuid\/original-\d+\.jpg$/,
);
assert.notEqual(
  libraryAssetObjectPath({ assetId: "asset-a", mimeType: "image/jpeg" }),
  libraryAssetObjectPath({ assetId: "asset-b", mimeType: "image/jpeg" }),
);

const jpeg = fakeFile("hero.jpg", "image/jpeg", 128);
assert.equal(validateLibraryAssetImageFile(jpeg), null);
assert.equal(validateLibraryCakePhotoFile(jpeg), null);

assert.equal(
  validateLibraryAssetImageFile(fakeFile("notes.pdf", "application/pdf", 128)),
  "Use a JPEG, PNG, or WebP photo.",
);
assert.equal(
  validateLibraryAssetImageFile(fakeFile("empty.jpg", "image/jpeg", 0)),
  "That photo file is empty.",
);
assert.equal(
  validateLibraryAssetImageFile(
    fakeFile("huge.jpg", "image/jpeg", LIBRARY_ASSET_MAX_BYTES + 1),
  ),
  "Photos must be 8 MB or smaller.",
);
assert.equal(
  validateLibraryAssetImageFile(
    fakeFile("ok.jpg", "image/jpeg", LIBRARY_ASSET_MAX_BYTES),
  ),
  null,
);

assert.equal(canManageLibrary("owner"), true);
assert.equal(canManageLibrary("manager"), true);
assert.equal(canManageLibrary("bakery"), false);
assert.equal(canManageLibrary("customer_operations"), false);
assert.equal(canManageCakePhotos("bakery"), true);

const mapped = mapAsset({
  id: "asset-1",
  title: "Hyphen card later",
  kind: "general",
  image_url: "https://example.test/storage/v1/object/public/library-assets/asset-1/original.jpg",
  storage_path: "asset-1/original.jpg",
  alt_text: "Test",
  status: "active",
  created_at: "2026-09-23T00:00:00.000Z",
  updated_at: "2026-09-23T00:00:00.000Z",
});
assert.equal(mapped.imageUrl.includes("library-assets/asset-1/original.jpg"), true);
assert.equal(mapped.storagePath, "asset-1/original.jpg");

const formSrc = readSrc("src/workspaces/library/assets/AssetForm.tsx");
const actionsSrc = readSrc("src/workspaces/library/assets/actions.ts");
const storageSrc = readSrc("src/workspaces/library/assets/asset-storage.ts");
const migrationSrc = readSrc(
  "supabase/migrations/20260923160000_library_asset_image_upload.sql",
);
const detailSrc = readSrc("src/app/(app)/library/assets/[id]/page.tsx");
const photoActionsSrc = readSrc("src/workspaces/library/cakes/photo-actions.ts");
const photoStorageSrc = readSrc("src/workspaces/library/cakes/photo-storage.ts");
const photoManagerSrc = readSrc(
  "src/workspaces/library/cakes/CakePhotoManager.tsx",
);
const faqSrc = readSrc("src/workspaces/storefront/home/StorefrontFaqPage.tsx");
const faqPageSrc = readSrc("src/app/faq/page.tsx");

assert.match(storageSrc, /validateLibraryCakePhotoFile/);
assert.match(storageSrc, /LIBRARY_CAKE_PHOTO_MAX_BYTES/);
assert.doesNotMatch(storageSrc, /library-cake-photos/);

assert.match(formSrc, /type="file"/);
assert.match(formSrc, /accept=\{ACCEPTED_TYPES\}/);
assert.match(formSrc, /image\/jpeg,image\/png,image\/webp/);
assert.match(formSrc, /createObjectURL/);
assert.match(formSrc, /revokeObjectURL/);
assert.match(formSrc, /Remove selection/);
assert.match(formSrc, /required=\{mode === "create"\}/);
assert.doesNotMatch(formSrc, /name="image_url"/);
assert.doesNotMatch(formSrc, /Paste an image URL/);
assert.match(formSrc, /The image uploads when you save/);

assert.match(actionsSrc, /canManageLibrary/);
assert.match(actionsSrc, /requireStaff/);
assert.match(actionsSrc, /LIBRARY_ASSET_BUCKET/);
assert.match(actionsSrc, /validateLibraryAssetImageFile/);
assert.match(actionsSrc, /upsert: false/);
assert.match(actionsSrc, /\.remove\(\[path\]\)/);
assert.match(actionsSrc, /libraryAssetReplacePath/);
assert.match(actionsSrc, /storage_path/);
assert.match(actionsSrc, /getPublicUrl/);
assert.doesNotMatch(actionsSrc, /library-cake-photos/);
assert.doesNotMatch(actionsSrc, /canManageCakePhotos/);
assert.doesNotMatch(actionsSrc, /NEXT_PUBLIC_SUPABASE_SERVICE/);
assert.doesNotMatch(actionsSrc, /service_role/);
assert.doesNotMatch(actionsSrc, /base64/);

assert.match(migrationSrc, /library-assets/);
assert.match(migrationSrc, /add column if not exists storage_path/);
assert.match(migrationSrc, /8388608/);
assert.match(migrationSrc, /image\/jpeg/);
assert.match(migrationSrc, /r.code in \('owner', 'manager'\)/);
assert.doesNotMatch(migrationSrc, /'bakery'/);
assert.doesNotMatch(migrationSrc, /create policy[\s\S]*to anon/i);
assert.doesNotMatch(migrationSrc, /bytea/);
assert.doesNotMatch(migrationSrc, /bucket_id = 'library-cake-photos'/);
assert.match(migrationSrc, /bucket_id = 'library-assets'/);

assert.match(detailSrc, /asset\.imageUrl/);
assert.doesNotMatch(detailSrc, /dine-in/);
assert.doesNotMatch(detailSrc, /STOREFRONT_FAQ/);

assert.match(photoActionsSrc, /LIBRARY_CAKE_PHOTO_BUCKET/);
assert.match(photoActionsSrc, /canManageCakePhotos/);
assert.match(photoStorageSrc, /library-cake-photos/);
assert.match(photoManagerSrc, /accept="image\/jpeg,image\/png,image\/webp"/);

assert.doesNotMatch(faqSrc, /library-assets/);
assert.doesNotMatch(faqPageSrc, /library-assets/);
assert.doesNotMatch(formSrc, /hyphen/i);
assert.doesNotMatch(actionsSrc, /dine-in/i);

console.log("PASS library asset image upload");
