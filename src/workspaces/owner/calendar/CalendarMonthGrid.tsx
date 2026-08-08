"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CalendarDayCell } from "@/workspaces/owner/calendar/month-grid";
import { WEEKDAY_HEADERS } from "@/workspaces/owner/calendar/month-grid";
import {
  CalendarGuide,
  calendarCustomerSignalClass,
} from "@/workspaces/owner/calendar/CalendarGuide";
import type {
  CalendarCakeItem,
  CalendarEntry,
  CalendarViewMode,
} from "@/workspaces/owner/calendar/types";
import { captureCalendarReturnPosition } from "@/workspaces/owner/calendar/calendar-return-position";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";

const ORDERS_COLLAPSED_VISIBLE = 4;
const CAKES_COLLAPSED_VISIBLE = 5;

type CalendarMonthGridProps = {
  cells: CalendarDayCell[];
  entries: CalendarEntry[];
  view: Exclude<CalendarViewMode, "matrix">;
  /** Calendar URL for Order Workspace return navigation. */
  returnTo: string;
};

type CakeLine = {
  key: string;
  entry: CalendarEntry;
  item: CalendarCakeItem;
};

export function CalendarMonthGrid({
  cells,
  entries,
  view,
  returnTo,
}: CalendarMonthGridProps) {
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.pickupDate) ?? [];
      list.push(entry);
      map.set(entry.pickupDate, list);
    }
    return map;
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="border-line/80 overflow-x-auto rounded-xl border bg-white">
        <div className={view === "cakes" ? "min-w-[52rem]" : "min-w-[44rem]"}>
          <div className="border-line/60 text-skyline grid grid-cols-7 border-b text-center text-[11px] font-semibold tracking-wide uppercase">
            {WEEKDAY_HEADERS.map((label) => (
              <div className="px-1 py-2" key={label}>
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell) => (
              <CalendarDayCellView
                cell={cell}
                entries={byDate.get(cell.ymd) ?? []}
                key={cell.ymd}
                returnTo={returnTo}
                view={view}
              />
            ))}
          </div>
        </div>
      </div>
      <CalendarGuide />
    </div>
  );
}

function cakeLinesForEntries(entries: CalendarEntry[]): CakeLine[] {
  // Preserve pickup-time order of entries; expand items in snapshot order.
  const lines: CakeLine[] = [];
  for (const entry of entries) {
    for (const item of entry.items) {
      lines.push({
        key: `${entry.id}:${item.id}`,
        entry,
        item,
      });
    }
  }
  return lines;
}

function formatCakeLabel(item: CalendarCakeItem): string {
  return `${item.cakeName} ${item.sizeLabel} ×${item.quantity}`;
}

function CalendarDayCellView({
  cell,
  entries,
  view,
  returnTo,
}: {
  cell: CalendarDayCell;
  entries: CalendarEntry[];
  view: CalendarViewMode;
  returnTo: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const cakeLines = useMemo(() => cakeLinesForEntries(entries), [entries]);

  const collapsedLimit =
    view === "cakes" ? CAKES_COLLAPSED_VISIBLE : ORDERS_COLLAPSED_VISIBLE;
  const totalCount = view === "cakes" ? cakeLines.length : entries.length;
  const hiddenCount = Math.max(0, totalCount - collapsedLimit);

  const visibleOrders = expanded
    ? entries
    : entries.slice(0, ORDERS_COLLAPSED_VISIBLE);
  const visibleCakes = expanded
    ? cakeLines
    : cakeLines.slice(0, CAKES_COLLAPSED_VISIBLE);

  return (
    <div
      className={[
        "border-line/50 min-h-[5.5rem] border-t border-r p-1.5 sm:min-h-[7rem] sm:p-2",
        cell.inMonth ? "bg-white" : "bg-zinc-50/80",
        cell.isToday
          ? "ring-status-info/30 bg-status-info-soft/40 ring-1 ring-inset"
          : "",
      ].join(" ")}
    >
      <div
        className={[
          "mb-1 flex items-baseline gap-1 text-[11px] sm:text-xs",
          cell.inMonth ? "text-ink" : "text-zinc-400",
          cell.isToday ? "font-semibold" : "",
        ].join(" ")}
      >
        <span>{cell.dayOfMonth}</span>
        <span className="text-[10px] font-normal tracking-wide uppercase opacity-70 sm:hidden">
          {cell.weekdayShort}
        </span>
      </div>

      {view === "orders" ? (
        <ul className="space-y-0.5">
          {visibleOrders.map((entry) => (
            <li key={entry.id}>
              <Link
                className={[
                  calendarCustomerSignalClass(entry),
                  "block w-full truncate text-left text-[11px] leading-snug hover:underline sm:text-xs",
                  cell.inMonth ? "" : "opacity-50",
                ].join(" ")}
                href={ownerOrderWorkspaceHref(entry.id, returnTo)}
                onClick={() => captureCalendarReturnPosition(returnTo)}
                title={entry.displayName}
              >
                {entry.displayName}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1">
          {visibleCakes.map((line) => {
            const cakeLabel = formatCakeLabel(line.item);
            const title = `${cakeLabel} — ${line.entry.displayName}`;
            return (
              <li key={line.key}>
                <Link
                  className={[
                    "block w-full text-left text-[10px] leading-snug hover:underline sm:text-[11px]",
                    cell.inMonth ? "" : "opacity-50",
                  ].join(" ")}
                  href={ownerOrderWorkspaceHref(line.entry.id, returnTo)}
                  onClick={() => captureCalendarReturnPosition(returnTo)}
                  title={title}
                >
                  <span className="text-ink">{cakeLabel}</span>
                  <span className="text-zinc-500"> — </span>
                  <span className={calendarCustomerSignalClass(line.entry)}>
                    {line.entry.displayName}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenCount > 0 && !expanded ? (
        <button
          className="text-skyline hover:text-ink mt-1 text-[10px] font-medium underline-offset-2 hover:underline sm:text-[11px]"
          onClick={() => setExpanded(true)}
          type="button"
        >
          +{hiddenCount} more
        </button>
      ) : null}
      {expanded && hiddenCount > 0 ? (
        <button
          className="text-skyline hover:text-ink mt-1 text-[10px] font-medium underline-offset-2 hover:underline sm:text-[11px]"
          onClick={() => setExpanded(false)}
          type="button"
        >
          Show less
        </button>
      ) : null}
    </div>
  );
}
