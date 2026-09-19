/**
 * Fresh Pick Walk-in Hold — duration and derived hold state.
 * One physical extra_stock row = one hold instance.
 * Expiry is derived from walk_in_held_until; cron is not required for availability.
 */

import { formatExtraPickupThroughClock } from "@/engines/extra/fresh-picks-time";
import { freshPickDay } from "@/engines/extra/customer-fresh-picks";
import { formatLongBusinessDate } from "@/lib/dates";

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

function walkInHoldRemainingMs(
  untilIso: string | null | undefined,
  now: Date,
): number | null {
  const until = untilIso?.trim() ?? "";
  if (!until) return null;
  const untilMs = Date.parse(until);
  if (!Number.isFinite(untilMs)) return null;
  return untilMs - now.getTime();
}

/**
 * Display-only remaining-time copy. Never used to expire inventory.
 * Final minute stays "Expires soon · 1 min left" — no seconds.
 */
export function walkInHoldCountdownLabel(
  untilIso: string | null | undefined,
  now: Date = new Date(),
): string {
  const remainingMs = walkInHoldRemainingMs(untilIso, now);
  if (remainingMs == null) return "Expires soon · 1 min left";
  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  if (remainingMinutes <= 1) return "Expires soon · 1 min left";
  return `${remainingMinutes} min left`;
}

export function walkInHoldHomeUntilLine(
  untilIso: string | null | undefined,
  now: Date = new Date(),
): string {
  const remainingMs = walkInHoldRemainingMs(untilIso, now);
  const countdown = walkInHoldCountdownLabel(untilIso, now);
  if (remainingMs != null && Math.ceil(remainingMs / 60_000) <= 1) {
    return countdown;
  }
  return `Held until ${formatWalkInHoldUntilClock(untilIso)} · ${countdown}`;
}

export function walkInHoldPlaceConfirmDescription(
  minutes: number = EXTRA_WALK_IN_HOLD_MINUTES,
): string {
  return `Place this Fresh Pick on a ${minutes}-minute walk-in hold? It will be unavailable for online sale and other staff actions during the hold.`;
}

export function walkInHoldExtendConfirmDescription(
  minutes: number = EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES,
): string {
  return `Add ${minutes} minutes to this Walk-in Hold? Only one extension is allowed.`;
}

export const WALK_IN_HOLD_RELEASE_CONFIRM_DESCRIPTION =
  "Release this Walk-in Hold? The Fresh Pick will be available for online sale and other staff actions immediately.";

/**
 * Compact Home / counter line: "Pickup today · 5:30 PM cutoff".
 */
export function freshPickHomeSummaryLine(input: {
  preparedOn: string | null;
  pickupThroughAt: string | null;
  todayYmd: string;
}): string {
  const day = freshPickDay(input.preparedOn, input.todayYmd);
  const when =
    day === "today"
      ? "today"
      : day === "tomorrow"
        ? "tomorrow"
        : input.preparedOn
          ? formatLongBusinessDate(input.preparedOn)
          : "—";
  const cutoff = input.pickupThroughAt
    ? formatExtraPickupThroughClock(input.pickupThroughAt)
    : "—";
  return `Pickup ${when} · ${cutoff} cutoff`;
}
