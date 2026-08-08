import { singaporeTodayParts } from "@/workspaces/owner/calendar/month-grid";
import {
  DEFAULT_CALENDAR_MATRIX_MODE,
  DEFAULT_CALENDAR_VIEW,
  isCalendarMatrixMode,
  isCalendarViewMode,
  type CalendarMatrixMode,
  type CalendarViewMode,
} from "@/workspaces/owner/calendar/types";

export function buildWholeCakeCalendarPath(input: {
  year: number;
  month: number;
  view: CalendarViewMode;
  matrixMode: CalendarMatrixMode;
}): string {
  const params = new URLSearchParams({
    year: String(input.year),
    month: String(input.month),
    view: input.view,
  });
  if (input.view === "matrix") {
    params.set("matrix", input.matrixMode);
  }
  return `/owner/calendar?${params.toString()}`;
}

export function resolveCalendarMonthParams(input: {
  year?: string;
  month?: string;
  view?: string;
  matrix?: string;
  focus?: string;
}): {
  year: number;
  month: number;
  view: CalendarViewMode;
  matrixMode: CalendarMatrixMode;
  focusToday: boolean;
} {
  const today = singaporeTodayParts();
  const yearRaw = input.year ? Number(input.year) : today.year;
  const monthRaw = input.month ? Number(input.month) : today.month;

  const year =
    Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100
      ? yearRaw
      : today.year;
  const month =
    Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : today.month;
  const view = isCalendarViewMode(input.view)
    ? input.view
    : DEFAULT_CALENDAR_VIEW;
  const matrixMode = isCalendarMatrixMode(input.matrix)
    ? input.matrix
    : DEFAULT_CALENDAR_MATRIX_MODE;
  const focusToday = input.focus === "today";

  return { year, month, view, matrixMode, focusToday };
}
