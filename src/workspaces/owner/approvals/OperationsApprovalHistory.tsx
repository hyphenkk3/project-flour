"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formStyles } from "@/components/ui/form/FormControls";
import {
  OPERATIONS_APPROVAL_STATUS_LABELS,
  OPERATIONS_APPROVAL_HISTORY_PATH,
  approvalHistoryRowFromRecord,
  filterOperationsApprovalHistory,
  isApprovalHistoryStatusFilter,
  isApprovalHistoryTypeFilter,
  type ApprovalHistoryFilters,
} from "@/engines/operations/approval-ux";
import {
  OPERATIONS_APPROVAL_STATUSES,
  OPERATIONS_APPROVAL_TYPES,
  approvalTypeLabel,
  type OperationsApprovalRecord,
} from "@/engines/operations/approvals";
import { formatDateTime } from "@/lib/dates";
import type { StatusTone } from "@/lib/design-tokens";
import { ApprovalChangeLines } from "@/workspaces/owner/approvals/ApprovalChangeLines";
import {
  APPROVAL_HISTORY_PATH,
  captureApprovalHistoryReturnPosition,
  clearTakenApprovalHistoryReturnPosition,
  discardApprovalHistoryReturnPosition,
  takeApprovalHistoryReturnPosition,
} from "@/workspaces/owner/approvals/approval-history-return-position";

type OperationsApprovalHistoryProps = {
  approvals: OperationsApprovalRecord[];
  /** True only for Order Workspace ← Approval History (rp=1). */
  restorePosition?: boolean;
};

const compactSelectClass =
  "border-fog text-ink min-h-10 rounded-lg border bg-white px-3 text-sm";

function statusTone(status: OperationsApprovalRecord["status"]): StatusTone {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

export function OperationsApprovalHistory({
  approvals,
  restorePosition = false,
}: OperationsApprovalHistoryProps) {
  const [filters, setFilters] = useState<ApprovalHistoryFilters>({
    status: "all",
    requestType: "all",
    search: "",
  });

  const rows = useMemo(
    () =>
      filterOperationsApprovalHistory(approvals, filters).map((row) =>
        approvalHistoryRowFromRecord(row, OPERATIONS_APPROVAL_HISTORY_PATH),
      ),
    [approvals, filters],
  );

  // Contextual Order → History restore only when rp=1.
  // Ordinary History entry discards any pending capture.
  useLayoutEffect(() => {
    if (!restorePosition) {
      discardApprovalHistoryReturnPosition();
      return;
    }

    const position = takeApprovalHistoryReturnPosition(
      APPROVAL_HISTORY_PATH,
      true,
    );
    if (position) {
      const y = position.scrollY;
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

    const params = new URLSearchParams(window.location.search);
    if (params.has("rp")) {
      params.delete("rp");
      const query = params.toString();
      const next = query
        ? `${APPROVAL_HISTORY_PATH}?${query}`
        : APPROVAL_HISTORY_PATH;
      window.history.replaceState(window.history.state, "", next);
    }

    const clearId = window.setTimeout(() => {
      clearTakenApprovalHistoryReturnPosition();
    }, 0);
    return () => window.clearTimeout(clearId);
  }, [restorePosition]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="sr-only" htmlFor="approval-history-search">
          Search approvals
        </label>
        <input
          className={`${formStyles.fieldClass} min-h-10 w-full`}
          id="approval-history-search"
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
          placeholder="Search order or customer…"
          type="search"
          value={filters.search}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <label className="sr-only" htmlFor="approval-history-status">
            Status
          </label>
          <select
            aria-label="Status"
            className={`${compactSelectClass} sm:w-40`}
            id="approval-history-status"
            onChange={(event) => {
              const value = event.target.value;
              if (!isApprovalHistoryStatusFilter(value)) return;
              setFilters((current) => ({ ...current, status: value }));
            }}
            value={filters.status}
          >
            <option value="all">All statuses</option>
            {OPERATIONS_APPROVAL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {OPERATIONS_APPROVAL_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="approval-history-type">
            Approval type
          </label>
          <select
            aria-label="Approval type"
            className={`${compactSelectClass} sm:min-w-[12rem]`}
            id="approval-history-type"
            onChange={(event) => {
              const value = event.target.value;
              if (!isApprovalHistoryTypeFilter(value)) return;
              setFilters((current) => ({ ...current, requestType: value }));
            }}
            value={filters.requestType}
          >
            <option value="all">All types</option>
            {OPERATIONS_APPROVAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {approvalTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-skyline text-sm">No matching approval records.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                className="border-fog hover:border-skyline block rounded-xl border bg-white p-4 transition-colors"
                href={row.href}
                onClick={() =>
                  captureApprovalHistoryReturnPosition(APPROVAL_HISTORY_PATH)
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-ink truncate text-base font-semibold">
                      {row.customerName}
                    </p>
                    <p className="text-skyline text-sm">
                      {row.orderNumber || "Order"} · {row.typeLabel}
                    </p>
                    {row.changeLines.length > 0 ? (
                      <ApprovalChangeLines
                        className="text-sm"
                        lines={row.changeLines}
                      />
                    ) : null}
                    <p className="text-ink truncate text-sm">{row.reason}</p>
                    <p className="text-skyline text-sm">
                      Requested by {row.requestedByLabel} ·{" "}
                      {formatDateTime(row.requestedAt)}
                    </p>
                    {row.reviewedAt ? (
                      <p className="text-skyline text-sm">
                        {row.statusLabel} by {row.reviewedByLabel ?? "Staff"} ·{" "}
                        {formatDateTime(row.reviewedAt)}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge
                    label={row.statusLabel}
                    tone={statusTone(row.status)}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
