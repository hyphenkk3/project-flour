const TIME_ZONE = "Asia/Singapore";
const LOCALE = "en-SG";

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
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
  const date = parseBusinessDate(ymd);
  if (!date) return ymd;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
  }).format(date);
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
