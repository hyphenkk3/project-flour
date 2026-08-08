"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { useToast } from "@/components/ui/Toast";
import {
  DEFAULT_OPERATIONS_QUERY,
  filterAndSortOperationsOrders,
  type OperationsBoardQuery,
} from "@/engines/operations/order-board";
import { formatShortBusinessDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import type { StorefrontOrderListItem } from "@/types/storefront";
import {
  getGuestOrderListItemAction,
  listGuestOrdersAction,
} from "@/workspaces/owner/orders/actions";
import { OwnerOrderCard } from "@/workspaces/owner/orders/OwnerOrderCard";
import { OperationsBoardToolbar } from "@/workspaces/owner/OperationsBoardToolbar";

const POLL_INTERVAL_MS = 30_000;
const HIGHLIGHT_MS = 4500;

type OperationsLiveBoardProps = {
  initialOrders: StorefrontOrderListItem[];
};

type OrderRowPayload = {
  id?: string;
  customer_id?: string | null;
  status?: string;
};

export function OperationsLiveBoard({
  initialOrders,
}: OperationsLiveBoardProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState<OperationsBoardQuery>(
    DEFAULT_OPERATIONS_QUERY,
  );
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(
    () => new Set(),
  );

  const knownIdsRef = useRef(new Set(initialOrders.map((order) => order.id)));
  const notifiedIdsRef = useRef(new Set(initialOrders.map((order) => order.id)));

  const upsertOrder = useCallback((item: StorefrontOrderListItem) => {
    knownIdsRef.current.add(item.id);
    setOrders((current) => {
      const without = current.filter((order) => order.id !== item.id);
      return [item, ...without];
    });
  }, []);

  const removeOrder = useCallback((id: string) => {
    setOrders((current) => current.filter((order) => order.id !== id));
  }, []);

  const highlightOrder = useCallback((id: string) => {
    setHighlightedIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setHighlightedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, HIGHLIGHT_MS);
  }, []);

  const notifyNewOrder = useCallback(
    (item: StorefrontOrderListItem) => {
      if (notifiedIdsRef.current.has(item.id)) return;
      notifiedIdsRef.current.add(item.id);
      toast({
        title: "New preorder received",
        description: `${item.customerName} · ${item.cakeName} · ${formatShortBusinessDate(item.pickupDate)}`,
        tone: "info",
      });
      highlightOrder(item.id);
    },
    [highlightOrder, toast],
  );

  const loadListItem = useCallback(async (id: string) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const item = await getGuestOrderListItemAction(id);
      if (item) return item;
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
    return null;
  }, []);

  const handleIncomingInsert = useCallback(
    async (id: string) => {
      if (knownIdsRef.current.has(id)) return;
      const item = await loadListItem(id);
      if (!item) return;
      upsertOrder(item);
      notifyNewOrder(item);
    },
    [loadListItem, notifyNewOrder, upsertOrder],
  );

  const handleIncomingUpdate = useCallback(
    async (id: string) => {
      const item = await loadListItem(id);
      if (!item) {
        removeOrder(id);
        return;
      }
      const isNew = !knownIdsRef.current.has(id);
      upsertOrder(item);
      if (isNew) {
        notifyNewOrder(item);
      }
    },
    [loadListItem, notifyNewOrder, removeOrder, upsertOrder],
  );

  const reconcileFromServer = useCallback(async () => {
    try {
      const latest = await listGuestOrdersAction();
      const previousKnown = knownIdsRef.current;
      const arrived: StorefrontOrderListItem[] = [];

      for (const item of latest) {
        if (!previousKnown.has(item.id) && !notifiedIdsRef.current.has(item.id)) {
          arrived.push(item);
        }
      }

      knownIdsRef.current = new Set(latest.map((order) => order.id));
      setOrders(latest);

      for (const item of arrived) {
        notifyNewOrder(item);
      }
    } catch {
      // Keep showing the last successful board state.
    }
  }, [notifyNewOrder]);

  useEffect(() => {
    setOrders(initialOrders);
    for (const order of initialOrders) {
      knownIdsRef.current.add(order.id);
      notifiedIdsRef.current.add(order.id);
    }
  }, [initialOrders]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("operations-guest-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as OrderRowPayload;
          if (!row.id || row.customer_id != null) return;
          void handleIncomingInsert(row.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as OrderRowPayload;
          if (!row.id || row.customer_id != null) return;
          void handleIncomingUpdate(row.id);
        },
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      void reconcileFromServer();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [handleIncomingInsert, handleIncomingUpdate, reconcileFromServer]);

  const visibleOrders = useMemo(
    () => filterAndSortOperationsOrders(orders, query),
    [orders, query],
  );

  const newCount = useMemo(
    () => visibleOrders.filter((order) => order.status === "submitted").length,
    [visibleOrders],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          description="Customer preorders requiring attention."
          title="Operations"
        />
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            className="border-line text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium"
            href="/owner/calendar"
            scroll={false}
          >
            Whole Cake Calendar
          </Link>
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium"
            href="/owner/orders/new"
          >
            + New Order
          </Link>
        </div>
      </div>

      <OperationsBoardToolbar
        matchCount={visibleOrders.length}
        newCount={newCount}
        onChange={setQuery}
        query={query}
      />

      <section className="space-y-4">
        {visibleOrders.length === 0 ? (
          <EmptyState
            description={
              orders.length === 0
                ? "New customer preorders will appear here automatically."
                : "Try clearing search or filters to see more orders."
            }
            title={
              orders.length === 0 ? "You’re all caught up." : "No matching orders."
            }
          />
        ) : (
          <ul className="grid gap-3">
            {visibleOrders.map((order) => (
              <li key={order.id}>
                <OwnerOrderCard
                  highlight={highlightedIds.has(order.id)}
                  order={order}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
