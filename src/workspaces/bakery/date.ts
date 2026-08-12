/**
 * M5-P1 — Bakery fulfilment-date helpers (Asia/Singapore business calendar).
 */

const TIME_ZONE = "Asia/Singapore";

function singaporeYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function bakeryTodayYmd(now: Date = new Date()): string {
  return singaporeYmd(now);
}

export function bakeryTomorrowYmd(now: Date = new Date()): string {
  return addCalendarDaysYmd(singaporeYmd(now), 1);
}

export function bakeryPlusTwoYmd(now: Date = new Date()): string {
  return addCalendarDaysYmd(singaporeYmd(now), 2);
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse ?date=YYYY-MM-DD; invalid/missing → Today. */
export function resolveBakeryBoardDate(
  raw: string | null | undefined,
  now: Date = new Date(),
): string {
  const value = (raw ?? "").trim();
  if (!YMD_RE.test(value)) return bakeryTodayYmd(now);
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(y, m - 1, d);
  if (
    probe.getFullYear() !== y ||
    probe.getMonth() !== m - 1 ||
    probe.getDate() !== d
  ) {
    return bakeryTodayYmd(now);
  }
  return value;
}

export function bakeryDateNavHref(ymd: string): string {
  return `/bakery?date=${encodeURIComponent(ymd)}`;
}

export function bakeryOrderHref(orderId: string, boardDate: string): string {
  return `/bakery/orders/${orderId}?date=${encodeURIComponent(boardDate)}`;
}
