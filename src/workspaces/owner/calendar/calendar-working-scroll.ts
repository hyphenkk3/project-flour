/**
 * SPA-tab Calendar document (vertical) working position.
 *
 * Separate from:
 * - Order Workspace return (rp=1 — exact vertical + Matrix horizontal)
 * - Matrix horizontal memory (Customers ↔ Totals / cleared on leave Calendar)
 *
 * Survives Operations ↔ Calendar within the same tab.
 * Cleared on Calendar full reload so fresh entry stays clean.
 */

const STORAGE_KEY = "wos:owner-calendar-working-y";

let workingScrollY: number | null = null;
let restoreGuardUntil = 0;

function readStoredY(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return null;
    const y = Number(raw);
    return Number.isFinite(y) && y >= 0 ? y : null;
  } catch {
    return null;
  }
}

function writeStoredY(scrollY: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(scrollY));
  } catch {
    // ignore
  }
}

export function trackCalendarWorkingScrollY(scrollY: number): void {
  if (!Number.isFinite(scrollY) || scrollY < 0) return;
  // While restoring, ignore transient 0 from incomplete layout / router.
  if (
    Date.now() < restoreGuardUntil &&
    scrollY === 0 &&
    (workingScrollY ?? readStoredY() ?? 0) > 0
  ) {
    return;
  }
  workingScrollY = scrollY;
  writeStoredY(scrollY);
}

export function peekCalendarWorkingScrollY(): number | null {
  return workingScrollY ?? readStoredY();
}

export function clearCalendarWorkingScrollY(): void {
  workingScrollY = null;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Drop vertical memory on full Calendar reload (not SPA soft navigation). */
export function clearCalendarWorkingScrollYOnReload(): void {
  if (typeof window === "undefined") return;
  const nav = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;
  if (nav?.type === "reload") {
    clearCalendarWorkingScrollY();
  }
}

export function restoreCalendarWorkingScrollY(): void {
  if (typeof window === "undefined") return;
  const y = peekCalendarWorkingScrollY();
  if (y == null || y <= 0) return;

  restoreGuardUntil = Date.now() + 400;

  let attempts = 0;
  const apply = () => {
    window.scrollTo(0, y);
    attempts += 1;
    if (attempts < 8 && Math.abs(window.scrollY - y) > 2) {
      requestAnimationFrame(apply);
    }
  };
  apply();
}
