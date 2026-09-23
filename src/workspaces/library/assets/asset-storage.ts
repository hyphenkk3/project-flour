import {
  LIBRARY_CAKE_PHOTO_MAX_BYTES,
  validateLibraryCakePhotoFile,
} from "@/workspaces/library/cakes/photo-storage";

export const LIBRARY_ASSET_BUCKET = "library-assets";

export const LIBRARY_ASSET_MAX_BYTES = LIBRARY_CAKE_PHOTO_MAX_BYTES;

const EXTENSIONS = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function validateLibraryAssetImageFile(file: File): string | null {
  return validateLibraryCakePhotoFile(file);
}

export function libraryAssetObjectPath(input: {
  assetId: string;
  mimeType: string;
}): string {
  const ext = EXTENSIONS.get(input.mimeType) ?? "jpg";
  return `${input.assetId}/original.${ext}`;
}

export function libraryAssetReplacePath(input: {
  assetId: string;
  mimeType: string;
}): string {
  const ext = EXTENSIONS.get(input.mimeType) ?? "jpg";
  return `${input.assetId}/original-${Date.now()}.${ext}`;
}

export function isMissingAssetStorage(message: string): boolean {
  return /bucket not found|library-assets|row-level security/i.test(message);
}
