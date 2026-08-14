"use client";

import Link from "next/link";
import {
  approvalTypeLabel,
  formatApprovalAge,
  type OperationsApprovalRecord,
} from "@/engines/operations/approvals";
import { formatDdMmYyyy } from "@/lib/dates";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { withOwnerReturnTo } from "@/workspaces/owner/navigation/return-to";

type OperationsApprovalsSectionProps = {
  approvals: OperationsApprovalRecord[];
  /** Operations board path to restore after opening a request. */
  returnTo?: string | null;
};

export function OperationsApprovalsSection({
  approvals,
  returnTo = null,
}: OperationsApprovalsSectionProps) {
  const pending = approvals.filter((row) => row.status === "pending");

  return (
    <section className="space-y-2.5">
      <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
        Approvals
        {pending.length > 0 ? (
          <span className="ml-2 font-semibold normal-case tabular-nums">
            · {pending.length}
          </span>
        ) : null}
      </h2>
      {pending.length === 0 ? (
        <p className="text-skyline text-sm">No pending approvals.</p>
      ) : (
        <ul className="grid gap-3">
          {pending.map((row) => (
            <li key={row.id}>
              <Link
                className="border-fog hover:border-skyline block rounded-xl border bg-white p-4 transition-colors"
                href={withOwnerReturnTo(
                  `/owner/orders/${row.orderId}?approval=${row.id}`,
                  returnTo,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-ink truncate text-base font-semibold">
                      {row.customerName}
                    </p>
                    <p className="text-skyline text-sm">
                      {row.orderNumber || "Order"} ·{" "}
                      {approvalTypeLabel(row.requestType)}
                    </p>
                    <p className="text-ink truncate text-sm">{row.reason}</p>
                    <p className="text-skyline text-sm">
                      {formatDdMmYyyy(row.pickupDate)} ·{" "}
                      {formatPickupTime(row.pickupTime)} · requested by{" "}
                      {row.requestedByName ?? "Staff"} ·{" "}
                      {formatApprovalAge(row.createdAt)}
                    </p>
                  </div>
                  <span className="text-status-warning shrink-0 text-xs font-semibold tracking-wide uppercase">
                    Pending
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
