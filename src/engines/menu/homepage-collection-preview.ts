/**
 * Owner/Manager homepage preview cakes for one collection.
 * Explicit membership flags — not catalogue order, alphabet, or popularity.
 */

export const HOMEPAGE_COLLECTION_PREVIEW_MAX = 6;

export const HOMEPAGE_COLLECTION_PREVIEW_MAX_MESSAGE =
  "You can feature up to 6 cakes on the homepage for this collection. Remove one before adding another.";

export type HomepageCollectionPreviewSortable = {
  id: string;
  showOnHomepage: boolean;
  homepageSortOrder: number | null;
};

export function nextHomepageCollectionPreviewOrder(
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

export function parseHomepageCollectionPreviewOrder(
  raw: string,
): number | null | string {
  const text = raw.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) {
    return `Homepage order must be a whole number from 1 to ${HOMEPAGE_COLLECTION_PREVIEW_MAX}.`;
  }
  const value = Number.parseInt(text, 10);
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > HOMEPAGE_COLLECTION_PREVIEW_MAX
  ) {
    return `Homepage order must be a whole number from 1 to ${HOMEPAGE_COLLECTION_PREVIEW_MAX}.`;
  }
  return value;
}

export type HomepageCollectionPreviewPlanItem = {
  id: string;
  showOnHomepage: boolean;
  homepageSortOrder: number | null;
};

export type HomepageCollectionPreviewPlanResult =
  | { ok: true; updates: HomepageCollectionPreviewPlanItem[] }
  | { ok: false; error: string };

function compactSelectedOrders(
  members: readonly HomepageCollectionPreviewSortable[],
): HomepageCollectionPreviewPlanItem[] {
  return members.map((member, index) => ({
    id: member.id,
    showOnHomepage: true,
    homepageSortOrder: index + 1,
  }));
}

/**
 * Plan homepage preview selection/order for one membership row.
 * Compacts the active set to 1..n.
 */
export function planHomepageCollectionPreviewChange(
  members: readonly HomepageCollectionPreviewSortable[],
  membershipId: string,
  next: { showOnHomepage: boolean; homepageSortOrder: number | null },
): HomepageCollectionPreviewPlanResult {
  const current = members.find((member) => member.id === membershipId);
  if (!current) {
    return { ok: false, error: "That cake is not in this collection." };
  }

  let selected = members
    .filter((member) => member.showOnHomepage && member.id !== membershipId)
    .sort((left, right) => {
      const leftOrder = left.homepageSortOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.homepageSortOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.id.localeCompare(right.id);
    });

  if (next.showOnHomepage) {
    if (
      !current.showOnHomepage &&
      selected.length >= HOMEPAGE_COLLECTION_PREVIEW_MAX
    ) {
      return { ok: false, error: HOMEPAGE_COLLECTION_PREVIEW_MAX_MESSAGE };
    }
    const requested = next.homepageSortOrder;
    if (requested == null) {
      selected.push(current);
    } else {
      const without = selected.filter((member) => member.id !== membershipId);
      const index = Math.max(0, Math.min(requested - 1, without.length));
      without.splice(index, 0, current);
      selected = without;
    }
  }

  const compacted = compactSelectedOrders(selected);
  const updatesById = new Map(compacted.map((item) => [item.id, item]));
  const updates: HomepageCollectionPreviewPlanItem[] = members.map((member) => {
    const selectedUpdate = updatesById.get(member.id);
    if (selectedUpdate) return selectedUpdate;
    return {
      id: member.id,
      showOnHomepage: false,
      homepageSortOrder: null,
    };
  });

  return { ok: true, updates };
}

export function compareHomepageCollectionPreviewOrder(
  left: { homepageSortOrder: number | null },
  right: { homepageSortOrder: number | null },
): number {
  const leftOrder = left.homepageSortOrder;
  const rightOrder = right.homepageSortOrder;
  if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  if (leftOrder != null && rightOrder == null) return -1;
  if (leftOrder == null && rightOrder != null) return 1;
  return 0;
}

export const BROWSE_CURRENTLY_UNAVAILABLE_NOTE = "Currently unavailable";

export function isCustomerFacingHistoricalCatalogue(input: {
  purpose: string;
  status: string;
  websiteOverride?: boolean;
  showInPastMenu?: boolean;
}): boolean {
  if (input.status === "draft") return false;
  if (input.status !== "active" && input.status !== "archived") return false;
  if (input.purpose === "monthly") return true;
  if (input.purpose === "special") {
    return input.websiteOverride === true || input.showInPastMenu === true;
  }
  return false;
}
