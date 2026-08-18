const TIME_ZONE = "Asia/Singapore";
const LOCALE = "en-SG";

/** Fixed English abbreviations so SSR and Safari cannot diverge (`Sep` vs `Sept`). */
const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const SHORT_WEEKDAY_NAMES = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

const LONG_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function businessDateParts(
  ymd: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Calendar date from YYYY-MM-DD, e.g. 16 Sep 2026. No Intl. */
export function formatBusinessCalendarDate(ymd: string): string {
  const parts = businessDateParts(ymd.slice(0, 10));
  if (!parts) return ymd;
  const monthLabel = SHORT_MONTH_NAMES[parts.month - 1];
  if (!monthLabel) return ymd;
  return `${parts.day} ${monthLabel} ${parts.year}`;
}

/** Short weekday from YYYY-MM-DD, e.g. Mon. */
export function formatBusinessWeekdayAbbrev(ymd: string): string {
  const date = parseBusinessDate(ymd.slice(0, 10));
  if (!date) return "";
  return SHORT_WEEKDAY_NAMES[date.getDay()] ?? "";
}

/** Calendar date, e.g. 3 Aug 2026 */
export function formatDate(value: string | number | Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

/**
 * Formats a business calendar date (YYYY-MM-DD) as DD/MM/YYYY
 * without timezone shifting.
 */
export function formatDdMmYyyy(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return ymd;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** Parses YYYY-MM-DD as a local calendar date (no UTC shift). */
export function parseBusinessDate(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day);
}

/** Long weekday date from YYYY-MM-DD, e.g. Saturday, 29 August 2026 */
export function formatLongBusinessDate(ymd: string): string {
  const date = parseBusinessDate(ymd);
  if (!date) return ymd;
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Compact customer-facing pickup date, e.g. 29 Aug */
export function formatShortBusinessDate(ymd: string): string {
  const parts = businessDateParts(ymd.trim());
  if (!parts) return ymd;
  const monthLabel = SHORT_MONTH_NAMES[parts.month - 1];
  if (!monthLabel) return ymd;
  return `${parts.day} ${monthLabel}`;
}

/** Date with time, e.g. 3 Aug 2026, 4:30 pm */
export function formatDateTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

/** Weekday + date, e.g. Monday, 3 August 2026 */
export function formatLongDate(value: string | number | Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

/** Time only in Asia/Singapore, e.g. 4:30 pm */
export function formatTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

/** ISO calendar date (YYYY-MM-DD) in Asia/Singapore. */
export function toBusinessDateKey(
  value: string | number | Date = new Date(),
): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

/** YYYY-MM from a business date YYYY-MM-DD. */
export function businessYearMonth(ymd: string): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(ymd.trim());
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

/** Month abbreviation from YYYY-MM or YYYY-MM-DD, e.g. Sep. */
export function formatBusinessMonthAbbrev(yearMonth: string): string {
  const key = yearMonth.trim().slice(0, 7);
  const month = Number(key.slice(5, 7));
  return SHORT_MONTH_NAMES[month - 1] ?? key;
}

/** Month label from YYYY-MM-DD, e.g. August 2026. */
export function formatBusinessMonthYear(ymd: string): string {
  const parts = businessDateParts(ymd.slice(0, 10));
  if (!parts) return ymd;
  const monthLabel = LONG_MONTH_NAMES[parts.month - 1];
  if (!monthLabel) return ymd;
  return `${monthLabel} ${parts.year}`;
}

/** True when two business dates fall in different calendar months. */
export function isDifferentBusinessMonth(
  fromYmd: string,
  toYmd: string,
): boolean {
  const from = businessYearMonth(fromYmd);
  const to = businessYearMonth(toYmd);
  if (!from || !to) return false;
  return from !== to;
}

/** Last calendar day of a YYYY-MM or YYYY-MM-DD month, e.g. 2026-09-30. */
export function lastDayOfBusinessMonth(yearMonthOrStart: string): string | null {
  const key = yearMonthOrStart.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(key)) return null;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  if (month < 1 || month > 12) return null;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextStart = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return addBusinessCalendarDays(nextStart, -1);
}

/** Add whole calendar days to a YYYY-MM-DD business date (no timezone shift). */
export function addBusinessCalendarDays(ymd: string, days: number): string | null {
  const date = parseBusinessDate(ymd);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Whole calendar days from `fromYmd` to `toYmd`.
 * 16 Aug minus 14 Aug = 2. Pickup time is irrelevant.
 */
export function calendarDaysBetween(fromYmd: string, toYmd: string): number | null {
  const from = parseBusinessDate(fromYmd);
  const to = parseBusinessDate(toYmd);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
