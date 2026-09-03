import type { StorefrontCake } from "@/types/storefront";
import {
  filterBrowseCatalogue,
  type BrowseFilterState,
  type BrowsePriceRange,
} from "@/workspaces/storefront/catalog/browse-filters";
import { startingPrice } from "@/workspaces/storefront/catalog/pricing";

export type BrowseSortId =
  | "recommended"
  | "name_asc"
  | "price_asc"
  | "price_desc";

export const DEFAULT_BROWSE_SORT: BrowseSortId = "recommended";

export const BROWSE_SORT_OPTIONS: ReadonlyArray<{
  id: BrowseSortId;
  label: string;
}> = [
  { id: "recommended", label: "Recommended" },
  { id: "price_asc", label: "Price: Low to High" },
  { id: "price_desc", label: "Price: High to Low" },
  { id: "name_asc", label: "Name: A–Z" },
];

export type BrowseSortCake = Pick<StorefrontCake, "id" | "name" | "sizes">;

/** Lowest available size price — same value as the card "From RM…" line. */
export function browseSortPrice(cake: Pick<StorefrontCake, "sizes">): number | null {
  return startingPrice(cake);
}

export function sortBrowseCakes<T extends BrowseSortCake>(
  cakes: readonly T[],
  sort: BrowseSortId,
  publicationOrder: ReadonlyArray<{ id: string }>,
): T[] {
  const indexById = new Map(
    publicationOrder.map((cake, index) => [cake.id, index] as const),
  );
  const rank = (cake: T) => indexById.get(cake.id) ?? Number.POSITIVE_INFINITY;
  const next = [...cakes];

  if (sort === "recommended") {
    return next.sort((a, b) => rank(a) - rank(b));
  }

  if (sort === "name_asc") {
    return next.sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      if (byName !== 0) return byName;
      return rank(a) - rank(b);
    });
  }

  const direction = sort === "price_asc" ? 1 : -1;
  return next.sort((a, b) => {
    const left = browseSortPrice(a);
    const right = browseSortPrice(b);
    if (left == null && right == null) return rank(a) - rank(b);
    if (left == null) return 1;
    if (right == null) return -1;
    if (left !== right) return (left - right) * direction;
    return rank(a) - rank(b);
  });
}

/** Publication set → search → filters → sort. */
export function viewBrowseCatalogue<
  T extends BrowseSortCake & {
    category: StorefrontCake["category"];
    description: string | null;
  },
>(
  cakes: readonly T[],
  query: string,
  filters: BrowseFilterState,
  priceRanges: readonly BrowsePriceRange[],
  sort: BrowseSortId,
): T[] {
  return sortBrowseCakes(
    filterBrowseCatalogue(cakes, query, filters, priceRanges),
    sort,
    cakes,
  );
}
