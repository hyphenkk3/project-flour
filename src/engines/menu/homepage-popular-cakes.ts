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

export const POPULAR_CAKES_MAX_SELECTION = 10;

export const POPULAR_CAKES_MAX_SELECTION_MESSAGE =
  "You can feature up to 10 cakes in Popular Cakes. Remove one before adding another.";

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
    return `Popular Cakes order must be a whole number from 1 to ${POPULAR_CAKES_MAX_SELECTION}.`;
  }
  const value = Number.parseInt(text, 10);
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > POPULAR_CAKES_MAX_SELECTION
  ) {
    return `Popular Cakes order must be a whole number from 1 to ${POPULAR_CAKES_MAX_SELECTION}.`;
  }
  return value;
}

export type PopularCakesPlanItem = {
  id: string;
  showInPopularCakes: boolean;
  popularCakesSortOrder: number | null;
};

export type PopularCakesPlanResult =
  | { ok: true; updates: PopularCakesPlanItem[] }
  | { ok: false; error: string };

function compactSelectedOrders(
  cakes: readonly PopularCakesSortable[],
): PopularCakesPlanItem[] {
  return cakes.map((cake, index) => ({
    id: cake.id,
    showInPopularCakes: true,
    popularCakesSortOrder: index + 1,
  }));
}

/**
 * Plan selection/order updates for one cake. Compacts the active set to 1..n
 * so list and form saves do not leave duplicate Popular Cakes positions.
 */
export function planPopularCakesChange(input: {
  selected: readonly PopularCakesSortable[];
  cake: PopularCakesSortable;
  showInPopularCakes: boolean;
  requestedOrder: number | null;
}): PopularCakesPlanResult {
  const selected = sortHomepagePopularCakes(input.selected);
  const others = selected.filter((cake) => cake.id !== input.cake.id);
  const wasSelected = selected.some((cake) => cake.id === input.cake.id);

  if (!input.showInPopularCakes) {
    const updates: PopularCakesPlanItem[] = [
      {
        id: input.cake.id,
        showInPopularCakes: false,
        popularCakesSortOrder: null,
      },
    ];
    if (wasSelected) {
      updates.push(...compactSelectedOrders(others));
    }
    return { ok: true, updates };
  }

  if (
    !wasSelected &&
    others.length >= POPULAR_CAKES_MAX_SELECTION
  ) {
    return { ok: false, error: POPULAR_CAKES_MAX_SELECTION_MESSAGE };
  }

  const insertAt =
    input.requestedOrder == null
      ? others.length
      : Math.min(
          Math.max(input.requestedOrder, 1),
          others.length + 1,
        ) - 1;
  const next = [...others];
  next.splice(insertAt, 0, {
    ...input.cake,
    showInPopularCakes: true,
  });
  return { ok: true, updates: compactSelectedOrders(next) };
}

export function popularCakesPosition(
  selected: readonly PopularCakesSortable[],
  cakeId: string,
): number | null {
  const index = sortHomepagePopularCakes(selected).findIndex(
    (cake) => cake.id === cakeId,
  );
  return index === -1 ? null : index + 1;
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
