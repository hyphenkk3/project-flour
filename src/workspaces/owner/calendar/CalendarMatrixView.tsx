"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { CalendarGuide } from "@/workspaces/owner/calendar/CalendarGuide";
import type { CalendarExtraMarker } from "@/engines/extra/calendar-visibility";
import {
  buildCalendarMatrix,
  matrixCellHasContent,
  matrixRowHasContent,
  type MatrixExtraSpan,
  type MatrixRow,
} from "@/workspaces/owner/calendar/matrix";
import type { CalendarDayCell } from "@/workspaces/owner/calendar/month-grid";
import { singaporeTodayParts } from "@/workspaces/owner/calendar/month-grid";
import type {
  CalendarEntry,
  CalendarMatrixMode,
} from "@/workspaces/owner/calendar/types";
import { calendarFulfilmentBackgroundClass } from "@/workspaces/owner/calendar/calendar-fulfilment-presentation";
import { guestOrderStatusTextClass } from "@/workspaces/owner/orders/labels";
import { withOperationalMarker } from "@/engines/orders/operational-state";

type CalendarMatrixViewProps = {
  columns: CalendarDayCell[];
  entries: CalendarEntry[];
  extras?: CalendarExtraMarker[];
  mode: CalendarMatrixMode;
  year: number;
  month: number;
  /** When true, force horizontal position to Today (e.g. Today button). */
  focusToday: boolean;
  /** Open Calendar Quick View for this order (Matrix Customers only). */
  onOpenQuickView: (orderId: string) => void;
  /**
   * One-shot Order Workspace return horizontal restore.
   * Wins over automatic Today for this mount only.
   */
  orderReturnMatrixScrollLeft?: number | null;
  onOrderReturnMatrixApplied?: () => void;
};

const LABEL_COL_WIDTH = "11rem";
const DATE_COL_WIDTH = "6.5rem";

/**
 * In-memory scroll retention for Customers ↔ Totals remounts.
 * Cleared on full page reload so current-month entry re-applies Today positioning.
 * Must NOT use sessionStorage for initial position (that overrode Today).
 */
let matrixScrollMemory: {
  year: number;
  month: number;
  scrollLeft: number;
} | null = null;

/**
 * Scroll so Today's date column is the first visible date after the sticky
 * Cake / Size column. Uses viewport geometry — not offsetLeft − labelWidth.
 */
function scrollMatrixToInitialPosition(
  container: HTMLElement,
  year: number,
  month: number,
) {
  const today = singaporeTodayParts();
  const isCurrentMonth = year === today.year && month === today.month;

  if (!isCurrentMonth) {
    container.scrollLeft = 0;
    return;
  }

  const todayCol = container.querySelector<HTMLElement>(
    `thead [data-matrix-date="${today.ymd}"]`,
  );
  const labelCol = container.querySelector<HTMLElement>(
    "thead [data-matrix-label]",
  );
  if (!todayCol || !labelCol) {
    container.scrollLeft = 0;
    return;
  }

  // Align Today's left edge with the sticky label's right edge in the viewport.
  const labelRight = labelCol.getBoundingClientRect().right;
  const todayLeft = todayCol.getBoundingClientRect().left;
  const nextScrollLeft = container.scrollLeft + (todayLeft - labelRight);
  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  container.scrollLeft = Math.max(0, Math.min(nextScrollLeft, maxScroll));
}

function rememberScroll(year: number, month: number, scrollLeft: number) {
  matrixScrollMemory = { year, month, scrollLeft };
}

/** Seed Matrix horizontal place before first paint (Order Workspace return). */
export function seedMatrixScrollMemory(
  year: number,
  month: number,
  scrollLeft: number,
) {
  rememberScroll(year, month, scrollLeft);
}

/**
 * Clear live Matrix horizontal memory when leaving the Calendar route.
 * Must NOT survive Operations / sidebar / fresh Calendar entry.
 * Customers ↔ Totals within the same Calendar visit still share memory
 * because WholeCakeCalendar stays mounted.
 */
export function clearMatrixScrollMemory() {
  matrixScrollMemory = null;
}

/**
 * Horizontally focus Today inside the Matrix scroll container only.
 * Does not change document scroll. Used by Today when already on current month.
 */
export function focusMatrixTodayColumn() {
  const container = document.querySelector<HTMLElement>(
    "[data-matrix-scroll]",
  );
  if (!container) return;
  const today = singaporeTodayParts();
  scrollMatrixToInitialPosition(container, today.year, today.month);
  rememberScroll(today.year, today.month, container.scrollLeft);
}

function extraSpanTitle(span: MatrixExtraSpan): string {
  const { extra } = span;
  const range =
    span.startYmd === span.endYmd
      ? span.startYmd
      : `${span.startYmd} → ${span.endYmd}`;
  return `EXTRA ${extra.lifecycle} · ${range} · ${extra.id}`;
}

