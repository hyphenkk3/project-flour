"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import { createClient } from "@/lib/supabase/client";
import { formatLongBusinessDate } from "@/lib/dates";
import { listCollectionOrdersForTabAction } from "@/workspaces/collection/actions";
import type { CollectionDineInVenueFilter } from "@/workspaces/collection/board-tab";
import { CollectionDateNav } from "@/workspaces/collection/CollectionDateNav";
import { CollectionOrderCard } from "@/workspaces/collection/CollectionOrderCard";
import { CollectionWorkspaceNav } from "@/workspaces/collection/CollectionWorkspaceNav";
import { collectionDateNavHref } from "@/workspaces/collection/date";
import {
  COLLECTION_HISTORY_LOOKBACK_DAYS,
  countCollectionPickupOverdue,
  matchesCollectionQueueSearch,
  type CollectionBoardTab,
} from "@/workspaces/collection/eligibility";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";
import { useCoalescedReconciliation } from "@/lib/useCoalescedReconciliation";

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

type OrderDeletePayload = { id?: string };

function boardTitle(tab: CollectionBoardTab): string {
  switch (tab) {
    case "completed":
      return "Completed";
    case "history":
      return "History";
    case "dine_in":
      return "Dine-In";
    case "pickup":
      return "Pickup";
    case "delivery":
      return "Delivery";
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
  if (tab === "dine_in") {
    return `${dateLabel} · ${count} dine-in reservation${count === 1 ? "" : "s"}`;
  }
  if (tab === "pickup") {
    return `${dateLabel} · ${count} ready pickup${count === 1 ? "" : "s"}`;
  }
  if (tab === "delivery") {
    return `${dateLabel} · ${count} ${count === 1 ? "delivery" : "deliveries"}`;
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
        "Delivery guest preorders marked Ready appear here until Delivered (including Out for Delivery).",
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
  const [search, setSearch] = useState("");
  const knownOrderIdsRef = useRef(new Set(initialOrders.map(({ id }) => id)));

  const applyReconciliation = useCallback((next: CollectionBoardOrder[]) => {
    knownOrderIdsRef.current = new Set(next.map(({ id }) => id));
    setOrders(next);
  }, []);
  const loadCollectionOrders = useCallback(
    () => listCollectionOrdersForTabAction(tab, boardDate),
    [boardDate, tab],
  );
  const reconcileList = useCoalescedReconciliation(
    loadCollectionOrders,
    applyReconciliation,
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`collection-board-${tab}-${boardDate}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as OrderRowPayload;
          if (
            row.id &&
            row.customer_id == null &&
            row.pickup_date === boardDate
          ) {
            void reconcileList();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as OrderRowPayload;
          if (
            row.id &&
            (knownOrderIdsRef.current.has(row.id) ||
              (row.customer_id == null && row.pickup_date === boardDate))
          ) {
            void reconcileList();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.old as OrderDeletePayload;
          if (row.id && knownOrderIdsRef.current.has(row.id)) {
            void reconcileList();
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void reconcileList();
      });

    const reconcileWhenVisible = () => {
      if (document.visibilityState === "visible") void reconcileList();
    };
    const reconcileOnFocus = () => void reconcileList();
    document.addEventListener("visibilitychange", reconcileWhenVisible);
    window.addEventListener("focus", reconcileOnFocus);

    const pollId = window.setInterval(() => {
      void reconcileList();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", reconcileWhenVisible);
      window.removeEventListener("focus", reconcileOnFocus);
      void supabase.removeChannel(channel);
    };
  }, [boardDate, reconcileList, tab]);

  const now = new Date();
  const overdueCount =
    tab === "ready" || tab === "pickup"
      ? countCollectionPickupOverdue(
          orders.filter((order) => order.fulfilmentMethod === "pickup"),
          now,
        )
      : 0;

  const visibleOrders = useMemo(() => {
    const scoped =
      tab !== "dine_in" || venueFilter === "all"
        ? orders
        : orders.filter((order) => order.dineIn?.venue === venueFilter);
    return scoped.filter((order) =>
      matchesCollectionQueueSearch(order, search),
    );
  }, [orders, search, tab, venueFilter]);

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

      <div className="mt-4">
        <label className="sr-only" htmlFor="collection-search">
          Search collection orders
        </label>
        <input
          className="border-fog text-ink min-h-10 w-full rounded-lg border bg-white px-3 text-sm"
          id="collection-search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, order number, or WhatsApp…"
          type="search"
          value={search}
        />
      </div>

      {tab === "dine_in" ? (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Venue filter">
          <Link
            className={venueChipClass(venueFilter === "all")}
            href={collectionDateNavHref(boardDate, "dine_in", "all")}
            prefetch={false}
          >
            All
          </Link>
          <Link
            className={venueChipClass(venueFilter === "hyphen")}
            href={collectionDateNavHref(boardDate, "dine_in", "hyphen")}
            prefetch={false}
          >
            Hyphen
          </Link>
          <Link
            className={venueChipClass(venueFilter === "whitebird")}
            href={collectionDateNavHref(boardDate, "dine_in", "whitebird")}
            prefetch={false}
          >
            Whitebird
          </Link>
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
