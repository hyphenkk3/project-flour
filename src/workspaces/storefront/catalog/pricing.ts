import type { StorefrontCake, StorefrontCollection } from "@/types/storefront";

export function startingPrice(cake: StorefrontCake): number | null {
  if (cake.sizes.length === 0) return null;
  return Math.min(...cake.sizes.map((size) => size.price));
}

export function formatRm(amount: number): string {
  return `RM${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

export function formatCollectionAvailabilityLabel(
  collection: StorefrontCollection,
): string {
  const month = collection.month.slice(0, 7);
  const [year, monthNum] = month.split("-").map(Number);
  if (!year || !monthNum) {
    return collection.name;
  }
  const label = new Intl.DateTimeFormat("en-SG", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNum - 1, 1));
  return `${label} Collection`;
}
