/** Trimmed EXTRA rejection reason. Empty / whitespace-only is invalid. */

export function normalizeExtraRejectReason(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
