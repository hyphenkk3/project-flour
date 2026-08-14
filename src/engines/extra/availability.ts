/**
 * EXTRA Activation v1 — derived availability.
 * Inclusive cutoff: available while now <= pickup_through_at.
 */

export type ExtraLifecycle = "proposed" | "confirmed" | "rejected";

/**
 * Canonical Bakery-actionable EXTRA proposal (ExtraBoard "Proposed" bucket).
 * lifecycle === "proposed" only — no origin/date/prepared_on filters.
 */
export function isBakeryExtraProposalActionable(input: {
  lifecycle: ExtraLifecycle | string;
}): boolean {
  return input.lifecycle === "proposed";
}

/** Count rows awaiting Bakery Confirm Available / Reject. */
export function countBakeryExtraProposalsAwaitingReview(
  units: ReadonlyArray<{ lifecycle: ExtraLifecycle | string }>,
): number {
  let count = 0;
  for (const unit of units) {
    if (isBakeryExtraProposalActionable(unit)) count += 1;
  }
  return count;
}

export function bakeryExtraProposalsAwaitingReviewLabel(count: number): string {
  if (count === 1) return "1 EXTRA proposal awaiting review →";
  return `${count} EXTRA proposals awaiting review →`;
}

export function isExtraAvailable(input: {
  lifecycle: ExtraLifecycle;
  pickupThroughAt: string | null;
  now?: Date;
}): boolean {
  if (input.lifecycle !== "confirmed") return false;
  if (!input.pickupThroughAt) return false;
  const throughMs = Date.parse(input.pickupThroughAt);
  if (!Number.isFinite(throughMs)) return false;
  const nowMs = (input.now ?? new Date()).getTime();
  return nowMs <= throughMs;
}

export function isExtraExpiredConfirmed(input: {
  lifecycle: ExtraLifecycle;
  pickupThroughAt: string | null;
  now?: Date;
}): boolean {
  if (input.lifecycle !== "confirmed") return false;
  if (!input.pickupThroughAt) return false;
  return !isExtraAvailable(input);
}
