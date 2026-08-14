"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/client";
import { formatLongBusinessDate } from "@/lib/dates";
import {
  getCollectionBoardOrderAction,
  listCollectionBoardOrdersAction,
} from "@/workspaces/collection/actions";
import { CollectionDateNav } from "@/workspaces/collection/CollectionDateNav";
import { CollectionOrderCard } from "@/workspaces/collection/CollectionOrderCard";
import { countCollectionPickupOverdue } from "@/workspaces/collection/eligibility";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";

const POLL_INTERVAL_MS = 30_000;

type CollectionLiveBoardProps = {
  boardDate: string;
  initialOrders: CollectionBoardOrder[];
};

type OrderRowPayload = {
  id?: string;
  customer_id?: string | null;
  pickup_date?: string | null;
};

export function CollectionLiveBoard({
  boardDate,
  initialOrders,
}: CollectionLiveBoardProps) {
  const [orders, setOrders] = useState(initialOrders);

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders, boardDate]);

  const reconcileList = useCallback(async () => {
    const next = await listCollectionBoardOrdersAction(boardDate);
    setOrders(next);
  }, [boardDate]);

  const handleIncoming = useCallback(
    async (id: string) => {
      const item = await getCollectionBoardOrderAction(id, boardDate);
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
      .channel(`collection-board-${boardDate}`)
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

  const now = new Date();
  const overdueCount = countCollectionPickupOverdue(orders, now);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-7 pb-16 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-ink text-3xl tracking-tight sm:text-4xl">
            Ready for Collection
          </h1>
          <p className="text-skyline mt-2 text-sm sm:text-base">
            {formatLongBusinessDate(boardDate)} · {orders.length} ready pickup
            {orders.length === 1 ? "" : "s"}
          </p>
          {overdueCount > 0 ? (
            <p className="text-status-warning mt-1 text-sm font-semibold tracking-wide">
              Pickup overdue · {overdueCount}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <CollectionDateNav selectedDate={boardDate} />
      </div>

      {orders.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No Ready pickup orders"
            description="Pickup guest preorders marked Ready appear here until Mark Collected. Delivery stays on Owner Operations."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-2.5">
          {orders.map((order) => (
            <CollectionOrderCard
              key={order.id}
              boardDate={boardDate}
              now={now}
              order={order}
            />
          ))}
        </div>
      )}
    </main>
  );
}
