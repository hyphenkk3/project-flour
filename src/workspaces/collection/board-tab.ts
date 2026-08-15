/** Collection board tab ids — kept separate to avoid date ↔ eligibility cycles. */

export type CollectionBoardTab = "ready" | "completed" | "history";

export function parseCollectionBoardTab(
  raw: string | null | undefined,
): CollectionBoardTab {
  if (raw === "completed" || raw === "history") return raw;
  return "ready";
}
