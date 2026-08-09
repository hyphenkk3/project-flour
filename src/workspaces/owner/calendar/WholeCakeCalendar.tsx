"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getCalendarEntryByOrderIdAction,
  listCalendarEntriesForMonthAction,
} from "@/workspaces/owner/calendar/actions";
import {
  clearTakenCalendarReturnPosition,
  discardCalendarReturnPosition,
  takeCalendarReturnPosition,
} from "@/workspaces/owner/calendar/calendar-return-position";
import {
  clearCalendarWorkingScrollYOnReload,
  restoreCalendarWorkingScrollY,
  trackCalendarWorkingScrollY,
} from "@/workspaces/owner/calendar/calendar-working-scroll";
import { buildWholeCakeCalendarPath } from "@/workspaces/owner/calendar/calendar-url";
import {
  CalendarMatrixView,
  clearMatrixScrollMemory,
  seedMatrixScrollMemory,
} from "@/workspaces/owner/calendar/CalendarMatrixView";
import { CalendarMonthGrid } from "@/workspaces/owner/calendar/CalendarMonthGrid";
import { CalendarMonthHeader } from "@/workspaces/owner/calendar/CalendarMonthHeader";
import { CalendarQuickView } from "@/workspaces/owner/calendar/CalendarQuickView";
import {
  buildMonthDateColumns,
  buildMonthGrid,
  monthVisibleRange,
  singaporeTodayParts,
} from "@/workspaces/owner/calendar/month-grid";
import type {
  CalendarEntry,
  CalendarMatrixMode,
  CalendarViewMode,
} from "@/workspaces/owner/calendar/types";

const POLL_INTERVAL_MS = 30_000;

type WholeCakeCalendarProps = {
  year: number;
  month: number;
  view: CalendarViewMode;
  matrixMode: CalendarMatrixMode;
  focusToday: boolean;
  /** True only for Order Workspace ← Whole Cake Calendar (rp=1). */
  restorePosition: boolean;
  initialEntries: CalendarEntry[];
  /** Default sender for Customer Ready Message. */
  staffDisplayName: string;
};

type OrderRowPayload = {
  id?: string;
  customer_id?: string | null;
};

function sortEntries(entries: CalendarEntry[]): CalendarEntry[] {
  return [...entries].sort((a, b) => {
    const dateCmp = a.pickupDate.localeCompare(b.pickupDate);
    if (dateCmp !== 0) return dateCmp;
    const timeCmp = a.pickupTime.localeCompare(b.pickupTime);
    if (timeCmp !== 0) return timeCmp;
    const nameCmp = a.customerName.localeCompare(b.customerName, "en", {
      sensitivity: "base",
    });
    if (nameCmp !== 0) return nameCmp;
    return a.displayName.localeCompare(b.displayName, "en", {
      sensitivity: "base",
    });
  });
}

