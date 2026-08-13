/**
 * EXTRA Activation v1 — derived availability.
 * Inclusive cutoff: available while now <= pickup_through_at.
 */

export type ExtraLifecycle = "proposed" | "confirmed" | "rejected";

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
