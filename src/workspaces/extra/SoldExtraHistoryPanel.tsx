"use client";

import { useEffect, useRef, useState } from "react";
import { formatLongBusinessDate } from "@/lib/dates";
import { listSoldExtraHistoryAction } from "@/workspaces/extra/actions";
import type { SoldExtraHistoryPage } from "@/workspaces/extra/queries";
import type { ExtraStockUnit } from "@/workspaces/extra/types";
import { soldExtraCompletedAt } from "@/engines/extra/sold-stock-lifecycle";

const inputClass =
  "border-fog text-ink focus:border-signal focus:ring-signal/20 min-h-11 w-full rounded-xl border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none";

function completedAt(unit: ExtraStockUnit): string | null {
  if (!unit.assignedOrderId || !unit.assignedOrderStatus) return null;
  return soldExtraCompletedAt(
    {
      id: unit.assignedOrderId,
      status: unit.assignedOrderStatus,
      orderSource: unit.assignedOrderSource,
      customerId: unit.assignedOrderCustomerId,
      extraStockId: unit.id,
      fulfilmentMethod: unit.assignedOrderFulfilmentMethod,
      pickedUpAt: unit.assignedOrderPickedUpAt,
      deliveredAt: unit.assignedOrderDeliveredAt,
      outForDeliveryAt: unit.assignedOrderOutForDeliveryAt,
      readyAt: unit.assignedOrderReadyAt,
      createdAt: unit.assignedOrderCreatedAt,
    },
    unit.soldAt,
  );
}

function StockHistoryCard({ unit }: { unit: ExtraStockUnit }) {
  const completed = completedAt(unit);
  return (
    <li className="border-fog rounded-2xl border bg-white p-4">
      <p className="text-ink text-base font-semibold">
        {unit.cakeName}{" "}
        <span className="text-skyline font-normal">{unit.sizeLabel}</span>
      </p>
      <p className="text-skyline mt-1 text-sm">
        {unit.assignedOrderNumber
          ? `Order ${unit.assignedOrderNumber}`
          : "Order details unavailable"}
        {unit.assignedGuestName ? ` · ${unit.assignedGuestName}` : ""}
      </p>
      <p className="text-skyline mt-1 text-sm">
        {unit.assignedOrderFulfilmentMethod ?? "Fulfilment not recorded"}
        {completed
          ? ` · Completed ${formatLongBusinessDate(completed.slice(0, 10))}`
          : unit.soldAt
            ? ` · Stock marked sold ${formatLongBusinessDate(unit.soldAt.slice(0, 10))}`
            : ""}
      </p>
    </li>
  );
}

export function SoldExtraHistoryPanel() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [soldFrom, setSoldFrom] = useState("");
  const [soldThrough, setSoldThrough] = useState("");
  const [items, setItems] = useState<ExtraStockUnit[]>([]);
  const [reviewItems, setReviewItems] = useState<ExtraStockUnit[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const requestId = ++sequence.current;
    setLoading(true);
    setError(null);
    setItems([]);
    setReviewItems([]);
    setNextOffset(0);
    setHasMore(false);
    void listSoldExtraHistoryAction({
      search: debouncedSearch,
      soldFrom,
      soldThrough,
      offset: 0,
    })
      .then((page: SoldExtraHistoryPage) => {
        if (requestId !== sequence.current) return;
        setItems(page.items);
        setReviewItems(page.reviewItems);
        setNextOffset(page.nextOffset);
        setHasMore(page.hasMore);
      })
      .catch((cause: unknown) => {
        if (requestId !== sequence.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load Sold History.",
        );
      })
      .finally(() => {
        if (requestId === sequence.current) setLoading(false);
      });
    return () => {
      sequence.current += 1;
    };
  }, [open, debouncedSearch, soldFrom, soldThrough]);

  async function loadMore() {
    if (loading || !hasMore) return;
    const requestId = ++sequence.current;
    setLoading(true);
    setError(null);
    try {
      const page = await listSoldExtraHistoryAction({
        search: debouncedSearch,
        soldFrom,
        soldThrough,
        offset: nextOffset,
      });
      if (requestId !== sequence.current) return;
      setItems((current) => [...current, ...page.items]);
      setReviewItems((current) => [...current, ...page.reviewItems]);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (cause) {
      if (requestId === sequence.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load more Sold History.",
        );
      }
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  }

  return (
    <section className="border-fog bg-mist/40 mt-8 rounded-2xl border p-4 sm:p-5">
      <button
        aria-expanded={open}
        className="text-ink flex min-h-11 w-full items-center justify-between gap-3 text-left font-semibold"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>Sold History</span>
        <span className="text-skyline text-sm font-medium">
          {open ? "Hide history" : "View history"}
        </span>
      </button>
      {open ? (
        <div className="mt-4">
          <p className="text-skyline mb-4 text-sm">
            Completed sales and collection records. Search by order number,
            customer or cake.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-skyline text-xs font-medium sm:col-span-2 lg:col-span-2">
              Search history
              <input
                className={`${inputClass} mt-1`}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Order number, customer or cake"
                type="search"
                value={search}
              />
            </label>
            <label className="text-skyline text-xs font-medium">
              Sold from
              <input
                className={`${inputClass} mt-1`}
                onChange={(event) => setSoldFrom(event.target.value)}
                type="date"
                value={soldFrom}
              />
            </label>
            <label className="text-skyline text-xs font-medium">
              Sold through
              <input
                className={`${inputClass} mt-1`}
                onChange={(event) => setSoldThrough(event.target.value)}
                type="date"
                value={soldThrough}
              />
            </label>
          </div>

          {error ? (
            <p className="text-status-danger mt-4 text-sm" role="alert">
              {error}
            </p>
          ) : null}
          {loading && items.length === 0 && reviewItems.length === 0 ? (
            <p className="text-skyline mt-4 text-sm" role="status">
              Loading sold history…
            </p>
          ) : null}
          {!loading &&
          !error &&
          items.length === 0 &&
          reviewItems.length === 0 ? (
            <p className="text-skyline mt-4 text-sm">No matching sold items.</p>
          ) : null}

          {items.length ? (
            <>
              <h3 className="text-ink mt-5 text-sm font-semibold">
                Completed / collected
              </h3>
              <ul className="mt-2 space-y-3">
                {items.map((unit) => (
                  <StockHistoryCard key={unit.id} unit={unit} />
                ))}
              </ul>
            </>
          ) : null}
          {reviewItems.length ? (
            <>
              <h3 className="text-status-warning mt-5 text-sm font-semibold">
                Needs review
              </h3>
              <p className="text-skyline mt-1 text-xs">
                These sold records do not have enough lifecycle information to
                classify as completed. They remain preserved here for staff
                review.
              </p>
              <ul className="mt-2 space-y-3">
                {reviewItems.map((unit) => (
                  <StockHistoryCard key={unit.id} unit={unit} />
                ))}
              </ul>
            </>
          ) : null}
          {hasMore ? (
            <button
              className="border-fog text-ink mt-4 min-h-11 rounded-xl border bg-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              disabled={loading}
              onClick={loadMore}
              type="button"
            >
              {loading ? "Loading…" : "Load more history"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
