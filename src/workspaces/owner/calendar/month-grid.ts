/** Monday-first week grid helpers for Whole Cake Calendar (Singapore business locale). */

export type CalendarDayCell = {
  ymd: string;
  dayOfMonth: number;
  weekdayShort: string;
  inMonth: boolean;
  isToday: boolean;
};

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function singaporeTodayParts(now: Date = new Date()): {
  year: number;
  month: number;
  ymd: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const ymd = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, ymd };
}

export function formatMonthYearLabel(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("en-SG", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function toYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Monday = 0 … Sunday = 6 */
function mondayFirstWeekdayIndex(year: number, month: number, day: number): number {
  const js = new Date(year, month - 1, day).getDay(); // Sun=0
  return js === 0 ? 6 : js - 1;
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

/**
 * Full-month grid including muted leading/trailing days from adjacent months.
 * Always 6 weeks × 7 days for stable layout.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  todayYmd: string = singaporeTodayParts().ymd,
): CalendarDayCell[] {
  const firstWeekday = mondayFirstWeekdayIndex(year, month, 1);
  const thisMonthDays = daysInMonth(year, month);
  const prev = shiftMonth(year, month, -1);
  const prevMonthDays = daysInMonth(prev.year, prev.month);
  const next = shiftMonth(year, month, 1);

  const cells: CalendarDayCell[] = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    const day = prevMonthDays - firstWeekday + 1 + i;
    const ymd = toYmd(prev.year, prev.month, day);
    cells.push({
      ymd,
      dayOfMonth: day,
      weekdayShort: WEEKDAY_SHORT[cells.length % 7]!,
      inMonth: false,
      isToday: ymd === todayYmd,
    });
  }

  for (let day = 1; day <= thisMonthDays; day += 1) {
    const ymd = toYmd(year, month, day);
    cells.push({
      ymd,
      dayOfMonth: day,
      weekdayShort: WEEKDAY_SHORT[cells.length % 7]!,
      inMonth: true,
      isToday: ymd === todayYmd,
    });
  }

  let nextDay = 1;
  while (cells.length < 42) {
    const ymd = toYmd(next.year, next.month, nextDay);
    cells.push({
      ymd,
      dayOfMonth: nextDay,
      weekdayShort: WEEKDAY_SHORT[cells.length % 7]!,
      inMonth: false,
      isToday: ymd === todayYmd,
    });
    nextDay += 1;
  }

  return cells;
}

export function monthVisibleRange(
  year: number,
  month: number,
): { from: string; to: string } {
  const cells = buildMonthGrid(year, month, "1970-01-01");
  return {
    from: cells[0]!.ymd,
    to: cells[cells.length - 1]!.ymd,
  };
}

/** Selected-month dates only (no adjacent-month padding) — for Matrix columns. */
export function buildMonthDateColumns(
  year: number,
  month: number,
  todayYmd: string = singaporeTodayParts().ymd,
): CalendarDayCell[] {
  const totalDays = daysInMonth(year, month);
  const columns: CalendarDayCell[] = [];
  for (let day = 1; day <= totalDays; day += 1) {
    const ymd = toYmd(year, month, day);
    const weekdayIndex = mondayFirstWeekdayIndex(year, month, day);
    columns.push({
      ymd,
      dayOfMonth: day,
      weekdayShort: WEEKDAY_SHORT[weekdayIndex]!,
      inMonth: true,
      isToday: ymd === todayYmd,
    });
  }
  return columns;
}

export const WEEKDAY_HEADERS = WEEKDAY_SHORT;
