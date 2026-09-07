/**
 * Owner-curated homepage Popular Cakes.
 * Selection is explicit Library configuration, not sales or catalogue order.
 */

export type PopularCakesSortable = {
  id: string;
  name: string;
  showInPopularCakes: boolean;
  popularCakesSortOrder: number | null;
};

/** Any Library cake may be selected, including seasonal and limited. */
export function cakeMayBeSelectedForPopularCakes(_input?: {
  status?: string;
  categoryName?: string | null;
}): boolean {
  return true;
}

export function nextPopularCakesSortOrder(
  existingOrders: readonly (number | null | undefined)[],
): number {
  let max = 0;
  for (const value of existingOrders) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      continue;
    }
    if (value > max) max = value;
  }
  return max + 1;
}

export function parsePopularCakesSortOrder(
  raw: string,
): number | null | string {
  const text = raw.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) {
    return "Popular Cakes order must be a whole number of 1 or more.";
  }
  const value = Number.parseInt(text, 10);
  if (!Number.isInteger(value) || value < 1) {
    return "Popular Cakes order must be a whole number of 1 or more.";
  }
  return value;
}

/**
 * Selected cakes first by configured order, then name, then id.
 * Missing order is last among selected cakes, still deterministic.
 */
export function comparePopularCakesOrder(
  a: PopularCakesSortable,
  b: PopularCakesSortable,
): number {
  const aOrder = a.popularCakesSortOrder;
  const bOrder = b.popularCakesSortOrder;
  const aMissing = aOrder == null;
  const bMissing = bOrder == null;
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  if (!aMissing && !bMissing && aOrder !== bOrder) return aOrder - bOrder;
  const name = a.name.localeCompare(b.name, "en");
  if (name !== 0) return name;
  return a.id.localeCompare(b.id);
}

export function sortHomepagePopularCakes<T extends PopularCakesSortable>(
  cakes: readonly T[],
): T[] {
  return [...cakes]
    .filter((cake) => cake.showInPopularCakes)
    .sort(comparePopularCakesOrder);
}
