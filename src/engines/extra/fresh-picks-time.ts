/**
 * Malaysia wall-clock instants for Extra order/pickup windows.
 * Asia/Kuala_Lumpur is UTC+8 year-round (no DST).
 */

import { toBusinessDateKey, formatBusinessCalendarDate, formatBusinessWeekdayAbbrev } from "@/lib/dates";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseExtraThroughHhmm(
  hhmm: string,
): { hour: number; minute: number } | null {
  const match = HHMM.exec(hhmm.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function isExtraThroughSlot(hhmm: string): boolean {
  const parsed = parseExtraThroughHhmm(hhmm);
  if (!parsed) return false;
  return parsed.minute === 0 || parsed.minute === 30;
}

export function malaysiaDateTimeToIso(
  ymd: string,
  hhmm: string,
): string | null {
  const date = ymd.trim().slice(0, 10);
  if (!YMD.test(date)) return null;
  const parsed = parseExtraThroughHhmm(hhmm);
  if (!parsed) return null;
  const iso = `${date}T${pad2(parsed.hour)}:${pad2(parsed.minute)}:00+08:00`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  if (toBusinessDateKey(new Date(ms)) !== date) return null;
  return new Date(ms).toISOString();
}

/** @deprecated Use malaysiaDateTimeToIso. */
export const singaporeDateTimeToIso = malaysiaDateTimeToIso;

export function extraPickupThroughIso(
  preparedOnYmd: string,
  throughSlot: string,
): string | null {
  if (!isExtraThroughSlot(throughSlot)) return null;
  return malaysiaDateTimeToIso(preparedOnYmd, throughSlot);
}

export function malaysiaClockHhmm(iso: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  if (!hour || !minute) return null;
  return `${hour}:${minute}`;
}

/** @deprecated Use malaysiaClockHhmm. */
export const singaporeClockHhmm = malaysiaClockHhmm;

export function formatExtraPickupThroughClock(iso: string): string {
  const hhmm = malaysiaClockHhmm(iso);
  if (!hhmm) return "—";
  const [hRaw, mRaw] = hhmm.split(":");
  const hours = Number(hRaw);
  const minutes = mRaw ?? "00";
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

export function malaysiaDateTimeParts(
  iso: string,
): { date: string; time: string } | null {
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  if (!year || !month || !day || !hour || !minute) return null;
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

/** Bakery ExtraBoard window instant, e.g. 18 Aug 2026 (Mon), 12:00 PM Malaysia time. */
export function formatExtraBoardWindowInstant(iso: string): string {
  const clock = formatExtraPickupThroughClock(iso);
  if (clock === "—") return "—";
  const ymd = toBusinessDateKey(iso);
  const weekday = formatBusinessWeekdayAbbrev(ymd);
  const dateLabel = formatBusinessCalendarDate(ymd);
  return `${dateLabel} (${weekday}), ${clock} Malaysia time`;
}
