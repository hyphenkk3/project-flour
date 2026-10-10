"use server";

import {
  cartSizeAvailabilityError,
  isAvailabilityDate,
} from "@/engines/menu/cake-size-availability";
import type { StorefrontCake } from "@/types/storefront";
import { listStorefrontCakesByIds } from "@/workspaces/storefront/catalog/queries";

/** Live sizes/photos for in-cart editing. Display/UX; checkout still reloads. */
export async function loadCartEditCakes(
  cakeIds: readonly string[],
): Promise<StorefrontCake[]> {
  return listStorefrontCakesByIds(cakeIds);
}

/** Public, read-only validation. Never trust cached dates, prices or cake/size ownership. */
export async function validateCartSizeAvailability(
  items: readonly { cakeId: string; sizeId: string }[],
  pickupDate: string | null,
): Promise<{ error: string | null }> {
  if (
    !Array.isArray(items) ||
    items.length > 100 ||
    items.some(
      (item) =>
        !item ||
        typeof item.cakeId !== "string" ||
        typeof item.sizeId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(item.cakeId) ||
        !/^[0-9a-f-]{36}$/i.test(item.sizeId),
    )
  )
    return { error: "Choose valid cake sizes." };
  if (pickupDate !== null && typeof pickupDate !== "string")
    return { error: "Select a valid pickup date." };
  if (pickupDate && !isAvailabilityDate(pickupDate))
    return { error: "Select a valid pickup date." };
  try {
    const cakes = await listStorefrontCakesByIds([
      ...new Set(items.map((item) => item.cakeId)),
    ]);
    return { error: cartSizeAvailabilityError(items, cakes, pickupDate) };
  } catch {
    return {
      error: "Unable to check cake size availability. Please try again.",
    };
  }
}
