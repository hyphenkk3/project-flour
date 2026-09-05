"use server";

import type { StorefrontCake } from "@/types/storefront";
import { listBrowsePublishedCakes } from "@/workspaces/storefront/catalog/queries";

/** Live sizes/photos for in-cart editing. Display/UX; checkout still reloads. */
export async function loadCartEditCakes(
  cakeIds: readonly string[],
): Promise<StorefrontCake[]> {
  const wanted = new Set(cakeIds.map((id) => id.trim()).filter(Boolean));
  if (wanted.size === 0) return [];
  const cakes = await listBrowsePublishedCakes();
  return cakes.filter((cake) => wanted.has(cake.id));
}
