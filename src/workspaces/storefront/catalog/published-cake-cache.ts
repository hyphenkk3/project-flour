import { revalidateTag } from "next/cache";

export const STOREFRONT_PUBLISHED_CAKES_CACHE_TAG =
  "storefront-published-cakes";

export function storefrontCakeCacheTag(cakeId: string): string {
  return `storefront-cake-${cakeId}`;
}

/** Busts cached public cake *display* payloads (photos, copy, categories, tags). Publication, offerability, sizes, and prices are resolved live and do not depend on this cache. */
export function revalidateStorefrontPublishedCakeCache(cakeId?: string): void {
  revalidateTag(STOREFRONT_PUBLISHED_CAKES_CACHE_TAG, "max");
  if (cakeId) {
    revalidateTag(storefrontCakeCacheTag(cakeId), "max");
  }
}
