import type { StorefrontCake } from "@/types/storefront";

export type BrowseSearchCake = Pick<StorefrontCake, "name" | "description">;

export function normalizeBrowseSearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase("en");
}

export function cakeMatchesBrowseSearch(
  cake: BrowseSearchCake,
  query: string,
): boolean {
  const needle = normalizeBrowseSearchQuery(query);
  if (!needle) return true;
  if (cake.name.toLocaleLowerCase("en").includes(needle)) return true;
  const description = cake.description?.trim() ?? "";
  if (!description) return false;
  return description.toLocaleLowerCase("en").includes(needle);
}

/** Client-side filter over an already-resolved Browse publication set. */
export function filterBrowseCakesBySearch<T extends BrowseSearchCake>(
  cakes: readonly T[],
  query: string,
): T[] {
  if (!normalizeBrowseSearchQuery(query)) {
    return [...cakes];
  }
  return cakes.filter((cake) => cakeMatchesBrowseSearch(cake, query));
}
