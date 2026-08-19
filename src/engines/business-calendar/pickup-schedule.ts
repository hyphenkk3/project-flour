/**
 * Authoritative Whitebird pickup schedule resolver.
 * Customer slots and Bakery Early Pickup must consume this truth only.
 *
 * Temporary code-config foundation — later replaceable by persisted
 * Business Calendar / Special Operating Dates without changing consumers.
 */

import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  resolveOperatingHours,
  slotsWithinHours,
  weekdayFromYmd,
  type OperatingHoursSnapshot,
} from "@/engines/business-calendar/operating-hours";
import type {
  PickupDateOverride,
  PickupScheduleBaseProfile,
} from "@/engines/business-calendar/pickup-date-overrides";

export type { PickupDateOverride, PickupScheduleBaseProfile };

export type OpenPickupSchedule = {
  status: "open";
  baseProfile: PickupScheduleBaseProfile;
  earliestSelectable: string;
  usualPickupStart: string;
  usualPickupEnd: string;
  latestSelectable: string;
  /** Contiguous 30-minute HH:MM values from earliest through latest. */
  selectableSlots: string[];
};

export type ClosedPickupSchedule = {
  status: "closed";
};

export type EffectivePickupSchedule = OpenPickupSchedule | ClosedPickupSchedule;

const DAY = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
} as const;

type WeeklyProfile = {
  earliestSelectable: string;
  usualPickupStart: string;
  usualPickupEnd: string;
  latestSelectable: string;
};

