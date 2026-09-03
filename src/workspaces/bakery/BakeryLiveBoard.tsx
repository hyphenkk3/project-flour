"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/client";
import { formatLongBusinessDate } from "@/lib/dates";
import {
  getBakeryBoardOrderAction,
  listBakeryBoardOrdersAction,
} from "@/workspaces/bakery/actions";
import { BakeryDateNav } from "@/workspaces/bakery/BakeryDateNav";
import { BakeryOrderCard } from "@/workspaces/bakery/BakeryOrderCard";
import {
  bakeryProductionPresentation,
  BAKERY_QUEUE_FILTERS,
  matchesBakeryQueueFilter,
  type BakeryQueueFilter,
} from "@/workspaces/bakery/eligibility";
import type { BakeryBoardOrder } from "@/workspaces/bakery/types";

const POLL_INTERVAL_MS = 30_000;

type BakeryLiveBoardProps = {
  boardDate: string;
  initialOrders: BakeryBoardOrder[];
};

type OrderRowPayload = {
  id?: string;
  customer_id?: string | null;
  pickup_date?: string | null;
};

export function BakeryLiveBoard({
  boardDate,
  initialOrders,
}: BakeryLiveBoardProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [queueFilter, setQueueFilter] = useState<BakeryQueueFilter>("all");

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders, boardDate]);

  const reconcileList = useCallback(async () => {
    const next = await listBakeryBoardOrdersAction(boardDate);
    setOrders(next);
  }, [boardDate]);

  const handleIncoming = useCallback(
    async (id: string) => {
      const item = await getBakeryBoardOrderAction(id, boardDate);
      if (!item) {
        setOrders((current) => current.filter((order) => order.id !== id));
        return;
      }
      setOrders((current) => {
        const without = current.filter((order) => order.id !== id);
        return [...without, item].sort((a, b) => {
          const timeCmp = a.pickupTime.localeCompare(b.pickupTime, "en");
          if (timeCmp !== 0) return timeCmp;
          return a.orderNumber.localeCompare(b.orderNumber, "en");
        });
      });
    },
    [boardDate],
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`bakery-board-${boardDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          const row = (payload.new ?? payload.old) as OrderRowPayload | null;
          if (!row?.id) return;
          if (row.customer_id != null) return;
          if (row.pickup_date && row.pickup_date !== boardDate) {
            setOrders((current) =>
              current.filter((order) => order.id !== row.id),
            );
            return;
          }
          void handleIncoming(row.id);
        },
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      void reconcileList();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [boardDate, handleIncoming, reconcileList]);

  const visibleOrders = orders.filter((order) =>
    matchesBakeryQueueFilter(order, queueFilter),
  );

  const notStarted = visibleOrders.filter(
    (order) =>
      bakeryProductionPresentation({
        productionStartedAt: order.productionStartedAt,
        readyAt: order.readyAt,
      }) === "not_started",
  );
  const inProduction = visibleOrders.filter(
    (order) =>
      bakeryProductionPresentation({
        productionStartedAt: order.productionStartedAt,
        readyAt: order.readyAt,
      }) === "in_production",
  );
  const ready = visibleOrders.filter(
    (order) =>
      bakeryProductionPresentation({
        productionStartedAt: order.productionStartedAt,
        readyAt: order.readyAt,
      }) === "ready",
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-7 pb-16 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-ink text-3xl tracking-tight sm:text-4xl">
            What we make
          </h1>
          <p className="text-skyline mt-2 text-sm sm:text-base">
            {formatLongBusinessDate(boardDate)} · {visibleOrders.length} order
            {visibleOrders.length === 1 ? "" : "s"}
            {queueFilter !== "all" ? ` of ${orders.length}` : ""}
          </p>
        </div>
        <label className="sr-only" htmlFor="bakery-queue-filter">
          Queue filter
        </label>
        <select
          className="border-fog text-ink min-h-10 rounded-lg border bg-white px-3 text-sm sm:w-56"
          id="bakery-queue-filter"
          onChange={(event) =>
            setQueueFilter(event.target.value as BakeryQueueFilter)
          }
          value={queueFilter}
        >
          {BAKERY_QUEUE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6">
        <BakeryDateNav selectedDate={boardDate} />
      </div>

      {orders.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No Bakery orders for this date"
            description="Active guest preorders for this fulfilment date appear here — including Submitted and Awaiting Payment — until Pickup is Picked Up or Delivery is Out for Delivery."
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <section>
            <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
              Not started
              <span className="text-skyline ml-2 font-normal normal-case">
                {notStarted.length}
              </span>
            </h2>
            <div className="mt-4 space-y-3">
              {notStarted.map((order) => (
                <BakeryOrderCard
                  key={order.id}
                  boardDate={boardDate}
                  order={order}
                />
              ))}
              {notStarted.length === 0 ? (
                <p className="text-skyline text-sm">None right now.</p>
              ) : null}
            </div>
          </section>
          <section>
            <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
              Preparing
              <span className="text-skyline ml-2 font-normal normal-case">
                {inProduction.length}
              </span>
            </h2>
            <div className="mt-4 space-y-3">
              {inProduction.map((order) => (
                <BakeryOrderCard
                  key={order.id}
                  boardDate={boardDate}
                  order={order}
                />
              ))}
              {inProduction.length === 0 ? (
                <p className="text-skyline text-sm">None right now.</p>
              ) : null}
            </div>
          </section>
          <section>
            <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
              Ready for Collection
              <span className="text-skyline ml-2 font-normal normal-case">
                {ready.length}
              </span>
            </h2>
            <div className="mt-4 space-y-3">
              {ready.map((order) => (
                <BakeryOrderCard
                  key={order.id}
                  boardDate={boardDate}
                  order={order}
                />
              ))}
              {ready.length === 0 ? (
                <p className="text-skyline text-sm">None right now.</p>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
