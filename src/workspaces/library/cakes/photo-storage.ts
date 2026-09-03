export const LIBRARY_CAKE_PHOTO_BUCKET = "library-cake-photos";

export const LIBRARY_CAKE_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function libraryCakePhotoObjectPath(input: {
  cakeId: string;
  photoId: string;
  mimeType: string;
}): string {
  const ext = ALLOWED_TYPES.get(input.mimeType) ?? "jpg";
  return `${input.cakeId}/${input.photoId}/original.${ext}`;
}

export function libraryCakePhotoReplacePath(input: {
  cakeId: string;
  photoId: string;
  mimeType: string;
}): string {
  const ext = ALLOWED_TYPES.get(input.mimeType) ?? "jpg";
  return `${input.cakeId}/${input.photoId}/original-${Date.now()}.${ext}`;
}

export function validateLibraryCakePhotoFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Use a JPEG, PNG, or WebP photo.";
  }
  if (file.size <= 0) {
    return "That photo file is empty.";
  }
  if (file.size > LIBRARY_CAKE_PHOTO_MAX_BYTES) {
    return "Photos must be 8 MB or smaller.";
  }
  return null;
}

export function isMissingCakePhotoSchema(message: string): boolean {
  return /cake_size_id|is_default|storage_path|schema cache|does not exist/i.test(
    message,
  );
}

export function isMissingCakePhotoStorage(message: string): boolean {
  return /bucket not found|library-cake-photos|row-level security/i.test(
    message,
  );
}
