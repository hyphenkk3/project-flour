"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FormInput } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatBusinessCalendarDate } from "@/lib/dates";
import { formatLibraryMoney } from "@/workspaces/library/labels";
import {
  filterRm10LibraryRows,
  rm10LibrarySourceLabel,
  rm10LibraryStatusLabel,
  summarizeRm10Library,
} from "@/engines/vouchers/physical-rm10";
import type {
  Rm10LibraryFilterStatus,
  Rm10LibraryRow,
} from "@/types/rm10-physical-voucher";

type Rm10PhysicalDirectoryProps = {
  rows: Rm10LibraryRow[];
};

function statusTone(status: Rm10LibraryRow["status"]) {
  if (status === "available") return "success" as const;
  if (status === "used") return "info" as const;
  return "warning" as const;
}

function dash(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  return text.length > 0 && text !== "—" ? text : "—";
}

function formatExpiry(value: string | null): string {
  return value ? formatBusinessCalendarDate(value) : "—";
}

function formatCalendar(value: string | null | undefined): string {
  if (!value || value === "—") return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? formatBusinessCalendarDate(value)
    : value;
}

function rowHref(row: Rm10LibraryRow): string {
  return `/library/vouchers/rm10/${encodeURIComponent(row.voucherNumberNormalized)}`;
}

function orderWorkspaceHref(orderId: string): string {
  return `/owner/orders/${orderId}`;
}

function OrderNumberLink({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: string;
}) {
  const label = dash(orderNumber);
  if (!orderId || label === "—") {
    return label;
  }
  return (
    <Link
      className="text-ink font-medium underline-offset-2 hover:underline"
      href={orderWorkspaceHref(orderId)}
    >
      {label}
    </Link>
  );
}

