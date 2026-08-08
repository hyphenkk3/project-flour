/**
 * Transient UI state for restoring Whole Cake Calendar scroll after
 * Order Workspace return. Not business data — sessionStorage only.
 *
 * Restoration is eligible only when Calendar is opened with the contextual
 * return flag (rp=1) from ← Whole Cake Calendar. Ordinary Calendar entry
 * discards any pending capture without applying it.
 */

const STORAGE_KEY = "wos:owner-calendar-return-position";
const MAX_AGE_MS = 30 * 60 * 1000;

/** Query flag appended only to Order Workspace → Calendar back links. */
export const CALENDAR_RETURN_POSITION_PARAM = "rp";
export const CALENDAR_RETURN_POSITION_VALUE = "1";

export type CalendarReturnPosition = {
  calendarPath: string;
  scrollY: number;
  matrixScrollLeft: number | null;
  capturedAt: number;
};

/** Survives React Strict Mode remount after sessionStorage was cleared. */
let takenPosition: CalendarReturnPosition | null = null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePosition(raw: string): CalendarReturnPosition | null {
  try {
    const data = JSON.parse(raw) as Partial<CalendarReturnPosition>;
    if (typeof data.calendarPath !== "string" || !data.calendarPath) {
      return null;
    }
    if (!isFiniteNumber(data.scrollY) || data.scrollY < 0) return null;
    if (
      data.matrixScrollLeft != null &&
      (!isFiniteNumber(data.matrixScrollLeft) || data.matrixScrollLeft < 0)
    ) {
      return null;
    }
    if (!isFiniteNumber(data.capturedAt)) return null;
    return {
      calendarPath: data.calendarPath,
      scrollY: data.scrollY,
      matrixScrollLeft: data.matrixScrollLeft ?? null,
      capturedAt: data.capturedAt,
    };
  } catch {
    return null;
  }
}

/** Capture document + Matrix scroll before leaving Calendar for an order. */
export function captureCalendarReturnPosition(calendarPath: string): void {
  if (typeof window === "undefined") return;
  try {
    takenPosition = null;
    const matrix = document.querySelector<HTMLElement>("[data-matrix-scroll]");
    const position: CalendarReturnPosition = {
      calendarPath,
      scrollY: window.scrollY || document.documentElement.scrollTop || 0,
      matrixScrollLeft: matrix ? matrix.scrollLeft : null,
      capturedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // sessionStorage unavailable — navigation still works without restore.
  }
}

/** Drop persisted + in-memory pending return position without applying. */
export function discardCalendarReturnPosition(): void {
  takenPosition = null;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * One-shot read for a contextual Calendar return only.
 * Caller must pass allowRestore=true when URL has rp=1 from Order Workspace.
 */
export function takeCalendarReturnPosition(
  calendarPath: string,
  allowRestore: boolean,
): CalendarReturnPosition | null {
  if (typeof window === "undefined") return null;

  if (!allowRestore) {
    discardCalendarReturnPosition();
    return null;
  }

  if (
    takenPosition &&
    takenPosition.calendarPath === calendarPath &&
    Date.now() - takenPosition.capturedAt <= MAX_AGE_MS
  ) {
    return takenPosition;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const position = parsePosition(raw);
    if (!position) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (Date.now() - position.capturedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (position.calendarPath !== calendarPath) {
      return null;
    }

    sessionStorage.removeItem(STORAGE_KEY);
    takenPosition = position;
    return position;
  } catch {
    return null;
  }
}

/** Drop the in-memory one-shot copy after restore has settled. */
export function clearTakenCalendarReturnPosition(): void {
  takenPosition = null;
}

/**
 * Append the one-shot restore flag to a validated Calendar href.
 * Used only on ← Whole Cake Calendar from Order Workspace.
 */
export function withCalendarReturnPositionFlag(calendarHref: string): string {
  const url = new URL(calendarHref, "http://local.invalid");
  if (url.pathname !== "/owner/calendar") return calendarHref;
  url.searchParams.set(
    CALENDAR_RETURN_POSITION_PARAM,
    CALENDAR_RETURN_POSITION_VALUE,
  );
  return `${url.pathname}?${url.searchParams.toString()}`;
}
