/**
 * Authoritative operating hours: weekly rows + dated overrides.
 * Pickup, delivery, dine-in, and outlet hours all resolve through this module.
 * SQL validators read the same tables; this is the TypeScript counterpart.
 */

import { parseBusinessDate } from "@/lib/dates";
import { rangeSlotsInclusive } from "@/engines/business-calendar/pickup-schedule";

export const OPERATING_HOURS_CAPABILITIES = [
  "pickup",
  "delivery",
  "dine_in",
  "hyphen",
  "whitebird",
] as const;

export type OperatingHoursCapability =
  (typeof OPERATING_HOURS_CAPABILITIES)[number];

export type OperatingHoursWeeklyRow = {
  capability: OperatingHoursCapability;
  weekday: number;
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  latestBookable: string | null;
  usualStart: string | null;
  usualEnd: string | null;
};

export type OperatingHoursDateOverride = OperatingHoursWeeklyRow & {
  overrideDate: string;
  note: string | null;
};

export type OperatingHoursSnapshot = {
  weekly: OperatingHoursWeeklyRow[];
  overrides: OperatingHoursDateOverride[];
};

export type ResolvedOperatingHours = {
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  latestBookable: string | null;
  usualStart: string | null;
  usualEnd: string | null;
  source: "override" | "weekly" | "none";
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function weekdayFromYmd(dateYmd: string): number | null {
  const date = parseBusinessDate(dateYmd);
  if (!date) return null;
  return date.getDay();
}

export function weekdayShortLabel(weekday: number): string {
  return WEEKDAY_SHORT[weekday] ?? String(weekday);
}

export function hmToMinutes(hm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToHm(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function subtractMinutes(hm: string, amount: number): string | null {
  const start = hmToMinutes(hm);
  if (start == null) return null;
  return minutesToHm(Math.max(0, start - amount));
}

export function addMinutes(hm: string, amount: number): string | null {
  const start = hmToMinutes(hm);
  if (start == null) return null;
  return minutesToHm(Math.min(23 * 60 + 30, start + amount));
}

export function isThirtyMinuteGrid(hm: string): boolean {
  const minutes = hmToMinutes(hm);
  return minutes != null && minutes % 30 === 0;
}

export function formatClock12h(hm: string): string {
  const minutes = hmToMinutes(hm);
  if (minutes == null) return hm;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return mins === 0 ? `${hour12}:00${suffix}` : `${hour12}:${String(mins).padStart(2, "0")}${suffix}`;
}

export function customerLastBookable(
  row: ResolvedOperatingHours,
): string | null {
  if (!row.enabled) return null;
  if (row.latestBookable) return row.latestBookable;
  if (row.closesAt) return subtractMinutes(row.closesAt, 30);
  return null;
}

export function resolveOperatingHours(
  snapshot: OperatingHoursSnapshot,
  capability: OperatingHoursCapability,
  dateYmd: string,
): ResolvedOperatingHours {
  const weekday = weekdayFromYmd(dateYmd);
  const dated = snapshot.overrides.find(
    (row) => row.overrideDate === dateYmd && row.capability === capability,
  );
  if (dated) {
    return {
      enabled: dated.enabled,
      opensAt: dated.opensAt,
      closesAt: dated.closesAt,
      latestBookable: dated.latestBookable,
      usualStart: dated.usualStart,
      usualEnd: dated.usualEnd,
      source: "override",
    };
  }
  if (weekday == null) {
    return {
      enabled: false,
      opensAt: null,
      closesAt: null,
      latestBookable: null,
      usualStart: null,
      usualEnd: null,
      source: "none",
    };
  }
  const weekly = snapshot.weekly.find(
    (row) => row.capability === capability && row.weekday === weekday,
  );
  if (!weekly) {
    return {
      enabled: false,
      opensAt: null,
      closesAt: null,
      latestBookable: null,
      usualStart: null,
      usualEnd: null,
      source: "none",
    };
  }
  return {
    enabled: weekly.enabled,
    opensAt: weekly.opensAt,
    closesAt: weekly.closesAt,
    latestBookable: weekly.latestBookable,
    usualStart: weekly.usualStart,
    usualEnd: weekly.usualEnd,
    source: "weekly",
  };
}

export function isTimeWithinHours(
  row: ResolvedOperatingHours,
  timeHm: string,
): boolean {
  if (!row.enabled || !row.opensAt) return false;
  const time = timeHm.trim().slice(0, 5);
  if (!isThirtyMinuteGrid(time)) return false;
  const last = customerLastBookable(row);
  if (!last) return false;
  const t = hmToMinutes(time);
  const start = hmToMinutes(row.opensAt);
  const end = hmToMinutes(last);
  if (t == null || start == null || end == null) return false;
  return t >= start && t <= end;
}

export function slotsWithinHours(row: ResolvedOperatingHours): string[] {
  if (!row.enabled || !row.opensAt) return [];
  const last = customerLastBookable(row);
  if (!last) return [];
  return rangeSlotsInclusive(row.opensAt, last);
}

export function copyWeeklyDayToDate(
  snapshot: OperatingHoursSnapshot,
  dateYmd: string,
  fromWeekday: number,
  capabilities: readonly OperatingHoursCapability[] = OPERATING_HOURS_CAPABILITIES,
): OperatingHoursSnapshot {
  const copied: OperatingHoursDateOverride[] = [];
  for (const capability of capabilities) {
    const weekly = snapshot.weekly.find(
      (row) => row.capability === capability && row.weekday === fromWeekday,
    );
    if (!weekly) continue;
    copied.push({
      ...weekly,
      overrideDate: dateYmd,
      note: null,
    });
  }
  return {
    weekly: snapshot.weekly,
    overrides: [
      ...snapshot.overrides.filter(
        (row) =>
          row.overrideDate !== dateYmd ||
          !capabilities.includes(row.capability),
      ),
      ...copied,
    ],
  };
}

export function closeCapabilitiesOnDate(
  snapshot: OperatingHoursSnapshot,
  dateYmd: string,
  capabilities: readonly OperatingHoursCapability[] = OPERATING_HOURS_CAPABILITIES,
): OperatingHoursSnapshot {
  const closed: OperatingHoursDateOverride[] = capabilities.map(
    (capability) => ({
      capability,
      weekday: weekdayFromYmd(dateYmd) ?? 0,
      enabled: false,
      opensAt: null,
      closesAt: null,
      latestBookable: null,
      usualStart: null,
      usualEnd: null,
      overrideDate: dateYmd,
      note: null,
    }),
  );
  return {
    weekly: snapshot.weekly,
    overrides: [
      ...snapshot.overrides.filter(
        (row) =>
          row.overrideDate !== dateYmd ||
          !capabilities.includes(row.capability),
      ),
      ...closed,
    ],
  };
}

type DayPattern = {
  enabled: boolean;
  opensAt: string | null;
  latest: string | null;
};

function groupEnabledDays(
  snapshot: OperatingHoursSnapshot,
  capability: OperatingHoursCapability,
): Array<{ days: number[]; pattern: DayPattern }> {
  const groups: Array<{ days: number[]; pattern: DayPattern }> = [];
  for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
    const weekly = snapshot.weekly.find(
      (row) => row.capability === capability && row.weekday === weekday,
    );
    const pattern: DayPattern = {
      enabled: Boolean(weekly?.enabled),
      opensAt: weekly?.opensAt ?? null,
      latest: weekly?.latestBookable ?? weekly?.closesAt ?? null,
    };
    const match = groups.find(
      (group) =>
        group.pattern.enabled === pattern.enabled &&
        group.pattern.opensAt === pattern.opensAt &&
        group.pattern.latest === pattern.latest,
    );
    if (match) match.days.push(weekday);
    else groups.push({ days: [weekday], pattern });
  }
  return groups;
}

function formatDayList(days: number[]): string {
  if (days.length === 1) return weekdayShortLabel(days[0] ?? 0);
  if (days.length === 2) {
    return `${weekdayShortLabel(days[0] ?? 0)} & ${weekdayShortLabel(days[1] ?? 0)}`;
  }
  const last = days[days.length - 1] ?? 0;
  return `${days.slice(0, -1).map(weekdayShortLabel).join(", ")} & ${weekdayShortLabel(last)}`;
}

function formatOpenPattern(pattern: DayPattern): string | null {
  if (!pattern.enabled || !pattern.opensAt || !pattern.latest) return null;
  return `${formatClock12h(pattern.opensAt)}–${formatClock12h(pattern.latest)}`;
}

/** Customer-facing hours paragraph generated from the snapshot. */
export function customerHoursNoticeFromSnapshot(
  snapshot: OperatingHoursSnapshot,
): string {
  const dineInParts: string[] = [];
  let dineInClosed: string[] = [];
  for (const group of groupEnabledDays(snapshot, "dine_in")) {
    const range = formatOpenPattern(group.pattern);
    if (range) dineInParts.push(`${formatDayList(group.days)} from ${range}`);
    else dineInClosed = dineInClosed.concat(group.days.map(weekdayShortLabel));
  }
  const deliveryParts: string[] = [];
  let deliveryClosed: string[] = [];
  for (const group of groupEnabledDays(snapshot, "delivery")) {
    const range = formatOpenPattern(group.pattern);
    if (range) deliveryParts.push(`${formatDayList(group.days)} from ${range}`);
    else deliveryClosed = deliveryClosed.concat(group.days.map(weekdayShortLabel));
  }

  const dineIn =
    dineInParts.length > 0
      ? `Dine-in is available ${dineInParts.join(", ")}.`
      : "Dine-in is currently unavailable.";
  const dineClosed =
    dineInClosed.length > 0
      ? ` ${dineInClosed.join(", ")} is normally unavailable. If that day is opened as a public holiday, availability will be shown for that date.`
      : "";
  const delivery =
    deliveryParts.length > 0
      ? ` Delivery is available ${deliveryParts.join(", ")}.`
      : "";
  const deliveryClosedText =
    deliveryClosed.length > 0
      ? ` There is no delivery on ${deliveryClosed.join(", ")}.`
      : "";
  return `Planning your visit? ${dineIn}${dineClosed}${delivery}${deliveryClosedText}`.replace(
    /\s+/g,
    " ",
  ).trim();
}