export function Rm10PhysicalDirectory({ rows }: Rm10PhysicalDirectoryProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Rm10LibraryFilterStatus>("all");

  const filtered = useMemo(
    () => filterRm10LibraryRows(rows, { query, status }),
    [rows, query, status],
  );
  const summary = useMemo(() => summarizeRm10Library(rows), [rows]);
  const filteredSummary = useMemo(
    () => summarizeRm10Library(filtered),
    [filtered],
  );

  const filters: Array<{ id: Rm10LibraryFilterStatus; label: string; count: number }> =
    [
      { id: "all", label: "All", count: summary.total },
      { id: "available", label: "Available", count: summary.available },
      { id: "used", label: "Used", count: summary.used },
      { id: "expired", label: "Expired", count: summary.expired },
    ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total vouchers" value={String(summary.total)} />
        <SummaryCard label="Available" value={String(summary.available)} />
        <SummaryCard label="Used" value={String(summary.used)} />
        <SummaryCard label="Expired" value={String(summary.expired)} />
        <SummaryCard
          label="Total RM10 value used"
          value={formatLibraryMoney(Math.abs(summary.usedValue))}
        />
      </div>

      <FormInput
        aria-label="Search RM10 Physical Cards"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search voucher number, order number, or customer"
        value={query}
      />

      <div
        aria-label="RM10 status filters"
        className="flex flex-wrap gap-2"
        role="group"
      >
        {filters.map((filter) => {
          const active = status === filter.id;
          return (
            <button
              className={
                active
                  ? "bg-ink text-mist inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium"
                  : "border-fog text-skyline hover:text-ink inline-flex min-h-10 items-center rounded-lg border bg-white px-3 text-sm font-medium"
              }
              key={filter.id}
              onClick={() => setStatus(filter.id)}
              type="button"
            >
              {filter.label} {filter.count}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          description={
            rows.length === 0
              ? "Add RM10 Physical Cards, or redeem one on an order to see historical usage."
              : "No RM10 Physical Cards match this search or filter."
          }
          title="No RM10 Physical Cards"
        />
      ) : (
        <>
          {query.trim() || status !== "all" ? (
            <p className="text-skyline text-sm">
              Showing {filteredSummary.total} voucher
              {filteredSummary.total === 1 ? "" : "s"}
              {filtered.length !== filteredSummary.total
                ? ` (${filtered.length} records)`
                : ""}
              .
            </p>
          ) : null}

          <ul className="divide-fog border-fog divide-y rounded-xl border bg-white md:hidden">
            {filtered.map((row) => (
              <li className="px-4 py-4" key={row.key}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      className="text-ink font-medium tracking-wide hover:underline"
                      href={rowHref(row)}
                    >
                      {row.voucherNumber}
                    </Link>
                    <p className="text-skyline mt-1 text-sm">
                      Original Expiry {formatExpiry(row.expiryDate)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge
                      label={rm10LibraryStatusLabel(row.status)}
                      tone={statusTone(row.status)}
                    />
                    {row.source === "historical" ? (
                      <StatusBadge
                        label={rm10LibrarySourceLabel(row.source)}
                        tone="neutral"
                      />
                    ) : null}
                    {row.usedAfterExpiry ? (
                      <StatusBadge
                        label="Used after expiry"
                        tone="warning"
                      />
                    ) : null}
                  </div>
                </div>
                <p className="text-skyline mt-3 text-sm">
                  {row.redemption ? (
                    <>
                      <OrderNumberLink
                        orderId={row.redemption.orderId}
                        orderNumber={row.redemption.orderNumber}
                      />
                      {` · ${dash(row.redemption.customerName)}`}
                    </>
                  ) : (
                    "No order"
                  )}
                </p>
                {row.duplicateRedemption ? (
                  <p className="text-status-danger mt-2 text-xs font-medium">
                    Duplicate redemption recorded for this voucher number.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="border-fog hidden overflow-x-auto rounded-xl border bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="text-skyline border-fog border-b text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Voucher No.</th>
                  <th className="px-4 py-3 font-medium">Original Expiry</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Order No.</th>
                  <th className="px-4 py-3 font-medium">Order Date</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Fulfilment Date</th>
                  <th className="px-4 py-3 font-medium">Fulfilment Method</th>
                </tr>
              </thead>
              <tbody className="divide-fog divide-y">
                {filtered.map((row) => (
                  <tr className="hover:bg-mist/60" key={row.key}>
                    <td className="px-4 py-3">
                      <Link
                        className="text-ink font-medium hover:underline"
                        href={rowHref(row)}
                      >
                        {row.voucherNumber}
                      </Link>
                      {row.source === "historical" ? (
                        <span className="text-skyline mt-1 block text-xs">
                          Historical
                        </span>
                      ) : null}
                      {row.duplicateRedemption ? (
                        <span className="text-status-danger mt-1 block text-xs font-medium">
                          Duplicate redemption
                        </span>
                      ) : null}
                    </td>
                    <td className="text-ink px-4 py-3">
                      {formatExpiry(row.expiryDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge
                          label={rm10LibraryStatusLabel(row.status)}
                          tone={statusTone(row.status)}
                        />
                        {row.usedAfterExpiry ? (
                          <StatusBadge
                            label="Used after expiry"
                            tone="warning"
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="text-ink px-4 py-3">
                      {row.redemption ? (
                        <OrderNumberLink
                          orderId={row.redemption.orderId}
                          orderNumber={row.redemption.orderNumber}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-ink px-4 py-3">
                      {row.redemption
                        ? formatCalendar(row.redemption.orderDate)
                        : "—"}
                    </td>
                    <td className="text-ink px-4 py-3">
                      {row.redemption ? dash(row.redemption.customerName) : "—"}
                    </td>
                    <td className="text-ink px-4 py-3">
                      {row.redemption
                        ? formatCalendar(row.redemption.fulfilmentDate)
                        : "—"}
                    </td>
                    <td className="text-ink px-4 py-3">
                      {row.redemption
                        ? dash(row.redemption.fulfilmentMethodLabel)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-fog rounded-xl border bg-white px-4 py-3">
      <p className="text-skyline text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="text-ink mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
