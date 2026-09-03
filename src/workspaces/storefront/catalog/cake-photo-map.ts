import { cakePhotoGallery, resolveCakePhoto } from "@/engines/menu/cake-photos";
import type { StorefrontCakePhoto } from "@/types/storefront";

export const STOREFRONT_CAKE_PHOTO_SELECT =
  "id, image_url, alt_text, sort_order, cake_size_id, is_default";

export const STOREFRONT_CAKE_PHOTO_SELECT_LEGACY =
  "image_url, alt_text, sort_order";

export type StorefrontCakePhotoRow = {
  id?: string | null;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  cake_size_id?: string | null;
  is_default?: boolean | null;
};

export function mapStorefrontCakePhoto(
  photo: StorefrontCakePhotoRow,
  index: number,
): StorefrontCakePhoto {
  return {
    id: photo.id?.trim() || `photo-${index}-${photo.sort_order}`,
    url: photo.image_url,
    altText: photo.alt_text,
    sortOrder: photo.sort_order,
    cakeSizeId: photo.cake_size_id ?? null,
    isDefault: Boolean(photo.is_default),
  };
}

export function storefrontDefaultPhoto(
  photos: readonly StorefrontCakePhoto[],
): StorefrontCakePhoto | null {
  return resolveCakePhoto(photos);
}

export function storefrontPhotoForSize(
  photos: readonly StorefrontCakePhoto[],
  sizeId?: string | null,
): StorefrontCakePhoto | null {
  return resolveCakePhoto(photos, sizeId);
}

export function storefrontPhotoGallery(
  photos: readonly StorefrontCakePhoto[],
  hero: StorefrontCakePhoto | null,
): StorefrontCakePhoto[] {
  return cakePhotoGallery(photos, hero);
}