export function WholeCakeCalendar({
  year,
  month,
  view,
  matrixMode,
  focusToday,
  restorePosition,
  initialEntries,
  staffDisplayName,
}: WholeCakeCalendarProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [quickViewOrderId, setQuickViewOrderId] = useState<string | null>(null);
  const [quickViewRefreshKey, setQuickViewRefreshKey] = useState(0);
  const quickViewOrderIdRef = useRef<string | null>(null);
  quickViewOrderIdRef.current = quickViewOrderId;
  const todayYmd = singaporeTodayParts().ymd;
  const cells = useMemo(
    () => buildMonthGrid(year, month, todayYmd),
    [year, month, todayYmd],
  );
  const matrixColumns = useMemo(
    () => buildMonthDateColumns(year, month, todayYmd),
    [year, month, todayYmd],
  );
  const range = useMemo(() => monthVisibleRange(year, month), [year, month]);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries, year, month]);

  const upsertEntry = useCallback(
    (entry: CalendarEntry) => {
      setEntries((current) => {
        const without = current.filter((row) => row.id !== entry.id);
        if (entry.pickupDate < range.from || entry.pickupDate > range.to) {
          return without;
        }
        return sortEntries([...without, entry]);
      });
    },
    [range.from, range.to],
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((current) => current.filter((row) => row.id !== id));
  }, []);

  const loadEntry = useCallback(async (id: string) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const entry = await getCalendarEntryByOrderIdAction(id);
      if (entry) return entry;
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
    return null;
  }, []);

  const handleIncoming = useCallback(
    async (id: string) => {
      const entry = await loadEntry(id);
      if (!entry) {
        removeEntry(id);
        return;
      }
      upsertEntry(entry);
      if (quickViewOrderIdRef.current === id) {
        setQuickViewRefreshKey((key) => key + 1);
      }
    },
    [loadEntry, removeEntry, upsertEntry],
  );

  const reconcileFromServer = useCallback(async () => {
    try {
      const latest = await listCalendarEntriesForMonthAction(year, month);
      setEntries(latest);
    } catch {
      // Keep last successful calendar state.
    }
  }, [year, month]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`whole-cake-calendar-${year}-${month}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as OrderRowPayload;
          if (!row.id || row.customer_id != null) return;
          void handleIncoming(row.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as OrderRowPayload;
          if (!row.id || row.customer_id != null) return;
          void handleIncoming(row.id);
        },
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      void reconcileFromServer();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [handleIncoming, reconcileFromServer, year, month]);

  const matrixHref = useCallback(
    (nextMode: CalendarMatrixMode) => {
      return buildWholeCakeCalendarPath({
        year,
        month,
        view: "matrix",
        matrixMode: nextMode,
      });
    },
    [year, month],
  );

  const calendarReturnTo = useMemo(
    () =>
      buildWholeCakeCalendarPath({
        year,
        month,
        view,
        matrixMode,
      }),
    [year, month, view, matrixMode],
  );

  // One-shot reload cleanup — nav.type stays "reload" for the whole document life.
  const clearedReloadRef = useRef(false);
  const [orderReturnMatrixScrollLeft, setOrderReturnMatrixScrollLeft] =
    useState<number | null>(null);
  const clearOrderReturnMatrix = useCallback(() => {
    setOrderReturnMatrixScrollLeft(null);
  }, []);

  // Contextual Order → Calendar restore only when rp=1.
  // Ordinary Calendar entry discards order-return capture; may restore SPA
  // vertical working position (never old Matrix horizontal).
  useLayoutEffect(() => {
    if (!clearedReloadRef.current) {
      clearedReloadRef.current = true;
      clearCalendarWorkingScrollYOnReload();
    }

    if (restorePosition) {
      const position = takeCalendarReturnPosition(calendarReturnTo, true);
      if (position) {
        if (view === "matrix" && position.matrixScrollLeft != null) {
          seedMatrixScrollMemory(year, month, position.matrixScrollLeft);
          setOrderReturnMatrixScrollLeft(position.matrixScrollLeft);
        }
        const y = position.scrollY;
        trackCalendarWorkingScrollY(y);
        window.scrollTo(0, y);
        requestAnimationFrame(() => {
          window.scrollTo(0, y);
        });
      }

      const params = new URLSearchParams(window.location.search);
      if (params.has("rp")) {
        params.delete("rp");
        const query = params.toString();
        const next = query ? `/owner/calendar?${query}` : "/owner/calendar";
        window.history.replaceState(window.history.state, "", next);
      }

      const clearId = window.setTimeout(() => {
        clearTakenCalendarReturnPosition();
      }, 0);
      return () => window.clearTimeout(clearId);
    }

    discardCalendarReturnPosition();
    // Fresh SPA Calendar entry (e.g. Operations → Calendar): vertical only.
    // Matrix horizontal stays cleared → Today / day-1 on mount.
    restoreCalendarWorkingScrollY();
  }, [restorePosition, calendarReturnTo, year, month, view]);

  // Track document vertical working position for SPA re-entry.
  // Capture on leave-clicks too — more reliable than scroll alone when
  // Next scrolls the document during route change.
  useEffect(() => {
    const sync = () => {
      trackCalendarWorkingScrollY(
        window.scrollY || document.documentElement.scrollTop || 0,
      );
    };
    const captureLeaving = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (href.startsWith("/owner/calendar")) return;
      sync();
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    document.addEventListener("click", captureLeaving, true);
    return () => {
      window.removeEventListener("scroll", sync);
      document.removeEventListener("click", captureLeaving, true);
    };
  }, []);

  // Live Matrix horizontal memory is visit-scoped to Calendar. Clear only when
  // leaving /owner/calendar (not on Customers ↔ Totals / view remounts).
  useEffect(() => {
    return () => {
      queueMicrotask(() => {
        if (typeof window === "undefined") return;
        if (!window.location.pathname.startsWith("/owner/calendar")) {
          clearMatrixScrollMemory();
        }
      });
    };
  }, []);

  return (
    <div className="space-y-6">
      <CalendarMonthHeader
        matrixMode={matrixMode}
        month={month}
        view={view}
        year={year}
      />
      {view === "matrix" ? (
        <CalendarMatrixView
          columns={matrixColumns}
          entries={entries}
          focusToday={focusToday}
          matrixHref={matrixHref}
          mode={matrixMode}
          month={month}
          onOpenQuickView={setQuickViewOrderId}
          onOrderReturnMatrixApplied={clearOrderReturnMatrix}
          orderReturnMatrixScrollLeft={orderReturnMatrixScrollLeft}
          year={year}
        />
      ) : (
        <CalendarMonthGrid
          cells={cells}
          entries={entries}
          onOpenQuickView={setQuickViewOrderId}
          view={view}
        />
      )}
      <CalendarQuickView
        onClose={() => setQuickViewOrderId(null)}
        orderId={quickViewOrderId}
        refreshKey={quickViewRefreshKey}
        returnTo={calendarReturnTo}
        staffDisplayName={staffDisplayName}
      />
    </div>
  );
}