function ExtraSpanBadge({
  span,
  totalsMode,
}: {
  span: MatrixExtraSpan;
  totalsMode: boolean;
}) {
  const { extra } = span;
  return (
    <span
      className={[
        "border-line/70 text-ink flex w-full min-w-0 items-center gap-1 rounded border px-1 py-0.5 text-left leading-snug",
        extra.lifecycle === "proposed" ? "bg-mist" : "bg-status-info-soft/50",
      ].join(" ")}
      data-extra-id={extra.id}
      title={extraSpanTitle(span)}
    >
      <span className="text-[9px] font-semibold tracking-wide uppercase">
        EXTRA
      </span>
      <span className="text-[10px] font-medium">
        {totalsMode
          ? "×1"
          : extra.lifecycle === "proposed"
            ? "proposed"
            : "confirmed"}
      </span>
    </span>
  );
}

function renderExtraSpanRow(
  row: MatrixRow,
  columns: CalendarDayCell[],
  mode: CalendarMatrixMode,
) {
  if (row.extraSpans.length === 0) return null;

  return row.extraSpans.map((span) => {
    const cells: ReactNode[] = [];
    let colIndex = 0;
    while (colIndex < columns.length) {
      const col = columns[colIndex]!;
      if (span.startColumnIndex === colIndex) {
        cells.push(
          <td
            className={[
              "border-line/40 align-top border-b px-1.5 py-0.5",
              col.isToday ? "bg-status-info-soft/30" : "bg-white",
            ].join(" ")}
            colSpan={span.columnSpan}
            key={`${row.key}:extra:${span.extra.id}:${col.ymd}`}
            style={{
              minWidth: `calc(${DATE_COL_WIDTH} * ${span.columnSpan})`,
            }}
          >
            <ExtraSpanBadge span={span} totalsMode={mode === "totals"} />
          </td>,
        );
        colIndex += span.columnSpan;
        continue;
      }
      cells.push(
        <td
          className={[
            "border-line/40 border-b",
            col.isToday ? "bg-status-info-soft/30" : "bg-white",
          ].join(" ")}
          key={`${row.key}:extra-pad:${span.extra.id}:${col.ymd}`}
          style={{ minWidth: DATE_COL_WIDTH, width: DATE_COL_WIDTH }}
        />,
      );
      colIndex += 1;
    }

    return (
      <tr key={`${row.key}:extra-span:${span.extra.id}`}>
        <th
          className="border-line/50 bg-white text-skyline sticky left-0 z-10 border-r border-b px-2 py-0.5 text-left text-[10px] font-normal"
          scope="row"
          style={{
            minWidth: LABEL_COL_WIDTH,
            width: LABEL_COL_WIDTH,
          }}
        />
        {cells}
      </tr>
    );
  });
}

