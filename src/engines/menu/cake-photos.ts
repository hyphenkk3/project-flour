import {
  cakeSizeNumericValue,
  compareCakeSizeLabels,
} from "@/engines/menu/cake-size-order";

/** Conventional presentation size when that size exists on the cake. Not a schema constraint. */
export const STANDARD_PRESENTATION_SIZE_INCHES = 6;

export type CakePhotoSizeRef = {
  id: string;
  label: string;
};

export type ResolvableCakePhoto = {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  cakeSizeId: string | null;
  isDefault: boolean;
};

export function isStandardPresentationSizeLabel(label: string): boolean {
  return cakeSizeNumericValue(label) === STANDARD_PRESENTATION_SIZE_INCHES;
}

export function standardPresentationSizeId(
  sizes: readonly CakePhotoSizeRef[],
): string | null {
  return (
    sizes.find((size) => isStandardPresentationSizeLabel(size.label))?.id ??
    null
  );
}

export function sortCakePhotos<T extends Pick<ResolvableCakePhoto, "sortOrder" | "id">>(
  photos: readonly T[],
): T[] {
  return [...photos].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id.localeCompare(b.id);
  });
}

function usablePhotos<T extends ResolvableCakePhoto>(photos: readonly T[]): T[] {
  return sortCakePhotos(photos.filter((photo) => Boolean(photo.url?.trim())));
}

/**
 * Shared storefront/Library photo resolution.
 *
 * 1. Exact photo for the selected size, when a size is selected.
 * 2. Configured default photo.
 * 3. First remaining photo by display order.
 * 4. Otherwise none (existing empty/photo-coming-soon behaviour).
 */
export function resolveCakePhoto<T extends ResolvableCakePhoto>(
  photos: readonly T[],
  selectedSizeId?: string | null,
): T | null {
  const ordered = usablePhotos(photos);
  if (ordered.length === 0) return null;

  const sizeId = selectedSizeId?.trim() || null;
  if (sizeId) {
    const exact = ordered.find((photo) => photo.cakeSizeId === sizeId);
    if (exact) return exact;
  }

  const configured = ordered.find((photo) => photo.isDefault);
  if (configured) return configured;

  return ordered[0] ?? null;
}

/** General/lifestyle photos shown beside the current hero. Size-specific product shots stay off the gallery. */
export function cakePhotoGallery<T extends ResolvableCakePhoto>(
  photos: readonly T[],
  hero: T | null,
): T[] {
  return usablePhotos(photos).filter(
    (photo) => photo.cakeSizeId == null && photo.id !== hero?.id,
  );
}

export function suggestedDefaultPhotoId(
  photos: readonly ResolvableCakePhoto[],
  sizes: readonly CakePhotoSizeRef[],
): string | null {
  const ordered = usablePhotos(photos);
  if (ordered.length === 0) return null;

  const standardId = standardPresentationSizeId(sizes);
  if (standardId) {
    const standardPhoto = ordered.find(
      (photo) => photo.cakeSizeId === standardId,
    );
    if (standardPhoto) return standardPhoto.id;
  }

  const configured = ordered.find((photo) => photo.isDefault);
  if (configured) return configured.id;

  return ordered[0]?.id ?? null;
}

/**
 * Promote a newly added/assigned 6" photo to default only when that would not
 * override a staff-chosen size-specific default.
 */
export function shouldAutoDefaultNewPhoto(input: {
  existing: readonly ResolvableCakePhoto[];
  newCakeSizeId: string | null;
  sizes: readonly CakePhotoSizeRef[];
}): boolean {
  const ordered = usablePhotos(input.existing);
  if (ordered.length === 0) return true;

  const currentDefault = ordered.find((photo) => photo.isDefault) ?? null;
  const standardId = standardPresentationSizeId(input.sizes);
  const newIsStandard =
    Boolean(standardId) && input.newCakeSizeId === standardId;

  if (!newIsStandard) return currentDefault == null;
  if (currentDefault == null) return true;
  return currentDefault.cakeSizeId == null;
}

export function fallbackDefaultPhotoId(input: {
  remaining: readonly ResolvableCakePhoto[];
  sizes: readonly CakePhotoSizeRef[];
  deletedWasDefault: boolean;
}): string | null {
  const remaining = usablePhotos(input.remaining);
  if (remaining.length === 0) return null;

  if (!input.deletedWasDefault) {
    const stillDefault = remaining.find((photo) => photo.isDefault);
    if (stillDefault) return stillDefault.id;
  }

  return suggestedDefaultPhotoId(
    remaining.map((photo) => ({ ...photo, isDefault: false })),
    input.sizes,
  );
}

export function sizeLabelForPhoto(
  photo: Pick<ResolvableCakePhoto, "cakeSizeId">,
  sizes: readonly CakePhotoSizeRef[],
): string | null {
  if (!photo.cakeSizeId) return null;
  return sizes.find((size) => size.id === photo.cakeSizeId)?.label ?? null;
}

function coveredSizeLabels(
  photos: readonly ResolvableCakePhoto[],
  sizes: readonly CakePhotoSizeRef[],
): string[] {
  const labels = new Set<string>();
  for (const photo of photos) {
    const label = sizeLabelForPhoto(photo, sizes);
    if (label) labels.add(label);
  }
  return [...labels].sort(compareCakeSizeLabels);
}

export function libraryPhotosHaveCoverage(
  photos: readonly Pick<ResolvableCakePhoto, "url">[],
): boolean {
  return photos.some((photo) => Boolean(photo.url?.trim()));
}

/**
 * Compact Cake Library listing copy. Reads actual photo records only.
 * Thumbnail resolution stays on resolveCakePhoto.
 */
export function formatCakePhotoCoverageLabel(
  photos: readonly ResolvableCakePhoto[],
  sizes: readonly CakePhotoSizeRef[],
): string {
  const usable = usablePhotos(photos);
  if (usable.length === 0) return "No photos";

  const sizeLabels = coveredSizeLabels(usable, sizes);
  const configuredDefault = usable.find((photo) => photo.isDefault) ?? null;
  const defaultSizeLabel = configuredDefault
    ? sizeLabelForPhoto(configuredDefault, sizes)
    : null;

  if (usable.length === 1) {
    if (sizeLabels.length === 1) {
      return `✓ ${sizeLabels[0]} photo`;
    }
    return "✓ Default photo";
  }

  const count =
    sizeLabels.length > 0
      ? `✓ ${usable.length} photos · ${sizeLabels.join(", ")}`
      : `✓ ${usable.length} photos`;

  if (!configuredDefault) return count;
  if (defaultSizeLabel) return `${count} · Default: ${defaultSizeLabel}`;
  return `${count} · Default`;
}

export type CustomerSizePhotoPreview<T extends ResolvableCakePhoto> = {
  size: CakePhotoSizeRef;
  photo: T | null;
  exact: boolean;
};

/** Library/storefront preview of what a customer sees for each size. */
export function customerPhotoForEachSize<T extends ResolvableCakePhoto>(
  photos: readonly T[],
  sizes: readonly CakePhotoSizeRef[],
): CustomerSizePhotoPreview<T>[] {
  return sizes.map((size) => {
    const photo = resolveCakePhoto(photos, size.id);
    return {
      size,
      photo,
      exact: Boolean(photo && photo.cakeSizeId === size.id),
    };
  });
}
