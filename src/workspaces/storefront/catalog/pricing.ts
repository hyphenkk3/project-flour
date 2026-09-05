import type { StorefrontCake, StorefrontCollection } from "@/types/storefront";

export function startingPrice(cake: Pick<StorefrontCake, "sizes">): number | null {
  if (cake.sizes.length === 0) return null;
  return Math.min(...cake.sizes.map((size) => size.price));
}

export function formatAvailableSizes(cake: StorefrontCake): string | null {
  if (cake.sizes.length === 0) return null;
  return cake.sizes.map((size) => size.size).join(" · ");
}

export function storefrontCategoryLabel(
  categoryName: string | null | undefined,
): string | null {
  const name = categoryName?.trim();
  return name ? name : null;
}

export function formatRm(amount: number): string {
  return `RM${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

/** Display-only. Do not use as authoritative preorder validation. */
export function formatPreorderRequirement(days: number): string {
  const n = Number.isInteger(days) && days >= 1 ? days : 2;
  return n === 1 ? "1 day preorder" : `${n} days preorder`;
}

export const PREORDER_VARIES_BY_SIZE_LABEL = "Preorder varies by size";

export type CakeCardPreorderBadgeTone = "standard" | "longer" | "varies";

function uniqueCakePreorderDays(
  cake: Pick<StorefrontCake, "sizes">,
): number | "varies" | null {
  if (cake.sizes.length === 0) return null;
  const unique = new Set(cake.sizes.map((size) => size.preorderDays));
  if (unique.size !== 1) return "varies";
  return cake.sizes[0]?.preorderDays ?? null;
}

/**
 * Cake-card preorder summary. Display only.
 * Same requirement across sizes → formatPreorderRequirement.
 * Mixed sizes → PREORDER_VARIES_BY_SIZE_LABEL (never a min/max).
 */
export function cakeCardPreorderLabel(
  cake: Pick<StorefrontCake, "sizes">,
): string | null {
  const days = uniqueCakePreorderDays(cake);
  if (days == null) return null;
  if (days === "varies") return PREORDER_VARIES_BY_SIZE_LABEL;
  return formatPreorderRequirement(days);
}

/**
 * Scan-badge emphasis from configured size lead times. Display only.
 * Same days across sizes: 1–2 → standard, 3+ → longer. Mixed → varies.
 */
export function cakeCardPreorderBadgeTone(
  cake: Pick<StorefrontCake, "sizes">,
): CakeCardPreorderBadgeTone | null {
  const days = uniqueCakePreorderDays(cake);
  if (days == null) return null;
  if (days === "varies") return "varies";
  if (!Number.isInteger(days) || days < 1) return "standard";
  return days >= 3 ? "longer" : "standard";
}

export function formatCollectionAvailabilityLabel(
  collection: StorefrontCollection,
): string {
  if (!collection.month) {
    return collection.name;
  }
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
