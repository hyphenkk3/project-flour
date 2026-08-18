/**
 * Customer Extra / Fresh Picks: Bakery physical stock for TODAY or TOMORROW.
 * Independent of monthly catalogues.
 */

import { isExtraAvailable, type ExtraLifecycle } from "@/engines/extra/availability";
import {
  extraCustomerPickupSlotsForDate,
  type ExtraPickupWindow,
} from "@/engines/extra/extra-pickup";
import { addBusinessCalendarDays } from "@/lib/dates";

export type FreshPickDay = "today" | "tomorrow";

export function freshPickDay(
  preparedOn: string | null,
  todayYmd: string,
): FreshPickDay | null {
  const prepared = preparedOn?.trim().slice(0, 10) ?? "";
  const today = todayYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prepared) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return null;
  }
  if (prepared === today) return "today";
  const tomorrow = addBusinessCalendarDays(today, 1);
  if (tomorrow && prepared === tomorrow) return "tomorrow";
  return null;
}

/** Confirmed Extra that customers may see as a Fresh Pick. */
export function isPublishedFreshPick(input: {
  lifecycle: ExtraLifecycle | string;
  pickupThroughAt: string | null;
  confirmedAt?: string | null;
  soldAt?: string | null;
  preparedOn?: string | null;
  todayYmd?: string;
  now?: Date;
}): boolean {
  if (input.lifecycle !== "confirmed") return false;
  if (input.soldAt) return false;
  const now = input.now ?? new Date();
  if (input.confirmedAt) {
    const posted = Date.parse(input.confirmedAt);
    if (Number.isFinite(posted) && now.getTime() < posted) return false;
  }
  return isExtraAvailable({
    lifecycle: "confirmed",
    pickupThroughAt: input.pickupThroughAt,
    soldAt: input.soldAt,
    now,
  });
}

export function freshPickAvailabilityLabel(day: FreshPickDay): string {
  return day === "today" ? "Available today" : "Available tomorrow";
}

/**
 * Customer card day from remaining bakery pickup hours (Malaysia time),
 * not prepared_on / pickup-from calendar date alone.
 * Today stays "today" before the pickup-from clock if later today slots remain.
 * After today's hours, tomorrow is used when that pickup day still has slots.
 */
export function extraActionableFreshPickDay(input: {
  pickupAvailableFromAt: string | null;
  orderCutoffAt: string | null;
  todayYmd: string;
  now?: Date;
}): FreshPickDay | null {
  if (!input.pickupAvailableFromAt || !input.orderCutoffAt) return null;
  const window: ExtraPickupWindow = {
    pickupAvailableFromAt: input.pickupAvailableFromAt,
    orderCutoffAt: input.orderCutoffAt,
  };
  const now = input.now ?? new Date();
  const today = input.todayYmd.trim().slice(0, 10);
  if (extraCustomerPickupSlotsForDate(today, window, now).length > 0) {
    return "today";
  }
  const tomorrow = addBusinessCalendarDays(today, 1);
  if (
    tomorrow &&
    extraCustomerPickupSlotsForDate(tomorrow, window, now).length > 0
  ) {
    return "tomorrow";
  }
  return null;
}

export function homepageFreshPicksHorizon(
  days: readonly FreshPickDay[],
): { hasToday: boolean; hasTomorrow: boolean } {
  let hasToday = false;
  let hasTomorrow = false;
  for (const day of days) {
    if (day === "today") hasToday = true;
    if (day === "tomorrow") hasTomorrow = true;
  }
  return { hasToday, hasTomorrow };
}

export function homepageFreshPicksDescription(input: {
  hasToday: boolean;
  hasTomorrow: boolean;
}): string {
  if (input.hasToday && input.hasTomorrow) {
    return "Special cakes released by Bakery for today or tomorrow.";
  }
  if (input.hasTomorrow) {
    return "Special cakes released by Bakery for tomorrow.";
  }
  if (input.hasToday) {
    return "Special cakes released by Bakery for today.";
  }
  return "Fresh Picks are currently unavailable.";
}

export function homepageFreshPicksCountCopy(
  count: number,
  horizon?: { hasToday: boolean; hasTomorrow: boolean },
): string {
  if (count <= 0) return "No Fresh Picks right now";
  const noun = count === 1 ? "cake" : "cakes";
  if (horizon?.hasToday && horizon.hasTomorrow) {
    return `${count} ${noun} available today or tomorrow`;
  }
  if (horizon?.hasTomorrow) {
    return `${count} ${noun} available tomorrow`;
  }
  if (horizon?.hasToday) {
    return `${count} ${noun} available today`;
  }
  return `${count} ${noun} available today or tomorrow`;
}

/**
 * Customer Fresh Picks card identity: cake offering, not Extra-unit inventory.
 * Same library cake + size collapse to one card. Name+size is the fallback
 * when library ids are absent.
 */
export type FreshPickOfferingIdentity = {
  id: string;
  cakeName: string;
  sizeLabel: string;
  libraryCakeId: string | null;
  libraryCakeSizeId: string | null;
  pickupAvailableFromAt?: string | null;
  confirmedAt?: string | null;
};

export function freshPickOfferingKey(input: FreshPickOfferingIdentity): string {
  const cakeId = input.libraryCakeId?.trim() ?? "";
  const sizeId = input.libraryCakeSizeId?.trim() ?? "";
  if (cakeId && sizeId) {
    return `cake:${cakeId}|size:${sizeId}`;
  }
  if (cakeId) {
    return `cake:${cakeId}|sizeLabel:${input.sizeLabel.trim()}`;
  }
  return `name:${input.cakeName.trim()}|sizeLabel:${input.sizeLabel.trim()}`;
}

function parseInstantMs(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/** Earliest pickup-from, then earliest posted, then Extra id. */
export function compareFreshPickRepresentatives(
  a: FreshPickOfferingIdentity,
  b: FreshPickOfferingIdentity,
): number {
  const fromDiff =
    parseInstantMs(a.pickupAvailableFromAt) -
    parseInstantMs(b.pickupAvailableFromAt);
  if (fromDiff !== 0) return fromDiff;
  const postedDiff = parseInstantMs(a.confirmedAt) - parseInstantMs(b.confirmedAt);
  if (postedDiff !== 0) return postedDiff;
  return a.id.localeCompare(b.id);
}

/**
 * One customer card per cake offering. Caller must pass currently available
 * Extra units only (confirmed, unsold, still within order cutoff).
 * The chosen row id is the Extra unit Order targets.
 */
export function selectCustomerFreshPickOfferings<
  T extends FreshPickOfferingIdentity,
>(picks: readonly T[]): T[] {
  const chosen = new Map<string, T>();
  const order: string[] = [];
  for (const pick of picks) {
    const key = freshPickOfferingKey(pick);
    const current = chosen.get(key);
    if (!current) {
      chosen.set(key, pick);
      order.push(key);
      continue;
    }
    if (compareFreshPickRepresentatives(pick, current) < 0) {
      chosen.set(key, pick);
    }
  }
  return order.map((key) => chosen.get(key)!);
}
