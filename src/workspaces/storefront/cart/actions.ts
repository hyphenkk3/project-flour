"use server";

import type { StorefrontCake } from "@/types/storefront";
import { listStorefrontCakesByIds } from "@/workspaces/storefront/catalog/queries";

/** Live sizes/photos for in-cart editing. Display/UX; checkout still reloads. */
export async function loadCartEditCakes(
  cakeIds: readonly string[],
): Promise<StorefrontCake[]> {
  return listStorefrontCakesByIds(cakeIds);
}
