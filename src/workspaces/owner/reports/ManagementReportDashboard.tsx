"use client";

import { useMemo, useState } from "react";
import {
  percentChange,
  type buildMonthlyReport,
} from "@/engines/reports/monthly";

type Monthly = ReturnType<typeof buildMonthlyReport>;
type Report = {
  current: Monthly;
  previous: Monthly;
  bookings: {
    count: number;
    value: number;
    sources: Array<{ source: string; count: number }>;
  };
  payments: {
    collected: number;
    refunds: number;
    methods: Array<{ method: string; value: number }>;
  };
  asOf: string;
};
const currency = (value: number) =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(
    value,
  );
const integer = (value: number) => new Intl.NumberFormat("en-MY").format(value);
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

export function ManagementReportDashboard({ report }: { report: Report }) {
  const { current, previous } = report;
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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Reports</h1>
            <p className="mt-1 text-sm text-slate-600">
              Fulfilled sales use scheduled fulfilment date. Bookings and cash
              collection are separate.
            </p>
          </div>
          <form
            action="/owner/management/reports"
            className="flex items-end gap-2"
          >
            <label className="text-sm font-medium" htmlFor="report-month">
              Month
              <input
                id="report-month"
                name="month"
                type="month"
                defaultValue={current.month}
                className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3"
              />
            </label>
            <button className="min-h-11 rounded-lg bg-slate-900 px-4 text-white">
              View
            </button>
          </form>
        </div>
      </header>
      <section aria-labelledby="financial" className="space-y-3">
        <h2 id="financial" className="text-xl font-semibold">
          Financial overview
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            title="Fulfilled net sales"
            value={currency(current.netSales)}
            detail={change(current.netSales, previous.netSales)}
          />
          <Metric
            title="Fulfilled gross sales"
            value={currency(current.gross)}
            detail="Before discounts; includes net fees and other adjustments"
          />
          <Metric
            title="Gross product sales"
            value={currency(current.grossProducts)}
            detail="Cakes and paid add-ons"
          />
          <Metric
            title="Discounts"
            value={currency(current.discounts)}
            detail={change(current.discounts, previous.discounts)}
          />
          <Metric
            title="Net product sales"
            value={currency(current.netProducts)}
          />
          <Metric title="Delivery charges" value={currency(current.delivery)} />
          <Metric
            title="Processing fees"
            value={currency(current.processing)}
          />
          <Metric
            title="Other adjustments · reconcile"
            value={currency(current.other)}
            detail="Unclassified commercial adjustments; review before treating as fees or discounts."
          />
          <Metric
            title="Total fulfilled orders"
            value={integer(current.fulfilled)}
            detail={change(current.fulfilled, previous.fulfilled)}
          />
          <Metric
            title="Average order value"
            value={currency(current.aov)}
            detail={change(current.aov, previous.aov)}
          />
          <Metric
            title="Scheduled, not fulfilled"
            value={currency(current.unfulfilledValue)}
            detail={`${current.unfulfilled} orders; excluded from sales`}
          />
          <Metric
            title="Cancelled orders"
            value={integer(current.cancelled)}
            detail={`${currency(current.cancelledValue)} current order value; excluded from sales`}
          />
          <Metric
            title="Outstanding now"
            value={currency(current.outstandingNow)}
            detail={`As of ${new Date(report.asOf).toLocaleString("en-MY")}; not historical month-end balance`}
          />
          <Metric
            title="Payments collected"
            value={currency(report.payments.collected)}
            detail="By payment date, including corrected allocations"
          />
          <Metric
            title="Recorded refunds"
            value={currency(report.payments.refunds)}
            detail="By recorded refund date"
          />
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
              <span>{label(row.method)}</span>
              <strong>{currency(row.value)}</strong>
            </p>
          ))}
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
