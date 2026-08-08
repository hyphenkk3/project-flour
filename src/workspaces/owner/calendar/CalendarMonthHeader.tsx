"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { focusMatrixTodayColumn } from "@/workspaces/owner/calendar/CalendarMatrixView";
import {
  formatMonthYearLabel,
  shiftMonth,
  singaporeTodayParts,
} from "@/workspaces/owner/calendar/month-grid";
import type {
  CalendarMatrixMode,
  CalendarViewMode,
} from "@/workspaces/owner/calendar/types";

type CalendarMonthHeaderProps = {
  year: number;
  month: number;
  view: CalendarViewMode;
  matrixMode: CalendarMatrixMode;
};

function calendarHref(
  year: number,
  month: number,
  view: CalendarViewMode,
  matrixMode: CalendarMatrixMode,
  options?: { focusToday?: boolean },
): string {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
    view,
  });
  if (view === "matrix") {
    params.set("matrix", matrixMode);
  }
  if (options?.focusToday) {
    params.set("focus", "today");
  }
  return `/owner/calendar?${params.toString()}`;
}

export function CalendarMonthHeader({
  year,
  month,
  view,
  matrixMode,
}: CalendarMonthHeaderProps) {
  const router = useRouter();
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const today = singaporeTodayParts();
  const isCurrentMonth = year === today.year && month === today.month;

  function handleToday() {
    // Already on current month: only re-focus Matrix horizontally — no router
    // navigation (that would scroll the document to the top).
    if (isCurrentMonth) {
      if (view === "matrix") {
        focusMatrixTodayColumn();
      }
      return;
    }

    router.push(
      calendarHref(today.year, today.month, view, matrixMode, {
        focusToday: view === "matrix",
      }),
      { scroll: false },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link
            aria-label="Previous month"
            className="border-line text-ink hover:bg-mist inline-flex h-10 w-10 items-center justify-center rounded-lg border text-lg"
            href={calendarHref(prev.year, prev.month, view, matrixMode)}
            scroll={false}
          >
            ‹
          </Link>
          <h2 className="font-display text-ink min-w-[10rem] text-center text-2xl tracking-tight sm:min-w-[12rem] sm:text-3xl">
            {formatMonthYearLabel(year, month)}
          </h2>
          <Link
            aria-label="Next month"
            className="border-line text-ink hover:bg-mist inline-flex h-10 w-10 items-center justify-center rounded-lg border text-lg"
            href={calendarHref(next.year, next.month, view, matrixMode)}
            scroll={false}
          >
            ›
          </Link>
        </div>
        <button
          className={[
            "inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium",
            isCurrentMonth
              ? "border-line text-skyline bg-mist"
              : "border-line text-ink hover:bg-mist",
          ].join(" ")}
          onClick={handleToday}
          type="button"
        >
          Today
        </button>
      </div>

      <div
        aria-label="Calendar view"
        className="flex flex-wrap items-center gap-2 text-sm"
        role="group"
      >
        <span className="text-skyline text-xs font-medium tracking-wide uppercase">
          View
        </span>
        <div className="border-line inline-flex rounded-lg border p-0.5">
          {(
            [
              ["matrix", "Matrix"],
              ["cakes", "Cakes"],
              ["orders", "Orders"],
            ] as const
          ).map(([value, label]) => (
            <Link
              aria-current={view === value ? "page" : undefined}
              className={[
                "inline-flex min-h-9 items-center justify-center rounded-md px-3 text-sm font-medium",
                view === value
                  ? "bg-ink text-mist"
                  : "text-ink hover:bg-mist",
              ].join(" ")}
              href={calendarHref(year, month, value, matrixMode)}
              key={value}
              scroll={false}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
