/**
 * Select homepage collections from the already customer-orderable lists.
 * Their order is the Owner's Library display order across all collection
 * purposes; no calendar or collection-name priority is applied here.
 */

export const HOMEPAGE_FEATURED_COLLECTION_MAX = 4;

export type HomepageFeaturedKind =
  | "special"
  | "current_monthly"
  | "upcoming_monthly";

export type HomepageFeaturedCandidate = {
  id: string;
  kind: HomepageFeaturedKind;
};

export type HomepageFeaturedSelection = {
  featured: HomepageFeaturedCandidate[];
};

export type HomepageSpecialCandidate = {
  id: string;
  displayOrder?: number | null;
};

export type HomepageMonthlyCandidate = {
  id: string;
  month: string | null;
  displayOrder?: number | null;
};

function yearMonthKey(value: string | null | undefined): string | null {
  const key = (value ?? "").trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
}

function compareLibraryOrder(
  left: { id: string; displayOrder?: number | null },
  right: { id: string; displayOrder?: number | null },
): number {
  const leftOrder = left.displayOrder;
  const rightOrder = right.displayOrder;
  if (leftOrder == null && rightOrder == null) {
    return left.id.localeCompare(right.id);
  }
  if (leftOrder == null) return 1;
  if (rightOrder == null) return -1;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.id.localeCompare(right.id);
}

/**
 * Build the homepage's full-section list from catalogues already qualified
 * as published and customer-orderable. Publication, photo and availability
 * rules remain with the query/component layers.
 */
export function selectHomepageFeaturedCollections(input: {
  todayYearMonth: string;
  specials: readonly HomepageSpecialCandidate[];
  monthlies: readonly HomepageMonthlyCandidate[];
}): HomepageFeaturedSelection {
  const today = yearMonthKey(input.todayYearMonth);
  const candidates: Array<
    HomepageFeaturedCandidate & { displayOrder?: number | null }
  > = [];
  const seen = new Set<string>();

  for (const special of input.specials) {
    if (!special.id || seen.has(special.id)) continue;
    seen.add(special.id);
    candidates.push({
      id: special.id,
      kind: "special",
      displayOrder: special.displayOrder,
    });
  }

  for (const monthly of input.monthlies) {
    if (!monthly.id || seen.has(monthly.id)) continue;
    seen.add(monthly.id);
    candidates.push({
      id: monthly.id,
      kind:
        today && yearMonthKey(monthly.month) === today
          ? "current_monthly"
          : "upcoming_monthly",
      displayOrder: monthly.displayOrder,
    });
  }

  if (
    candidates.length > 0 &&
    candidates.every((candidate) => candidate.displayOrder == null)
  ) {
    throw new Error("Homepage collection display order is unavailable");
  }

  const ordered = candidates.sort(compareLibraryOrder);
  return {
    featured: ordered
      .slice(0, HOMEPAGE_FEATURED_COLLECTION_MAX)
      .map(({ id, kind }) => ({ id, kind })),
  };
}
