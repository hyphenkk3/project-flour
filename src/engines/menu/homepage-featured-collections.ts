/**
 * Homepage featured collections: at most two full previews, data-driven.
 * Priority: active Special Period, current monthly, then upcoming monthly
 * already open for customer ordering. Remaining relevant catalogues get a
 * quiet direct link instead of a generic "more collections" control.
 */

export const HOMEPAGE_FEATURED_COLLECTION_MAX = 2;

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
  more: HomepageFeaturedCandidate[];
};

export type HomepageSpecialCandidate = {
  id: string;
  displayOrder?: number | null;
  startDate?: string | null;
};

export type HomepageMonthlyCandidate = {
  id: string;
  month: string | null;
};

function yearMonthKey(value: string | null | undefined): string | null {
  const key = (value ?? "").trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
}

function compareSpecialOrder(
  left: HomepageSpecialCandidate,
  right: HomepageSpecialCandidate,
): number {
  const leftOrder = left.displayOrder;
  const rightOrder = right.displayOrder;
  if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  if (leftOrder != null && rightOrder == null) return -1;
  if (leftOrder == null && rightOrder != null) return 1;
  return (left.startDate ?? "").localeCompare(right.startDate ?? "");
}

/**
 * Build the homepage featured/more lists from catalogues already qualified
 * as customer-orderable. Does not re-check publication rules.
 */
export function selectHomepageFeaturedCollections(input: {
  todayYearMonth: string;
  specials: readonly HomepageSpecialCandidate[];
  monthlies: readonly HomepageMonthlyCandidate[];
}): HomepageFeaturedSelection {
  const today = yearMonthKey(input.todayYearMonth);
  const candidates: HomepageFeaturedCandidate[] = [];
  const seen = new Set<string>();

  function push(candidate: HomepageFeaturedCandidate) {
    if (seen.has(candidate.id)) return;
    seen.add(candidate.id);
    candidates.push(candidate);
  }

  const specials = [...input.specials].sort(compareSpecialOrder);
  for (const special of specials) {
    if (!special.id) continue;
    push({ id: special.id, kind: "special" });
  }

  if (today) {
    const current = input.monthlies.find(
      (row) => yearMonthKey(row.month) === today,
    );
    if (current) {
      push({ id: current.id, kind: "current_monthly" });
    }

    const upcoming = input.monthlies
      .filter((row) => {
        const month = yearMonthKey(row.month);
        return Boolean(month && month > today);
      })
      .sort((left, right) =>
        (yearMonthKey(left.month) ?? "").localeCompare(
          yearMonthKey(right.month) ?? "",
        ),
      );
    for (const row of upcoming) {
      push({ id: row.id, kind: "upcoming_monthly" });
    }
  }

  return {
    featured: candidates.slice(0, HOMEPAGE_FEATURED_COLLECTION_MAX),
    more: candidates.slice(HOMEPAGE_FEATURED_COLLECTION_MAX),
  };
}
