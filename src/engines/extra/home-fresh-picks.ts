/**
 * Home Fresh Picks presentation helpers.
 * Extra capabilities, availability, and Walk-in Hold remain authoritative.
 */

export const FRESH_PICK_NEW_WINDOW_MS = 60 * 60 * 1000;
export const HOME_FRESH_PICKS_PREVIEW_LIMIT = 4;

export function isFreshPickNew(input: {
  confirmedAt: string | null;
  now?: Date;
}): boolean {
  const iso = input.confirmedAt?.trim() ?? "";
  if (!iso) return false;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return false;
  const nowMs = (input.now ?? new Date()).getTime();
  const elapsed = nowMs - at;
  return elapsed >= 0 && elapsed < FRESH_PICK_NEW_WINDOW_MS;
}

export function homeFreshPickStatusLabel(input: {
  walkInHeld: boolean;
  confirmedAt: string | null;
  now?: Date;
}): string {
  const status = input.walkInHeld ? "Held" : "Available";
  return isFreshPickNew({
    confirmedAt: input.confirmedAt,
    now: input.now,
  })
    ? `${status} · New`
    : status;
}

export function formatHomeFreshPickPrice(amount: number): string {
  return `RM${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

export function formatHomeFreshPickSizePrice(input: {
  sizeLabel: string;
  unitPrice?: number | null;
}): string {
  const size = input.sizeLabel.trim();
  if (input.unitPrice == null || !Number.isFinite(input.unitPrice)) {
    return size;
  }
  return `${size} · ${formatHomeFreshPickPrice(input.unitPrice)}`;
}

function createdAtMs(input: {
  confirmedAt: string | null;
  proposedAt?: string | null;
}): number {
  const iso = input.confirmedAt?.trim() || input.proposedAt?.trim() || "";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/**
 * Home card order: held first (earliest expiry, then pickup, then oldest),
 * then available (earliest pickup, then oldest). New does not jump the queue.
 */
export function compareHomeFreshPickUnits(
  a: {
    walkInHeld: boolean;
    walkInHeldUntil: string | null;
    pickupThroughAt: string | null;
    confirmedAt: string | null;
    proposedAt?: string | null;
  },
  b: {
    walkInHeld: boolean;
    walkInHeldUntil: string | null;
    pickupThroughAt: string | null;
    confirmedAt: string | null;
    proposedAt?: string | null;
  },
): number {
  if (a.walkInHeld !== b.walkInHeld) return a.walkInHeld ? -1 : 1;
  if (a.walkInHeld && b.walkInHeld) {
    const until = (a.walkInHeldUntil ?? "").localeCompare(
      b.walkInHeldUntil ?? "",
    );
    if (until !== 0) return until;
  }
  const pickup = (a.pickupThroughAt ?? "").localeCompare(
    b.pickupThroughAt ?? "",
  );
  if (pickup !== 0) return pickup;
  return createdAtMs(a) - createdAtMs(b);
}

export function previewHomeFreshPicks<T>(
  units: readonly T[],
  limit: number = HOME_FRESH_PICKS_PREVIEW_LIMIT,
): T[] {
  return units.slice(0, Math.max(0, limit));
}
