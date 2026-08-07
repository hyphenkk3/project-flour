"use client";

import {
  DEFAULT_OPERATIONS_QUERY,
  OPERATIONS_PICKUP_FILTERS,
  OPERATIONS_SORT_OPTIONS,
  OPERATIONS_STATUS_FILTERS,
  isOperationsQueryDefault,
  operationsBoardSummary,
  type OperationsBoardQuery,
  type OperationsPickupFilter,
  type OperationsSortOption,
  type OperationsStatusFilter,
} from "@/engines/operations/order-board";
import { formStyles } from "@/components/ui/form/FormControls";

type OperationsBoardToolbarProps = {
  query: OperationsBoardQuery;
  matchCount: number;
  newCount: number;
  onChange: (next: OperationsBoardQuery) => void;
};

export function OperationsBoardToolbar({
  query,
  matchCount,
  newCount,
  onChange,
}: OperationsBoardToolbarProps) {
  const isDefault = isOperationsQueryDefault(query);
  const summary = operationsBoardSummary(query, matchCount);

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
    <div className="border-fog space-y-3 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-ink text-sm font-semibold tracking-wide">{summary}</p>
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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <label className={formStyles.labelClass} htmlFor="operations-search">
          <span>Search</span>
          <input
            className={formStyles.fieldClass}
            id="operations-search"
            onChange={(event) => patch({ search: event.target.value })}
            placeholder="Order number, name, or phone"
            type="search"
            value={query.search}
          />
        </label>

        <label className={formStyles.labelClass} htmlFor="operations-sort">
          <span>Sort</span>
          <select
            className={formStyles.selectClass}
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
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-ink text-sm font-medium">Pickup</p>
        <div className="flex flex-wrap gap-2">
          {OPERATIONS_PICKUP_FILTERS.map((option) => {
            const active = query.pickupFilter === option.value;
            return (
              <button
                className={
                  active
                    ? "border-signal bg-signal/10 text-ink rounded-lg border px-3 py-2 text-sm font-medium"
                    : "border-fog text-skyline hover:border-skyline hover:text-ink rounded-lg border bg-white px-3 py-2 text-sm font-medium"
                }
                key={option.value}
                onClick={() => setPickupFilter(option.value)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {query.pickupFilter === "custom" ? (
          <label className={`${formStyles.labelClass} max-w-xs`} htmlFor="operations-pickup-date">
            <span>Pickup date</span>
            <input
              className={formStyles.fieldClass}
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
          </label>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-ink text-sm font-medium">Status</p>
        <div className="flex flex-wrap gap-2">
          {OPERATIONS_STATUS_FILTERS.map((option) => {
            const active = query.statusFilter === option.value;
            return (
              <button
                className={
                  active
                    ? "border-signal bg-signal/10 text-ink rounded-lg border px-3 py-2 text-sm font-medium"
                    : "border-fog text-skyline hover:border-skyline hover:text-ink rounded-lg border bg-white px-3 py-2 text-sm font-medium"
                }
                key={option.value}
                onClick={() =>
                  patch({
                    statusFilter: option.value as OperationsStatusFilter,
                  })
                }
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
