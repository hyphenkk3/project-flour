"use client";

import {
  DEFAULT_OPERATIONS_QUERY,
  OPERATIONS_PICKUP_FILTERS,
  OPERATIONS_SORT_OPTIONS,
  OPERATIONS_STATUS_FILTERS,
  isOperationsQueryDefault,
  operationsBoardSummary,
  operationsPickupFilterLabel,
  type OperationsBoardQuery,
  type OperationsPickupFilter,
  type OperationsSortOption,
  type OperationsStatusFilter,
} from "@/engines/operations/order-board";
import { formStyles } from "@/components/ui/form/FormControls";

export type OperationsTodayGroupCounts = {
  needsAttention: number;
  allClear: number;
  completed: number;
};

type OperationsBoardToolbarProps = {
  query: OperationsBoardQuery;
  matchCount: number;
  /** Non-Today: optional submitted count hint. */
  newCount?: number;
  todayGroupCounts?: OperationsTodayGroupCounts | null;
  onChange: (next: OperationsBoardQuery) => void;
};

const compactSelectClass =
  "border-fog text-ink min-h-10 rounded-lg border bg-white px-3 text-sm";

export function OperationsBoardToolbar({
  query,
  matchCount,
  newCount = 0,
  todayGroupCounts = null,
  onChange,
}: OperationsBoardToolbarProps) {
  const isDefault = isOperationsQueryDefault(query);
  const summary = operationsBoardSummary(query, matchCount);
  const showTodayGroups =
    query.pickupFilter === "today" && todayGroupCounts != null;
  const pickupLabel = operationsPickupFilterLabel(
    query.pickupFilter,
    query.customPickupDate,
  );

  function patch(partial: Partial<OperationsBoardQuery>) {
    onChange({ ...query, ...partial });
  }

  function setPickupFilter(pickupFilter: OperationsPickupFilter) {
    if (pickupFilter === "custom") {
      patch({
        pickupFilter,
        customPickupDate: query.customPickupDate,
      });
      return;
    }
    patch({ pickupFilter, customPickupDate: null });
  }

  return (
    <div className="space-y-3">
      {showTodayGroups ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="text-ink text-lg font-semibold tracking-tight sm:text-xl">
              Today · {matchCount}{" "}
              {matchCount === 1 ? "order" : "orders"}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <p className="text-status-warning text-sm font-bold tracking-wide uppercase">
                <span className="tabular-nums text-base sm:text-lg">
                  {todayGroupCounts.needsAttention}
                </span>{" "}
                Need Attention
              </p>
              <p className="text-status-success text-sm font-semibold tracking-wide uppercase">
                <span className="tabular-nums">
                  {todayGroupCounts.allClear}
                </span>{" "}
                All Clear
              </p>
              <p className="text-skyline/80 text-sm font-medium tracking-wide uppercase">
                <span className="tabular-nums">
                  {todayGroupCounts.completed}
                </span>{" "}
                Completed
              </p>
            </div>
          </div>
          {!isDefault ? (
            <button
              className="text-signal text-sm font-medium"
              onClick={() => onChange({ ...DEFAULT_OPERATIONS_QUERY })}
              type="button"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-ink text-lg font-semibold tracking-tight sm:text-xl">
              {summary}
            </p>
            <p className="text-skyline text-sm">Pickup · {pickupLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {newCount > 0 ? (
              <p className="text-status-warning text-xs font-medium">
                {newCount} awaiting review
              </p>
            ) : null}
            {!isDefault ? (
              <button
                className="text-signal text-sm font-medium"
                onClick={() => onChange({ ...DEFAULT_OPERATIONS_QUERY })}
                type="button"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="sr-only" htmlFor="operations-search">
          Search
        </label>
        <input
          className={`${formStyles.fieldClass} min-h-10 w-full`}
          id="operations-search"
          onChange={(event) => patch({ search: event.target.value })}
          placeholder="Search orders…"
          type="search"
          value={query.search}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="sr-only" htmlFor="operations-pickup">
            Pickup
          </label>
          <select
            aria-label="Pickup period"
            className={`${compactSelectClass} sm:w-40`}
            id="operations-pickup"
            onChange={(event) =>
              setPickupFilter(event.target.value as OperationsPickupFilter)
            }
            value={query.pickupFilter}
          >
            {OPERATIONS_PICKUP_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {query.pickupFilter === "custom" ? (
            <>
              <label className="sr-only" htmlFor="operations-pickup-date">
                Pickup date
              </label>
              <input
                className={`${compactSelectClass} sm:w-40`}
                id="operations-pickup-date"
                onChange={(event) =>
                  patch({
                    pickupFilter: "custom",
                    customPickupDate: event.target.value || null,
                  })
                }
                type="date"
                value={query.customPickupDate ?? ""}
              />
            </>
          ) : null}

          <label className="sr-only" htmlFor="operations-status">
            Status
          </label>
          <select
            aria-label="Status"
            className={`${compactSelectClass} sm:min-w-[11rem] sm:flex-none`}
            id="operations-status"
            onChange={(event) =>
              patch({
                statusFilter: event.target.value as OperationsStatusFilter,
              })
            }
            value={query.statusFilter}
          >
            {OPERATIONS_STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="operations-sort">
            Sort
          </label>
          <select
            aria-label="Sort"
            className={`${compactSelectClass} sm:min-w-[12rem] sm:flex-1 lg:max-w-xs`}
            id="operations-sort"
            onChange={(event) =>
              patch({ sort: event.target.value as OperationsSortOption })
            }
            value={query.sort}
          >
            {OPERATIONS_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
