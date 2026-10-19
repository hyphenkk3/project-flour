"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  nextMonth,
  formatReportAsOf,
  percentChange,
  previousMonth,
  reportMonth,
} from "@/engines/reports/monthly";
import type { ManagementReportData } from "@/engines/reports/export-data";
import { paymentMethodDisplayLabel } from "@/engines/orders/payment-details";
import { ReportExportControls } from "@/workspaces/owner/reports/ReportExportControls";

const currency = (value: number) =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(
    value,
  );
const integer = (value: number) => new Intl.NumberFormat("en-MY").format(value);
const refundDate = (value: string) =>
  new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
const change = (current: number, previous: number) => {
  const value = percentChange(current, previous);
  return value === null
    ? "No comparable base"
    : `${value > 0 ? "+" : ""}${value}% vs prior month`;
};

function Metric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold break-words text-slate-900 tabular-nums">
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-600">{detail}</p>}
    </div>
  );
}

export function ManagementReportDashboard({
  report,
}: {
  report: ManagementReportData;
}) {
  const router = useRouter();
  const { current, previous } = report;
  const latestMonth = reportMonth(new Date());
  const canAdvanceMonth = current.month < latestMonth;
  const availableMonths = useMemo(() => {
    const months: string[] = [];
    for (
      let month = latestMonth;
      month >= "2020-01";
      month = previousMonth(month)
    ) {
      months.push(month);
    }
    return months;
  }, [latestMonth]);
  const monthLabel = new Intl.DateTimeFormat("en-MY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${current.month}-01T00:00:00Z`));
  const selectMonth = (month: string) => {
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      month < "2020-01" ||
      month > latestMonth
    ) {
      return;
    }
    router.push(`/owner/management/reports?month=${month}`, { scroll: false });
  };
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"quantity" | "revenue" | "name">("quantity");
  const cakes = useMemo(
    () =>
      current.cakes
        .filter((row) =>
          `${row.cakeName} ${row.sizeLabel}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.cakeName.localeCompare(b.cakeName) ||
              a.sizeLabel.localeCompare(b.sizeLabel)
            : sort === "revenue"
              ? b.revenue - a.revenue
              : b.quantity - a.quantity,
        ),
    [current.cakes, search, sort],
  );
  const lastCake = new Map(
    previous.cakes.map((row) => [
      JSON.stringify([row.cakeName, row.sizeLabel]),
      row.quantity,
    ]),
  );
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-1 pb-20 sm:px-4">
      <header className="space-y-3">
        <p className="text-xs font-semibold tracking-[.2em] text-teal-700 uppercase">
          Owner Workspace · Management
        </p>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Reports</h1>
            <p className="mt-1 text-sm text-slate-600">
              Fulfilled sales use scheduled fulfilment date. Bookings and cash
              collection are separate.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
            <nav
              aria-label="Report month navigation"
              className="flex min-h-12 w-full max-w-sm min-w-0 items-center justify-between gap-1 rounded-xl border border-slate-200 bg-white px-1 py-1 sm:w-auto sm:justify-start sm:gap-2 sm:px-2"
            >
              <Link
                aria-label={`Previous month: ${new Intl.DateTimeFormat(
                  "en-MY",
                  {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  },
                ).format(
                  new Date(`${previousMonth(current.month)}-01T00:00:00Z`),
                )}`}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-xl text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:outline-none"
                href={`/owner/management/reports?month=${previousMonth(current.month)}`}
                scroll={false}
              >
                <span aria-hidden="true">‹</span>
              </Link>
              <div className="flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-1 text-center hover:bg-slate-50 sm:min-w-[10.5rem]">
                <select
                  aria-label="Choose report month and year"
                  className="h-11 w-full min-w-0 cursor-pointer rounded-lg border-0 bg-transparent px-2 text-center text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:outline-none"
                  onChange={(event) => selectMonth(event.currentTarget.value)}
                  value={current.month}
                >
                  {availableMonths.map((month) => (
                    <option key={month} value={month}>
                      {new Intl.DateTimeFormat("en-MY", {
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(`${month}-01T00:00:00Z`))}
                    </option>
                  ))}
                </select>
              </div>
              {canAdvanceMonth ? (
                <Link
                  aria-label={`Next month: ${new Intl.DateTimeFormat("en-MY", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(
                    new Date(`${nextMonth(current.month)}-01T00:00:00Z`),
                  )}`}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-xl text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:outline-none"
                  href={`/owner/management/reports?month=${nextMonth(current.month)}`}
                  scroll={false}
                >
                  <span aria-hidden="true">›</span>
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  aria-label="Next month unavailable"
                  className="inline-flex min-h-11 min-w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-lg text-xl text-slate-300"
                >
                  <span aria-hidden="true">›</span>
                </span>
              )}
            </nav>
            <ReportExportControls month={current.month} />
          </div>
        </div>
      </header>
      <section aria-labelledby="financial" className="space-y-3">
        <h2 id="financial" className="text-lg font-semibold text-slate-900">
          Financial overview
        </h2>
        <div className="space-y-3">
          <section
            aria-labelledby="primary-financial-summary"
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
          >
            <h3 id="primary-financial-summary" className="sr-only">
              Primary financial summary
            </h3>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.95fr)] lg:gap-6">
              <div className="border-b border-slate-200 pb-4 lg:border-r lg:border-b-0 lg:pr-6 lg:pb-0">
                <p className="text-xs font-semibold tracking-wide text-teal-800 uppercase">
                  Fulfilled net sales
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight break-words text-slate-950 tabular-nums sm:text-4xl">
                  {currency(current.netSales)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {change(current.netSales, previous.netSales)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 sm:gap-x-6">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Gross sales</p>
                  <p className="mt-1 text-lg font-semibold break-words text-slate-900 tabular-nums">
                    {currency(current.gross)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Discounts</p>
                  <p className="mt-1 text-lg font-semibold break-words text-slate-900 tabular-nums">
                    {currency(current.discounts)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {change(current.discounts, previous.discounts)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Net product sales</p>
                  <p className="mt-1 text-lg font-semibold break-words text-slate-900 tabular-nums">
                    {currency(current.netProducts)}
                  </p>
                </div>
                <div className="min-w-0 border-t border-slate-100 pt-3 sm:col-span-1">
                  <p className="text-xs text-slate-500">Fulfilled orders</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">
                    {integer(current.fulfilled)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {change(current.fulfilled, previous.fulfilled)}
                  </p>
                </div>
                <div className="min-w-0 border-t border-slate-100 pt-3 sm:col-span-2">
                  <p className="text-xs text-slate-500">Average order value</p>
                  <p className="mt-1 text-lg font-semibold break-words text-slate-900 tabular-nums">
                    {currency(current.aov)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {change(current.aov, previous.aov)}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  Outstanding for Selected Month
                </p>
                <p className="mt-1 text-sm font-semibold break-words text-slate-900 tabular-nums">
                  {currency(current.outstandingNow)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  As of {formatReportAsOf(report.asOf)}; not historical
                  month-end
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Payments collected</p>
                <p className="mt-1 text-sm font-semibold break-words text-slate-900 tabular-nums">
                  {currency(report.payments.collected)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  By payment date, including corrected allocations
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Recorded refunds</p>
                <p className="mt-1 text-sm font-semibold break-words text-slate-900 tabular-nums">
                  {currency(report.payments.refunds)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  By recorded refund date
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Net receipts</p>
                <p className="mt-1 text-sm font-semibold break-words text-slate-900 tabular-nums">
                  {currency(report.payments.netReceipts)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Collections minus refunds by transaction date
                </p>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="revenue-breakdown"
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3
                  id="revenue-breakdown"
                  className="text-sm font-semibold text-slate-900"
                >
                  Revenue breakdown
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Product sales, fees, and reconciliation components
                </p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Gross product sales", currency(current.grossProducts)],
                ["Discounts", currency(current.discounts)],
                ["Net product sales", currency(current.netProducts)],
                ["Delivery charges", currency(current.delivery)],
                ["Processing fees", currency(current.processing)],
                ["Other adjustments · reconcile", currency(current.other)],
              ].map(([title, value]) => (
                <div
                  className="flex min-w-0 items-baseline justify-between gap-3 border-b border-slate-100 py-2.5 text-sm"
                  key={title}
                >
                  <dt className="text-slate-600">{title}</dt>
                  <dd className="shrink-0 font-medium text-slate-900 tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
              <div className="flex min-w-0 items-baseline justify-between gap-3 border-t border-slate-300 py-3 text-sm font-semibold sm:col-span-2 lg:col-span-3">
                <dt className="text-slate-900">Fulfilled net sales</dt>
                <dd className="shrink-0 text-slate-950 tabular-nums">
                  {currency(current.netSales)}
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-slate-500">
              Gross sales before discounts includes net fees and other
              adjustments. Unclassified adjustments remain visible above for
              reconciliation.
            </p>
          </section>

          <section
            aria-labelledby="order-summary"
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
          >
            <h3
              id="order-summary"
              className="text-sm font-semibold text-slate-900"
            >
              Order status summary
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Fulfilled orders</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                  {integer(current.fulfilled)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  Scheduled, not fulfilled
                </dt>
                <dd className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                  {integer(current.unfulfilled)}
                </dd>
                <p className="mt-0.5 text-xs break-words text-slate-600 tabular-nums">
                  {currency(current.unfulfilledValue)}; excluded from sales
                </p>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Cancelled orders</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                  {integer(current.cancelled)}
                </dd>
                <p className="mt-0.5 text-xs break-words text-slate-600 tabular-nums">
                  {currency(current.cancelledValue)} current order value;
                  excluded from sales
                </p>
              </div>
            </dl>
          </section>
        </div>
        {current.reconciliation !== 0 && (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            Settlement reconciliation difference:{" "}
            {currency(current.reconciliation)}. Review before relying on net
            sales.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Month over month</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              name: "Cake units",
              now: current.cakeQuantity,
              before: previous.cakeQuantity,
            },
            ...current.methods.map((row) => ({
              name: `${label(row.method)} sales`,
              now: row.netSales,
              before:
                previous.methods.find((item) => item.method === row.method)
                  ?.netSales ?? 0,
            })),
          ].map((row) => (
            <Metric
              key={row.name}
              title={row.name}
              value={
                row.name === "Cake units" ? integer(row.now) : currency(row.now)
              }
              detail={change(row.now, row.before)}
            />
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Fulfilment performance</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {current.methods.map((row) => (
            <div
              key={row.method}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <h3 className="text-lg font-semibold">{label(row.method)}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <dt>Scheduled</dt>
                <dd className="text-right tabular-nums">{row.scheduled}</dd>
                <dt>Fulfilled</dt>
                <dd className="text-right">{row.fulfilled}</dd>
                <dt>Unfulfilled</dt>
                <dd className="text-right">{row.unfulfilled}</dd>
                <dt>Cancelled</dt>
                <dd className="text-right">{row.cancelled}</dd>
                <dt>Gross products</dt>
                <dd className="text-right">{currency(row.gross)}</dd>
                <dt>Discounts</dt>
                <dd className="text-right">{currency(row.discounts)}</dd>
                <dt>Net sales</dt>
                <dd className="text-right font-semibold">
                  {currency(row.netSales)}
                </dd>
                <dt>Share of sales</dt>
                <dd className="text-right">
                  {current.netSales
                    ? `${Math.round((row.netSales / current.netSales) * 1000) / 10}%`
                    : "—"}
                </dd>
                <dt>Average order</dt>
                <dd className="text-right">{currency(row.aov)}</dd>
                <dt>Cake units</dt>
                <dd className="text-right">{row.cakeQuantity}</dd>
                {row.method === "delivery" && (
                  <>
                    <dt>Delivery charges</dt>
                    <dd className="text-right">
                      {currency(row.deliveryCharges)}
                    </dd>
                    <dt>Quoted fee waived</dt>
                    <dd className="text-right">
                      {currency(row.deliveryConcessions)}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Cake sales</h2>
        <p className="text-sm text-slate-600">
          Historical item names and sizes; gross cake revenue before order-level
          discounts.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric
            title="Cake units sold"
            value={integer(current.cakeQuantity)}
            detail={change(current.cakeQuantity, previous.cakeQuantity)}
          />
          <Metric
            title="Cake and size combinations"
            value={integer(current.cakes.length)}
          />
        </div>
        <h3 className="font-semibold">Top 10</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {current.cakes.slice(0, 10).map((row, index) => (
            <p
              className="rounded-xl border bg-white p-3 text-sm"
              key={`${row.cakeName}|${row.sizeLabel}`}
            >
              <strong>
                {index + 1}. {row.cakeName} · {row.sizeLabel}
              </strong>
              <span className="block">
                {row.quantity} units · {currency(row.revenue)} gross
              </span>
            </p>
          ))}
        </div>
        <h3 className="font-semibold">By cake size</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {current.sizes.map((row) => (
            <p
              className="rounded-xl border bg-white p-3 text-sm"
              key={row.sizeLabel}
            >
              <strong>{row.sizeLabel}</strong>
              <span className="block">
                {row.quantity} units · {currency(row.revenue)} gross
              </span>
            </p>
          ))}
        </div>
        <h3 className="font-semibold">All cakes</h3>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            Search cakes
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mt-1 block min-h-11 rounded-lg border px-3"
            />
          </label>
          <label className="text-sm">
            Sort by
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="mt-1 block min-h-11 rounded-lg border px-3"
            >
              <option value="quantity">Quantity</option>
              <option value="revenue">Gross revenue</option>
              <option value="name">Cake name</option>
            </select>
          </label>
        </div>
        <div className="space-y-2">
          {cakes.length ? (
            cakes.map((row) => {
              const prior =
                lastCake.get(JSON.stringify([row.cakeName, row.sizeLabel])) ??
                0;
              return (
                <div
                  key={JSON.stringify([row.cakeName, row.sizeLabel])}
                  className="grid grid-cols-2 gap-2 rounded-xl border bg-white p-3 text-sm sm:grid-cols-5"
                >
                  <strong className="col-span-2 sm:col-span-1">
                    {row.cakeName} · {row.sizeLabel}
                  </strong>
                  <span>{row.quantity} units</span>
                  <span>{currency(row.revenue)}</span>
                  <span>
                    {current.cakeQuantity
                      ? `${Math.round((row.quantity / current.cakeQuantity) * 1000) / 10}% of units`
                      : "—"}
                  </span>
                  <span>
                    Previous: {prior} · {change(row.quantity, prior)}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border bg-white p-4 text-sm">
              No cake sales match this month and search.
            </p>
          )}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4">
          <h2 className="text-xl font-semibold">Discounts</h2>
          <p className="mt-2 text-sm">
            {current.discountedOrders} discounted orders ·{" "}
            {current.discountedOrders
              ? currency(current.discounts / current.discountedOrders)
              : currency(0)}{" "}
            average ·{" "}
            {current.gross
              ? `${Math.round((current.discounts / current.gross) * 1000) / 10}%`
              : "—"}{" "}
            of gross products
          </p>
          {current.discountReasons.map((row) => (
            <p
              className="mt-2 flex justify-between gap-2 text-sm"
              key={row.reason}
            >
              <span>
                {row.reason || "Unspecified"} ({row.count})
              </span>
              <strong>{currency(row.value)}</strong>
            </p>
          ))}
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <h2 className="text-xl font-semibold">Order sources</h2>
          {current.sources.map((row) => (
            <p
              className="mt-2 flex flex-wrap justify-between gap-2 text-sm"
              key={row.source}
            >
              <span>
                {label(row.source)} · {row.orders} orders · {row.fulfilled}{" "}
                fulfilled
              </span>
              <strong>
                {currency(row.netSales)} ·{" "}
                {current.netSales
                  ? `${Math.round((row.netSales / current.netSales) * 1000) / 10}%`
                  : "—"}
              </strong>
            </p>
          ))}
          <p className="mt-4 border-t pt-3 text-sm">
            Fresh Pick (separate classification): {current.freshPicks.orders}{" "}
            fulfilled orders · {currency(current.freshPicks.netSales)}. Included
            above, not added twice.
          </p>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4">
          <h2 className="text-xl font-semibold">Bookings</h2>
          <p className="mt-2 text-sm">
            {report.bookings.count} orders created ·{" "}
            {currency(report.bookings.value)} current booking value. Not
            recognised sales.
          </p>
          {report.bookings.sources.map((row) => (
            <p className="mt-2 text-sm" key={row.source}>
              {label(row.source)}: {row.count}
            </p>
          ))}
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <h2 className="text-xl font-semibold">Cash collection</h2>
          <p className="mt-2 text-sm">
            {currency(report.payments.collected)} collected ·{" "}
            {currency(report.payments.refunds)} recorded refunds. By transaction
            date, including advance payments.
          </p>
          {report.payments.methods.map((row) => (
            <p className="mt-2 flex justify-between text-sm" key={row.method}>
              <span>{paymentMethodDisplayLabel(row.method)}</span>
              <strong>{currency(row.value)}</strong>
            </p>
          ))}
        </div>
      </section>
      <section
        aria-labelledby="refund-breakdown"
        className="max-w-full min-w-0 space-y-3"
      >
        <div>
          <h2
            id="refund-breakdown"
            className="text-xl font-semibold text-slate-900"
          >
            Refund Breakdown
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Recorded refunds by refund date for {monthLabel}. Total:{" "}
            {currency(report.payments.refunds)}.
          </p>
        </div>
        <div
          aria-label="Refund transactions for the selected month"
          className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white"
          role="region"
          tabIndex={0}
        >
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                {[
                  "Order Number",
                  "Refund Date",
                  "Refund Amount",
                  "Refund Method",
                  "Refund Source / Type",
                  "Recorded By",
                  "Refund Reason",
                ].map((heading) => (
                  <th
                    className="px-3 py-3 whitespace-nowrap"
                    key={heading}
                    scope="col"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.refundBreakdown.length ? (
                report.refundBreakdown.map((row, index) => (
                  <tr key={`${row.orderNumber}-${row.refundDate}-${index}`}>
                    <td className="px-3 py-3 font-medium whitespace-nowrap text-slate-900">
                      {row.orderNumber}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {refundDate(row.refundDate)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                      {currency(row.amount)}
                    </td>
                    <td className="px-3 py-3">{row.method}</td>
                    <td className="px-3 py-3">{row.source}</td>
                    <td className="px-3 py-3">{row.recordedBy}</td>
                    <td className="max-w-lg min-w-64 px-3 py-3 break-words whitespace-normal">
                      {row.reason}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={7}>
                    No recorded refunds in this reporting month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-slate-500">
        Live read-only report. Legacy drive-through orders use the existing
        pickup handoff and appear under Pickup. Past-month figures can change
        after amendments, date changes, cancellations, corrections, or refunds.
        Month-end outstanding is unavailable without historical snapshots.
        Figures are for internal management reporting.
      </p>
    </main>
  );
}
