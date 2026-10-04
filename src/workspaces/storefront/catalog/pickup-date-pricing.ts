import type { StorefrontCake } from "@/types/storefront";

function validPickupDate(value: string | null | undefined): string | null {
  const date = value?.trim().slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Prefer a page-entry pickup date, falling back to the saved order date. */
export function cakeDetailPriceDate(
  pageEntryPickupDate: string | null | undefined,
  orderPickupDate: string | null | undefined,
): string | null {
  return validPickupDate(pageEntryPickupDate) ?? validPickupDate(orderPickupDate);
}

export function applyResolvedPickupDatePrices(
  cakes: readonly StorefrontCake[],
  prices: Readonly<Record<string, number>>,
): StorefrontCake[] {
  return cakes.map((cake) => ({
    ...cake,
    sizes: cake.sizes.map((size) => ({
      ...size,
      price: prices[size.id] ?? size.price,
    })),
  }));
}
