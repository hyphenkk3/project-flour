/**
 * Fresh Pick Walk-in Hold — duration and derived hold state.
 * One physical extra_stock row = one hold instance.
 * Expiry is derived from walk_in_held_until; cron is not required for availability.
 */

import { formatExtraPickupThroughClock } from "@/engines/extra/fresh-picks-time";

export const EXTRA_WALK_IN_HOLD_MINUTES = 15;
export const EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES = 15;
export const EXTRA_WALK_IN_HOLD_REMINDER_LEAD_MINUTES = 3;

export const EXTRA_WALK_IN_HOLD_ACTIVE_ERROR =
  "This Fresh Pick is currently on walk-in hold.";

export function isExtraWalkInHeld(input: {
  walkInHeldUntil?: string | null;
  now?: Date;
}): boolean {
  const until = input.walkInHeldUntil?.trim() ?? "";
  if (!until) return false;
  const untilMs = Date.parse(until);
  if (!Number.isFinite(untilMs)) return false;
  const nowMs = (input.now ?? new Date()).getTime();
  return untilMs >= nowMs;
}

export function formatWalkInHoldUntilClock(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  return formatExtraPickupThroughClock(iso);
}

export function walkInHoldPlaceConfirmDescription(
  minutes: number = EXTRA_WALK_IN_HOLD_MINUTES,
): string {
  return `Place this Fresh Pick on a ${minutes}-minute walk-in hold? It will be unavailable for online sale and other staff actions during the hold.`;
}