export function CalendarMatrixView({
  columns,
  entries,
  extras = [],
  mode,
  year,
  month,
  focusToday,
  onOpenQuickView,
  orderReturnMatrixScrollLeft = null,
  onOrderReturnMatrixApplied,
}: CalendarMatrixViewProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateYmids = useMemo(() => columns.map((col) => col.ymd), [columns]);
  const rows = useMemo(
    () => buildCalendarMatrix(entries, dateYmids, extras),
    [entries, dateYmids, extras],
  );

  // Persist manual scroll in memory (same-month remount only).
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onScroll = () => {
      rememberScroll(year, month, container.scrollLeft);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [year, month]);

  // Auto-position on month entry / Today focus / order return — never on entries.
  // mode is intentionally omitted so Customers ↔ Totals can restore memory.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    if (orderReturnMatrixScrollLeft != null) {
      const maxScroll = Math.max(
        0,
        container.scrollWidth - container.clientWidth,
      );
      container.scrollLeft = Math.max(
        0,
        Math.min(orderReturnMatrixScrollLeft, maxScroll),
      );
      rememberScroll(year, month, container.scrollLeft);
      onOrderReturnMatrixApplied?.();
      return;
    }

    const memory = matrixScrollMemory;
    const sameMonthMemory =
      memory != null && memory.year === year && memory.month === month;

    if (focusToday || !sameMonthMemory) {
      // First entry into this month, or explicit Today — Today/day-1 wins.
      scrollMatrixToInitialPosition(container, year, month);
      rememberScroll(year, month, container.scrollLeft);
    } else {
      // Same-month remount / seeded memory: keep the saved horizontal place.
      container.scrollLeft = memory.scrollLeft;
    }

    if (!focusToday) return;

    const params = new URLSearchParams(window.location.search);
    if (!params.has("focus")) return;
    params.delete("focus");
    const query = params.toString();
    router.replace(query ? `/owner/calendar?${query}` : "/owner/calendar", {
      scroll: false,
    });
  }, [
    year,
    month,
    focusToday,
    orderReturnMatrixScrollLeft,
    onOrderReturnMatrixApplied,
    router,
  ]);

  return (
    <div className="space-y-3">
      <div
        className="border-line/80 max-h-[min(70vh,44rem)] overflow-auto rounded-xl border bg-white"
        data-matrix-scroll
        ref={scrollRef}
      >
        <table className="border-separate border-spacing-0 text-left text-[11px] sm:text-xs">
          <thead>
            <tr>
              <th
                className="border-line/60 bg-mist text-ink sticky top-0 left-0 z-30 border-b border-r px-2 py-2 text-left text-[10px] font-semibold tracking-wide uppercase"
                data-matrix-label
                style={{ minWidth: LABEL_COL_WIDTH, width: LABEL_COL_WIDTH }}
              >
                Cake / Size
              </th>
              {columns.map((col) => (
                <th
                  className={[
                    "border-line/60 sticky top-0 z-20 border-b px-1.5 py-1.5 text-center font-semibold",
                    col.isToday
                      ? "bg-status-info-soft text-ink"
                      : "bg-mist text-skyline",
                  ].join(" ")}
                  data-matrix-date={col.ymd}
                  key={col.ymd}
                  style={{ minWidth: DATE_COL_WIDTH, width: DATE_COL_WIDTH }}
                >
                  <div className="text-sm leading-tight">{col.dayOfMonth}</div>
                  <div className="text-[10px] font-medium tracking-wide uppercase opacity-80">
                    {col.weekdayShort}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  className="text-skyline px-3 py-6"
                  colSpan={columns.length + 1}
                >
                  No whole-cake orders in this month yet.
                </td>
              </tr>
            ) : (
              rows.flatMap((row) => {
                if (!matrixRowHasContent(row)) return [];
                const customerRow = (
                  <tr key={row.key}>
                    <th
                      className="border-line/50 bg-white text-ink sticky left-0 z-10 border-r border-b px-2 py-1.5 text-left font-medium"
                      scope="row"
                      style={{
                        minWidth: LABEL_COL_WIDTH,
                        width: LABEL_COL_WIDTH,
                      }}
                      title={row.label}
                    >
                      <span className="block leading-snug">{row.cakeName}</span>
                      <span className="text-skyline block text-[10px] font-normal">
                        {row.sizeLabel}
                      </span>
                    </th>
                    {columns.map((col) => {
                      const cell = row.cellsByDate[col.ymd];
                      const hasContent = matrixCellHasContent(cell);
                      return (
                        <td
                          className={[
                            "border-line/40 align-top border-b px-1.5 py-1",
                            col.isToday ? "bg-status-info-soft/30" : "bg-white",
                          ].join(" ")}
                          key={`${row.key}:${col.ymd}`}
                          style={{
                            minWidth: DATE_COL_WIDTH,
                            width: DATE_COL_WIDTH,
                          }}
                        >
                          {!hasContent ? (
                            <span className="text-zinc-300">—</span>
                          ) : mode === "totals" ? (
                            <span className="text-ink font-medium">
                              ×{cell!.totalQuantity}
                            </span>
                          ) : (
                            <ul className="space-y-0.5">
                              {(cell?.customers ?? []).map((customer) => {
                                const nameWithMarker = withOperationalMarker(
                                  customer.displayName,
                                  {
                                    readyAt: customer.readyAt,
                                    pickedUpAt: customer.pickedUpAt,
                                    outForDeliveryAt: customer.outForDeliveryAt,
                                    deliveredAt: customer.deliveredAt,
                                    fulfilmentMethod: customer.fulfilmentMethod,
                                  },
                                );
                                const label =
                                  customer.quantity > 1
                                    ? `${nameWithMarker} ×${customer.quantity}`
                                    : nameWithMarker;
                                return (
                                  <li key={customer.orderId}>
                                    <button
                                      className={[
                                        guestOrderStatusTextClass(customer.status),
                                        customer.needsBakeryAttention
                                          ? "font-bold"
                                          : "",
                                        customer.hasEffectiveRm10
                                          ? "line-through"
                                          : "",
                                        calendarFulfilmentBackgroundClass(
                                          customer.fulfilmentMethod,
                                        ),
                                        "block w-full cursor-pointer text-left leading-snug hover:underline",
                                      ].join(" ")}
                                      onClick={() =>
                                        onOpenQuickView(customer.orderId)
                                      }
                                      title={label}
                                      type="button"
                                    >
                                      {label}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
                const extraRows = renderExtraSpanRow(row, columns, mode);
                return [customerRow, ...(extraRows ?? [])];
              })
            )}
          </tbody>
        </table>
      </div>

      <CalendarGuide />
    </div>
  );
}