const WEEKLY_PROFILES: Record<PickupScheduleBaseProfile, WeeklyProfile> = {
  weekday: {
    earliestSelectable: "12:00",
    usualPickupStart: "15:00",
    usualPickupEnd: "17:30",
    latestSelectable: "17:30",
  },
  wednesday_walkin_closed: {
    earliestSelectable: "12:00",
    usualPickupStart: "13:00",
    usualPickupEnd: "15:00",
    latestSelectable: "15:00",
  },
  weekend_extended: {
    earliestSelectable: "12:00",
    usualPickupStart: "15:00",
    usualPickupEnd: "17:30",
    latestSelectable: "21:30",
  },
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function minutesToValue(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

function hmToMinutes(hm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Display label, e.g. "4:00 PM". */
export function formatPickupClockLabel(value: string): string {
  const [hRaw, mRaw] = value.split(":");
  const hours = Number(hRaw);
  const minutes = mRaw ?? "00";
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

export function rangeSlotsInclusive(
  startHm: string,
  endHm: string,
  stepMinutes = 30,
): string[] {
  const start = hmToMinutes(startHm);
  const end = hmToMinutes(endHm);
  if (start == null || end == null || start > end) return [];
  const values: string[] = [];
  for (let cursor = start; cursor <= end; cursor += stepMinutes) {
    values.push(minutesToValue(cursor));
  }
  return values;
}

function weekdayBaseProfile(weekday: number): PickupScheduleBaseProfile {
  if (weekday === DAY.wednesday) return "wednesday_walkin_closed";
  if (
    weekday === DAY.friday ||
    weekday === DAY.saturday ||
    weekday === DAY.sunday
  ) {
    return "weekend_extended";
  }
  return "weekday";
}

function calendarWeekday(dateYmd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return null;
  const [year, month, day] = dateYmd.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function openFromProfile(
  baseProfile: PickupScheduleBaseProfile,
  windows: WeeklyProfile,
): OpenPickupSchedule {
  return {
    status: "open",
    baseProfile,
    earliestSelectable: windows.earliestSelectable,
    usualPickupStart: windows.usualPickupStart,
    usualPickupEnd: windows.usualPickupEnd,
    latestSelectable: windows.latestSelectable,
    selectableSlots: rangeSlotsInclusive(
      windows.earliestSelectable,
      windows.latestSelectable,
    ),
  };
}

/**
 * Resolve schedule for a date given an optional override row.
 * Prefer this in tests with fixture overrides.
 */
export function resolveEffectivePickupSchedule(
  dateYmd: string,
  override: PickupDateOverride | undefined,
): EffectivePickupSchedule {
  const weekday = calendarWeekday(dateYmd);
  if (weekday == null) {
    return { status: "closed" };
  }

  if (override?.mode === "closed") {
    return { status: "closed" };
  }

  const baseProfile =
    override?.mode === "special" && override.baseProfile
      ? override.baseProfile
      : weekdayBaseProfile(weekday);

  const base = WEEKLY_PROFILES[baseProfile];
  const windows: WeeklyProfile = { ...base };

  if (override?.mode === "special") {
    if (override.earliestSelectable) {
      windows.earliestSelectable = override.earliestSelectable;
    }
    if (override.usualPickupStart) {
      windows.usualPickupStart = override.usualPickupStart;
    }
    if (override.usualPickupEnd) {
      windows.usualPickupEnd = override.usualPickupEnd;
    }
    if (override.latestSelectable) {
      windows.latestSelectable = override.latestSelectable;
    }
  }

  return openFromProfile(baseProfile, windows);
}

function pickupScheduleFromHours(
  dateYmd: string,
  snapshot: OperatingHoursSnapshot,
): EffectivePickupSchedule {
  const weekday = weekdayFromYmd(dateYmd);
  if (weekday == null) return { status: "closed" };
  const row = resolveOperatingHours(snapshot, "pickup", dateYmd);
  const times = slotsWithinHours(row);
  if (!row.enabled || times.length === 0 || !row.opensAt) {
    return { status: "closed" };
  }
  const latest = row.latestBookable ?? row.closesAt ?? times[times.length - 1] ?? row.opensAt;
  return {
    status: "open",
    baseProfile: weekdayBaseProfile(weekday),
    earliestSelectable: row.opensAt,
    usualPickupStart: row.usualStart ?? row.opensAt,
    usualPickupEnd: row.usualEnd ?? latest,
    latestSelectable: latest,
    selectableSlots: times,
  };
}

/** Production entry: persisted operating hours (seed until DB is applied). */
export function getEffectivePickupSchedule(
  dateYmd: string,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): EffectivePickupSchedule {
  return pickupScheduleFromHours(dateYmd, snapshot);
}

export function isPublicPickupTimeOnSchedule(
  schedule: EffectivePickupSchedule,
  timeValue: string,
): boolean {
  if (schedule.status !== "open") return false;
  return schedule.selectableSlots.includes(timeValue);
}

/**
 * Staff exception warnings — do not block Owner Custom-time flexibility.
 * Closed date and outside public hours are warnings only.
 */
export type StaffPickupExceptionWarning =
  | {
      kind: "closed_date";
      message: string;
    }
  | {
      kind: "outside_public_hours";
      message: string;
      latestSelectable: string;
    };

export const STAFF_CLOSED_DATE_WARNING =
  "Closed date — Whitebird is not accepting regular orders on this date. Continue only for an approved exception.";

export function staffOutsidePublicHoursWarning(
  latestSelectable: string,
): string {
  return `Outside customer pickup hours — Customer pickup ends at ${formatPickupClockLabel(latestSelectable)} on this date.`;
}

/**
 * Derive staff warning for Owner create/edit pickup fields.
 * `normalizedTime` is HH:MM or empty when time not yet chosen.
 */
export function getStaffPickupExceptionWarning(
  dateYmd: string,
  normalizedTime: string | null | undefined,
  schedule: EffectivePickupSchedule = getEffectivePickupSchedule(dateYmd),
): StaffPickupExceptionWarning | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return null;

  if (schedule.status === "closed") {
    return {
      kind: "closed_date",
      message: STAFF_CLOSED_DATE_WARNING,
    };
  }

  const time = normalizedTime?.trim() ?? "";
  if (!time) return null;
  if (isPublicPickupTimeOnSchedule(schedule, time)) return null;

  // Any non-public clock time (including Custom outside hours) warns.
  // Invalid clock strings still warn once a time is present and not public.
  return {
    kind: "outside_public_hours",
    message: staffOutsidePublicHoursWarning(schedule.latestSelectable),
    latestSelectable: schedule.latestSelectable,
  };
}
