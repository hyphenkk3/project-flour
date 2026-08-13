/**
 * Early-pickup Bakery Attention — derived from the authoritative effective
 * pickup schedule (`usualPickupStart`).
 *
 * Do not use this to gate which times customers may choose.
 * Closed dates ⇒ not applicable (false).
 * Automatic Early Pickup must never write needs_bakery_attention.
 */

import {
  getEffectivePickupSchedule,
  type EffectivePickupSchedule,
} from "@/engines/business-calendar/pickup-schedule";
import { normalizePickupTimeValue } from "@/engines/business-calendar/pickup-slots";

function timeToMinutes(hm: string): number | null {
  const normalized = normalizePickupTimeValue(hm);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(normalized);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * True when pickup is before the usual Bakery pickup window on an open date.
 */
export function isEarlyPickupForSchedule(
  schedule: EffectivePickupSchedule,
  pickupTime: string | null | undefined,
): boolean {
  if (schedule.status !== "open") return false;
  if (!pickupTime) return false;

  const minutes = timeToMinutes(pickupTime);
  if (minutes == null) return false;

  const usualStart = timeToMinutes(schedule.usualPickupStart);
  if (usualStart == null) return false;

  return minutes < usualStart;
}

/**
 * True when pickup is before the usual Bakery pickup window for that date.
 * `pickupDateYmd` is YYYY-MM-DD; `pickupTime` is HH:MM or HH:MM:SS.
 */
export function isEarlyPickupAttention(
  pickupDateYmd: string,
  pickupTime: string | null | undefined,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDateYmd)) return false;
  return isEarlyPickupForSchedule(
    getEffectivePickupSchedule(pickupDateYmd),
    pickupTime,
  );
}
