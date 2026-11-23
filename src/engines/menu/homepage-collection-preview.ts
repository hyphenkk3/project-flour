/**
 * Owner/Manager homepage preview cakes for one collection.
 * Homepage inclusion is explicit; display order follows the collection's saved
 * membership order rather than a second homepage-only order or merchandising rank.
 */

export const HOMEPAGE_COLLECTION_PREVIEW_MAX = 6;

/** Mobile homepage carousel shows at most this many cakes. */
export const HOMEPAGE_COLLECTION_PREVIEW_DISPLAY_MAX = 4;

/** lg+ homepage carousel shows at most this many cakes. Curation may still hold 6. */
export const HOMEPAGE_COLLECTION_PREVIEW_DISPLAY_MAX_LG = 5;

export const HOMEPAGE_COLLECTION_PREVIEW_MAX_MESSAGE =
  "You can feature up to 6 cakes on the homepage for this collection. Remove one before adding another.";

export function takeHomepageCollectionPreviewCakes<T>(
  cakes: readonly T[],
): T[] {
  return cakes.slice(0, HOMEPAGE_COLLECTION_PREVIEW_DISPLAY_MAX_LG);
}

export type HomepageCollectionPreviewSelection = {
  id: string;
  showOnHomepage: boolean;
};

export type HomepageCollectionPreviewSelectionPlan =
  | { ok: true; id: string; showOnHomepage: boolean }
  | { ok: false; error: string };

/** Change homepage inclusion only; display order always follows collection sort_order. */
export function planHomepageCollectionPreviewSelection(
  members: readonly HomepageCollectionPreviewSelection[],
  membershipId: string,
  showOnHomepage: boolean,
): HomepageCollectionPreviewSelectionPlan {
  const current = members.find((member) => member.id === membershipId);
  if (!current) {
    return { ok: false, error: "That cake is not in this collection." };
  }
  if (
    showOnHomepage &&
    !current.showOnHomepage &&
    members.filter((member) => member.showOnHomepage).length >=
      HOMEPAGE_COLLECTION_PREVIEW_MAX
  ) {
    return { ok: false, error: HOMEPAGE_COLLECTION_PREVIEW_MAX_MESSAGE };
  }
  return { ok: true, id: membershipId, showOnHomepage };
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
