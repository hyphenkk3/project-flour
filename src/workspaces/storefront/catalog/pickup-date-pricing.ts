import type { StorefrontCake } from "@/types/storefront";

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
