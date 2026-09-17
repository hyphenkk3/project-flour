/**
 * Fresh Picks same-day preparation overlay.
 * Cutoff and lead are configurable. They sit on top of fulfilment hours.
 * Do not treat cutoff as store close / pickup close / dine-in latest / delivery close.
 */

import { formatPickupClockLabel } from "@/engines/business-calendar/pickup-schedule";
import { singaporeDateTimeToIso } from "@/engines/extra/fresh-picks-time";
import { toBusinessDateKey } from "@/lib/dates";

export const DEFAULT_FRESH_PICKS_SAME_DAY_CUTOFF_TIME = "16:00";
export const DEFAULT_FRESH_PICKS_SAME_DAY_LEAD_MINUTES = 60;
export const FRESH_PICKS_LEAD_MINUTES_MAX = 24 * 60;

export type FreshPicksPreparationConfig = {
  cutoffTime: string;
  leadMinutes: number;
};

export const DEFAULT_FRESH_PICKS_PREPARATION_CONFIG: FreshPicksPreparationConfig =
  {
    cutoffTime: DEFAULT_FRESH_PICKS_SAME_DAY_CUTOFF_TIME,
    leadMinutes: DEFAULT_FRESH_PICKS_SAME_DAY_LEAD_MINUTES,
  };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseFreshPicksCutoffTime(value: unknown): string | null {
  const raw = String(value ?? "")
    .trim()
    .slice(0, 8);
  const hm = raw.length >= 5 ? raw.slice(0, 5) : raw;
  if (!HHMM.test(hm)) return null;
  return hm;
}

export function parseFreshPicksLeadMinutes(value: unknown): number | null {
  const n =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n) || n < 0 || n > FRESH_PICKS_LEAD_MINUTES_MAX) {
    return null;
  }
  return n;
}

export function parseFreshPicksPreparationConfig(input: {
  cutoffTime?: unknown;
  leadMinutes?: unknown;
}): FreshPicksPreparationConfig {
  return {
    cutoffTime:
      parseFreshPicksCutoffTime(input.cutoffTime) ??
      DEFAULT_FRESH_PICKS_SAME_DAY_CUTOFF_TIME,
    leadMinutes:
      parseFreshPicksLeadMinutes(input.leadMinutes) ??
      DEFAULT_FRESH_PICKS_SAME_DAY_LEAD_MINUTES,
  };
}

export function formatFreshPicksCutoffClock(cutoffTime: string): string {
  const parsed = parseFreshPicksCutoffTime(cutoffTime);
  if (!parsed) return formatPickupClockLabel(DEFAULT_FRESH_PICKS_SAME_DAY_CUTOFF_TIME);
  return formatPickupClockLabel(parsed);
}

export function freshPicksFulfilmentInstantMs(
  dateYmd: string,
  timeHm: string,
): number | null {
  const iso = singaporeDateTimeToIso(dateYmd, timeHm.trim().slice(0, 5));
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function freshPicksSameDayCutoffMs(
  now: Date,
  config: FreshPicksPreparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
): number | null {
  const today = toBusinessDateKey(now);
  return freshPicksFulfilmentInstantMs(today, config.cutoffTime);
}

/** Inclusive: 16:00:00 is too late for same-day. */
export function isFreshPicksSameDayCutoffPassed(
  now: Date,
  config: FreshPicksPreparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
): boolean {
  const cutoffMs = freshPicksSameDayCutoffMs(now, config);
  if (cutoffMs == null) return true;
  return now.getTime() >= cutoffMs;
}

export function isFreshPicksFulfilmentDateToday(
  dateYmd: string,
  now: Date,
): boolean {
  return dateYmd.trim().slice(0, 10) === toBusinessDateKey(now);
}

export function freshPicksLeadBoundaryMs(
  now: Date,
  config: FreshPicksPreparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
): number {
  return now.getTime() + config.leadMinutes * 60 * 1000;
}

export type FreshPicksLeadComparison = "inclusive" | "strict";

export function slotPassesFreshPicksLead(input: {
  dateYmd: string;
  timeHm: string;
  now: Date;
  config?: FreshPicksPreparationConfig;
  comparison: FreshPicksLeadComparison;
}): boolean {
  const config = input.config ?? DEFAULT_FRESH_PICKS_PREPARATION_CONFIG;
  if (!isFreshPicksFulfilmentDateToday(input.dateYmd, input.now)) return true;
  const slotMs = freshPicksFulfilmentInstantMs(input.dateYmd, input.timeHm);
  if (slotMs == null) return false;
  const boundary = freshPicksLeadBoundaryMs(input.now, config);
  return input.comparison === "strict" ? slotMs > boundary : slotMs >= boundary;
}

export function sameDayFreshPicksCutoffCustomerMessage(
  config: FreshPicksPreparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
): string {
  return `Same-day orders must be placed before ${formatFreshPicksCutoffClock(config.cutoffTime)}. Please select another date for your order.`;
}
