export type BrowsePublicationOrderCake = {
  id: string;
  name: string;
  currentlyOffered: boolean;
  inLatestCollection: boolean;
  latestCollectionSortOrder: number | null;
};

function yearMonthKey(value: string): string | null {
  const key = value.trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
}

/**
 * Latest customer-orderable monthly catalogue, by catalogue month.
 * Not database id. Callers must pass months that are already orderable.
 */
export function latestOrderableMonthlyYearMonth(
  monthlyYearMonths: readonly string[],
): string | null {
  const months = [
    ...new Set(
      monthlyYearMonths
        .map((value) => yearMonthKey(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  return months.at(-1) ?? null;
}

function publicationGroup(cake: BrowsePublicationOrderCake): number {
  if (cake.currentlyOffered && cake.inLatestCollection) return 0;
  if (cake.currentlyOffered) return 1;
  return 2;
}

export function compareBrowsePublicationOrder(
  left: BrowsePublicationOrderCake,
  right: BrowsePublicationOrderCake,
): number {
  const byGroup = publicationGroup(left) - publicationGroup(right);
  if (byGroup !== 0) return byGroup;
  if (left.currentlyOffered && left.inLatestCollection) {
    const leftOrder = left.latestCollectionSortOrder ?? Number.POSITIVE_INFINITY;
    const rightOrder =
      right.latestCollectionSortOrder ?? Number.POSITIVE_INFINITY;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }
  const byName = left.name.localeCompare(right.name, "en", {
    sensitivity: "base",
  });
  if (byName !== 0) return byName;
  return left.id.localeCompare(right.id);
}

/** Default Browse publication order: latest available, other available, unavailable. */
export function sortBrowsePublicationCakes<T extends BrowsePublicationOrderCake>(
  cakes: readonly T[],
): T[] {
  return [...cakes].sort(compareBrowsePublicationOrder);
}
