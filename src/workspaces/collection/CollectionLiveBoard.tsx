"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import { createClient } from "@/lib/supabase/client";
import { formatLongBusinessDate } from "@/lib/dates";
import {
  getCollectionBoardOrderAction,
  listCollectionOrdersForTabAction,
} from "@/workspaces/collection/actions";
import type { CollectionDineInVenueFilter } from "@/workspaces/collection/board-tab";
import { CollectionDateNav } from "@/workspaces/collection/CollectionDateNav";
import { CollectionOrderCard } from "@/workspaces/collection/CollectionOrderCard";
import { CollectionWorkspaceNav } from "@/workspaces/collection/CollectionWorkspaceNav";
import { collectionDateNavHref } from "@/workspaces/collection/date";
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
  venueFilter?: CollectionDineInVenueFilter;
};

type OrderRowPayload = {
  id?: string;
  customer_id?: string | null;
  pickup_date?: string | null;
};

function boardTitle(tab: CollectionBoardTab): string {
  switch (tab) {
    case "completed":
      return "Completed";
    case "history":
      return "Pickup History";
    case "dine_in":
      return "Dine-In";
    case "pickup":
      return "Pickup";
    case "delivery":
      return "Delivery";
    default:
      return "Ready";
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
  if (tab === "dine_in") {
    return `${dateLabel} · ${count} dine-in reservation${count === 1 ? "" : "s"}`;
  }
  if (tab === "pickup") {
    return `${dateLabel} · ${count} ready pickup${count === 1 ? "" : "s"}`;
  }
  if (tab === "delivery") {
    return `${dateLabel} · ${count} ready delivery${count === 1 ? "" : "s"}`;
  }
  return `${dateLabel} · ${count} ready order${count === 1 ? "" : "s"}`;
}

function emptyCopy(tab: CollectionBoardTab): {
  title: string;
  description: string;
} {
  if (tab === "completed") {
    return {
      title: "No completed handoffs yet.",
      description:
        "Pickup orders marked Picked Up, Delivery orders marked Delivered, and completed dine-in visits for this date appear here.",
    };
  }
  if (tab === "history") {
    return {
      title: "No pickup or delivery history yet.",
      description:
        "Browse completed Picked Up, Delivered, and dine-in handoffs for the selected date window.",
    };
  }
  if (tab === "dine_in") {
    return {
      title: "No dine-in reservations for this date.",
      description:
        "Whole Cake dine-in reservations appear here. Pickup and Delivery have their own Ready queues.",
    };
  }
  if (tab === "pickup") {
    return {
      title: "No orders ready for pickup.",
      description:
        "Pickup guest preorders marked Ready appear here until Mark Collected.",
    };
  }
  if (tab === "delivery") {
    return {
      title: "No orders ready for delivery.",
      description:
        "Delivery guest preorders marked Ready appear here until Delivered.",
    };
  }
  return {
    title: "No orders ready yet.",
    description:
      "Orders marked Ready appear here until their handoff is completed.",
  };
}

function venueChipClass(active: boolean): string {
  return active
    ? "bg-ink text-mist inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-medium"
    : "border-fog text-ink hover:border-skyline inline-flex min-h-10 items-center justify-center rounded-xl border bg-white px-3 text-sm font-medium transition";
}

export function CollectionLiveBoard({
  boardDate,
  tab,
  initialOrders,
  venueFilter = "all",
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
    tab === "ready" || tab === "pickup"
      ? countCollectionPickupOverdue(
          orders.filter((order) => order.fulfilmentMethod === "pickup"),
          now,
        )
      : 0;

  const visibleOrders = useMemo(() => {
    if (tab !== "dine_in" || venueFilter === "all") return orders;
    return orders.filter((order) => order.dineIn?.venue === venueFilter);
  }, [orders, tab, venueFilter]);

  const hyphenOrders = visibleOrders.filter(
    (order) => order.dineIn?.venue === "hyphen",
  );
  const whitebirdOrders = visibleOrders.filter(
    (order) => order.dineIn?.venue === "whitebird",
  );
  const ungrouped = visibleOrders.filter((order) => !order.dineIn?.venue);

  const empty = emptyCopy(tab);

  function renderCards(list: CollectionBoardOrder[]) {
    return list.map((order) => (
      <CollectionOrderCard
        key={order.id}
        boardDate={boardDate}
        now={now}
        order={order}
        tab={tab}
      />
    ));
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-7 pb-16 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-ink text-3xl tracking-tight sm:text-4xl">
            {boardTitle(tab)}
          </h1>
          <p className="text-skyline mt-2 text-sm sm:text-base">
            {boardSubtitle(tab, boardDate, visibleOrders.length)}
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
        <CollectionDateNav
          selectedDate={boardDate}
          tab={tab}
          venueFilter={venueFilter}
        />
      </div>

      {tab === "dine_in" ? (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Venue filter">
          <a
            className={venueChipClass(venueFilter === "all")}
            href={collectionDateNavHref(boardDate, "dine_in", "all")}
          >
            All
          </a>
          <a
            className={venueChipClass(venueFilter === "hyphen")}
            href={collectionDateNavHref(boardDate, "dine_in", "hyphen")}
          >
            Hyphen
          </a>
          <a
            className={venueChipClass(venueFilter === "whitebird")}
            href={collectionDateNavHref(boardDate, "dine_in", "whitebird")}
          >
            Whitebird
          </a>
        </div>
      ) : null}

      {visibleOrders.length === 0 ? (
        <div className="mt-10">
          <EmptyState title={empty.title} description={empty.description} />
        </div>
      ) : tab === "dine_in" ? (
        <div className="mt-6 space-y-6">
          {hyphenOrders.length > 0 ? (
            <section>
              <h2 className="text-ink text-sm font-semibold tracking-wide">
                {dineInVenueLabel("hyphen")}
              </h2>
              <div className="mt-2 space-y-2.5">{renderCards(hyphenOrders)}</div>
            </section>
          ) : null}
          {whitebirdOrders.length > 0 ? (
            <section>
              <h2 className="text-ink text-sm font-semibold tracking-wide">
                {dineInVenueLabel("whitebird")}
              </h2>
              <div className="mt-2 space-y-2.5">
                {renderCards(whitebirdOrders)}
              </div>
            </section>
          ) : null}
          {ungrouped.length > 0 ? (
            <div className="space-y-2.5">{renderCards(ungrouped)}</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 space-y-2.5">{renderCards(visibleOrders)}</div>
      )}
    </main>
  );
}
