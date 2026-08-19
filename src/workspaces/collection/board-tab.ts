/** Collection board tab ids — kept separate to avoid date ↔ eligibility cycles. */

export type CollectionBoardTab =
  | "ready"
  | "dine_in"
  | "completed"
  | "history";

export type CollectionDineInVenueFilter = "all" | "hyphen" | "whitebird";

export function parseCollectionBoardTab(
  raw: string | null | undefined,
): CollectionBoardTab {
  if (raw === "completed" || raw === "history" || raw === "dine_in") {
    return raw;
  }
  return "ready";
}

export function parseCollectionDineInVenueFilter(
  raw: string | null | undefined,
): CollectionDineInVenueFilter {
  if (raw === "hyphen" || raw === "whitebird") return raw;
  return "all";
}
