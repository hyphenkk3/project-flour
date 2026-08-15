"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/client";
import { formatLongBusinessDate } from "@/lib/dates";
import {
  getCollectionBoardOrderAction,
  listCollectionOrdersForTabAction,
} from "@/workspaces/collection/actions";
import { CollectionDateNav } from "@/workspaces/collection/CollectionDateNav";
import { CollectionOrderCard } from "@/workspaces/collection/CollectionOrderCard";
import { CollectionWorkspaceNav } from "@/workspaces/collection/CollectionWorkspaceNav";
import {
  COLLECTION_HISTORY_LOOKBACK_DAYS,
  countCollectionPickupOverdue,
  type CollectionBoardTab,
} from "@/workspaces/collection/eligibility";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";

const POLL_INTERVAL_MS = 30_000;

type CollectionLiveBoardProps = {
  boardDate: string;
  tab: CollectionBoardTab;
  initialOrders: CollectionBoardOrder[];
};

type OrderRowPayload = {
  id?: string;
  customer_id?: string | null;
  pickup_date?: string | null;
};

function boardTitle(tab: CollectionBoardTab): string {
  switch (tab) {
    case "completed":
      return "Picked Up / Delivered";
    case "history":
      return "Collection History";
    default:
      return "Ready for Collection";
  }
}

function boardSubtitle(
  tab: CollectionBoardTab,
  boardDate: string,
  count: number,
): string {
  const dateLabel = formatLongBusinessDate(boardDate);
  if (tab === "completed") {
    return `${dateLabel} · ${count} completed handoff${count === 1 ? "" : "s"}`;
  }
  if (tab === "history") {
    return `${dateLabel} · last ${COLLECTION_HISTORY_LOOKBACK_DAYS} days · ${count} handoff${count === 1 ? "" : "s"}`;
  }
  return `${dateLabel} · ${count} ready pickup${count === 1 ? "" : "s"}`;
}

function emptyCopy(tab: CollectionBoardTab): {
  title: string;
  description: string;
} {
  if (tab === "completed") {
    return {
      title: "No completed handoffs yet.",
      description:
        "Pickup orders marked Picked Up and Delivery orders marked Delivered for this date appear here.",
    };
  }
  if (tab === "history") {
    return {
      title: "No collection or delivery history yet.",
      description:
        "Browse completed Picked Up and Delivered handoffs for the selected date window.",
    };
  }
  return {
    title: "No orders ready for collection.",
    description:
      "Pickup guest preorders marked Ready appear here until Mark Collected.",
  };
}

export function CollectionLiveBoard({
  boardDate,
  tab,
  initialOrders,
}: CollectionLiveBoardProps) {
  const [orders, setOrders] = useState(initialOrders);

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders, boardDate, tab]);

  const reconcileList = useCallback(async () => {
    const next = await listCollectionOrdersForTabAction(tab, boardDate);
    setOrders(next);
  }, [boardDate, tab]);

  const handleIncoming = useCallback(
    async (id: string) => {
      const item = await getCollectionBoardOrderAction(id, boardDate, tab);
      if (!item) {
        setOrders((current) => current.filter((order) => order.id !== id));
        return;
      }
      setOrders((current) => {
        const without = current.filter((order) => order.id !== id);
        return [...without, item];
      });
      void reconcileList();
    },
    [boardDate, reconcileList, tab],
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`collection-board-${tab}-${boardDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          const row = (payload.new ?? payload.old) as OrderRowPayload | null;
          if (!row?.id) return;
          if (row.customer_id != null) return;
          if (
            tab !== "history" &&
            row.pickup_date &&
            row.pickup_date !== boardDate
          ) {
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
  }, [boardDate, handleIncoming, reconcileList, tab]);

  const now = new Date();
  const overdueCount =
    tab === "ready" ? countCollectionPickupOverdue(orders, now) : 0;
  const empty = emptyCopy(tab);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-7 pb-16 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-ink text-3xl tracking-tight sm:text-4xl">
            {boardTitle(tab)}
          </h1>
          <p className="text-skyline mt-2 text-sm sm:text-base">
            {boardSubtitle(tab, boardDate, orders.length)}
          </p>
          {overdueCount > 0 ? (
            <p className="text-status-warning mt-1 text-sm font-semibold tracking-wide">
              Pickup overdue · {overdueCount}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <CollectionWorkspaceNav active={tab} boardDate={boardDate} />
      </div>

      <div className="mt-4">
        <CollectionDateNav selectedDate={boardDate} tab={tab} />
      </div>

      {orders.length === 0 ? (
        <div className="mt-10">
          <EmptyState title={empty.title} description={empty.description} />
        </div>
      ) : (
        <div className="mt-6 space-y-2.5">
          {orders.map((order) => (
            <CollectionOrderCard
              key={order.id}
              boardDate={boardDate}
              now={now}
              order={order}
              tab={tab}
            />
          ))}
        </div>
      )}
    </main>
  );
}
