import type { StorefrontCake, StorefrontCollection } from "@/types/storefront";
import {
  cakeCategoryRefsFromPrimary,
  formatCakeCategoryNames,
} from "@/engines/menu/cake-categories";
import { formatCakeTagNames } from "@/engines/menu/cake-tags";

export function startingPrice(cake: Pick<StorefrontCake, "sizes">): number | null {
  if (cake.sizes.length === 0) return null;
  return Math.min(...cake.sizes.map((size) => size.price));
}

export function formatAvailableSizes(cake: StorefrontCake): string | null {
  if (cake.sizes.length === 0) return null;
  return cake.sizes.map((size) => size.size).join(" · ");
}

export function storefrontCategoryLabel(
  cake: Pick<
    StorefrontCake,
    | "categoryName"
    | "categoryId"
    | "categoryActive"
    | "categorySortOrder"
    | "categories"
  > | string | null | undefined,
): string | null {
  if (typeof cake === "string" || cake == null) {
    const name = cake?.trim();
    return name ? name : null;
  }
  const names = formatCakeCategoryNames(cakeCategoryRefsFromPrimary(cake));
  return names || cake.categoryName?.trim() || null;
}

export function storefrontTagLabel(
  cake: Pick<StorefrontCake, "tags"> | null | undefined,
): string | null {
  if (!cake) return null;
  return formatCakeTagNames(cake.tags ?? []) || null;
}

export function formatRm(amount: number): string {
  return `RM${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

/**
 * True when the card shows a minimum/starting size price and a higher
 * size price exists. One size, or one shared price, is a fixed price.
 */
export function isStartingFromPrice(
  cake: Pick<StorefrontCake, "sizes">,
): boolean {
  if (cake.sizes.length <= 1) return false;
  const prices = cake.sizes.map((size) => size.price);
  const min = Math.min(...prices);
  return prices.some((price) => price > min);
}

/** Homepage card price. Appends "~" only for a true starting size price. */
export function formatHomepagePrice(
  cake: Pick<StorefrontCake, "sizes">,
): string | null {
  const from = startingPrice(cake);
  if (from == null) return null;
  return isStartingFromPrice(cake) ? `${formatRm(from)}~` : formatRm(from);
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
