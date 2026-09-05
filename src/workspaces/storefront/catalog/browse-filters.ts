import type { StorefrontCake } from "@/types/storefront";
import { compareCakeSizeLabels } from "@/engines/menu/cake-size-order";
import { browseCategoryOptionsFromCakes } from "@/engines/menu/cake-categories";
import { filterBrowseCakesBySearch } from "@/workspaces/storefront/catalog/browse-search";
import {
  formatPreorderRequirement,
  formatRm,
} from "@/workspaces/storefront/catalog/pricing";

export type BrowseFilterCake = Pick<
  StorefrontCake,
  | "categoryId"
  | "categoryName"
  | "categoryActive"
  | "categorySortOrder"
  | "sizes"
>;

export type BrowsePriceRange = {
  id: string;
  min: number;
  max: number | null;
  label: string;
};

export type BrowseFilterState = {
  category: string;
  size: string;
  priceRangeId: string;
  preorderDays: number | null;
};

export const EMPTY_BROWSE_FILTERS: BrowseFilterState = {
  category: "",
  size: "",
  priceRangeId: "",
  preorderDays: null,
};

export function hasActiveBrowseFilters(filters: BrowseFilterState): boolean {
  return (
    filters.category !== "" ||
    filters.size !== "" ||
    filters.priceRangeId !== "" ||
    filters.preorderDays != null
  );
}

export function countActiveBrowseFilters(filters: BrowseFilterState): number {
  return (
    Number(filters.category !== "") +
    Number(filters.size !== "") +
    Number(filters.priceRangeId !== "") +
    Number(filters.preorderDays != null)
  );
}

export function priceInBrowseRange(
  price: number,
  range: BrowsePriceRange,
): boolean {
  if (price < range.min) return false;
  if (range.max == null) return true;
  return price < range.max;
}

function browsePriceStep(min: number, max: number): number {
  return max - min > 200 ? 100 : 50;
}

function browsePriceRangeLabel(min: number, max: number | null): string {
  if (max == null) return `${formatRm(min)} and above`;
  if (min <= 0) return `Under ${formatRm(max)}`;
  return `${formatRm(min)}–${formatRm(max - 1)}`;
}

/** Occupied price bands from loaded size prices. Empty when a single band would cover all. */
export function browsePriceRangesFromCatalogue(
  cakes: readonly BrowseFilterCake[],
): BrowsePriceRange[] {
  const prices = cakes.flatMap((cake) =>
    cake.sizes.map((size) => size.price).filter((price) => Number.isFinite(price)),
  );
  if (prices.length === 0) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const step = browsePriceStep(min, max);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step || step;
  const ranges: BrowsePriceRange[] = [];
  for (let from = start; from < end; from += step) {
    const to = from + step;
    const isLast = to >= end;
    const range: BrowsePriceRange = {
      id: isLast ? `${from}-up` : `${from}-${to}`,
      min: from,
      max: isLast ? null : to,
      label: browsePriceRangeLabel(from, isLast ? null : to),
    };
    if (prices.some((price) => priceInBrowseRange(price, range))) {
      ranges.push(range);
    }
  }
  return ranges.length > 1 ? ranges : [];
}

export function browseFilterOptionsFromCatalogue(
  cakes: readonly BrowseFilterCake[],
): {
  categories: Array<{ value: string; label: string }>;
  sizes: string[];
  priceRanges: BrowsePriceRange[];
  preorderDays: number[];
} {
  const categories = browseCategoryOptionsFromCakes(cakes);

  const sizeSet = new Set<string>();
  const daySet = new Set<number>();
  for (const cake of cakes) {
    for (const size of cake.sizes) {
      if (size.size) sizeSet.add(size.size);
      if (Number.isInteger(size.preorderDays) && size.preorderDays >= 1) {
        daySet.add(size.preorderDays);
      }
    }
  }

  return {
    categories,
    sizes: [...sizeSet].sort(compareCakeSizeLabels),
    priceRanges: browsePriceRangesFromCatalogue(cakes),
    preorderDays: [...daySet].sort((a, b) => a - b),
  };
}

export type BrowseFilterOptions = ReturnType<
  typeof browseFilterOptionsFromCatalogue
>;

/** Same visibility rules as the Browse filter controls. */
export function visibleBrowseFilterCount(options: BrowseFilterOptions): number {
  return (
    Number(options.categories.length > 1) +
    Number(options.sizes.length > 1) +
    Number(options.priceRanges.length > 0) +
    Number(options.preorderDays.length > 1)
  );
}

/**
 * Avoid a 4-column grid with a hole when Preorder (or another filter) is hidden.
 */
export function browseFilterGridClass(options: BrowseFilterOptions): string {
  const count = visibleBrowseFilterCount(options);
  if (count >= 4) return "grid gap-4 sm:grid-cols-2 lg:grid-cols-4";
  if (count === 3) return "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  return "grid gap-4 sm:grid-cols-2";
}

export function cakeMatchesBrowseFilters(
  cake: BrowseFilterCake,
  filters: BrowseFilterState,
  priceRanges: readonly BrowsePriceRange[] = [],
): boolean {
  if (filters.category && cake.categoryId !== filters.category) {
    return false;
  }
  if (filters.size && !cake.sizes.some((size) => size.size === filters.size)) {
    return false;
  }
  if (filters.priceRangeId) {
    const range = priceRanges.find((entry) => entry.id === filters.priceRangeId);
    if (!range) return false;
    if (!cake.sizes.some((size) => priceInBrowseRange(size.price, range))) {
      return false;
    }
  }
  if (
    filters.preorderDays != null &&
    !cake.sizes.some((size) => size.preorderDays === filters.preorderDays)
  ) {
    return false;
  }
  return true;
}

export function filterBrowseCakes<T extends BrowseFilterCake>(
  cakes: readonly T[],
  filters: BrowseFilterState,
  priceRanges: readonly BrowsePriceRange[],
): T[] {
  if (!hasActiveBrowseFilters(filters)) return [...cakes];
  return cakes.filter((cake) =>
    cakeMatchesBrowseFilters(cake, filters, priceRanges),
  );
}

/** Publication set → search → catalogue filters. */
export function filterBrowseCatalogue<T extends BrowseFilterCake & { name: string; description: string | null }>(
  cakes: readonly T[],
  query: string,
  filters: BrowseFilterState,
  priceRanges: readonly BrowsePriceRange[],
): T[] {
  return filterBrowseCakes(
    filterBrowseCakesBySearch(cakes, query),
    filters,
    priceRanges,
  );
}

export function preorderFilterLabel(days: number): string {
  return formatPreorderRequirement(days);
}
