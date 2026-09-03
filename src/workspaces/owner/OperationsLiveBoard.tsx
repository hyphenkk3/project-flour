"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  DEFAULT_OPERATIONS_QUERY,
  buildOperationsBoardPath,
  filterAndSortOperationsOrders,
  OPERATIONS_SEARCH_EMPTY_DESCRIPTION,
  OPERATIONS_SEARCH_EMPTY_TITLE,
  operationsSearchAndStatusMatches,
  operationsSearchSpansPickupDates,
  operationsTodayYmd,
  type OperationsBoardQuery,
} from "@/engines/operations/order-board";
import {
  appendPrepareConfirmationInbox,
  partitionOwnerOperationsTodayOrders,
} from "@/engines/operations/owner-attention";
import { createClient } from "@/lib/supabase/client";
import type { StorefrontOrderListItem } from "@/types/storefront";
import {
  getGuestOrderListItemAction,
  listGuestOrdersAction,
} from "@/workspaces/owner/orders/actions";
import { OwnerOrderCard } from "@/workspaces/owner/orders/OwnerOrderCard";
import { OperationsBoardToolbar } from "@/workspaces/owner/OperationsBoardToolbar";
import { OperationsApprovalsSection } from "@/workspaces/owner/approvals/OperationsApprovalsSection";
import type { OperationsApprovalRecord } from "@/engines/operations/approvals";
import {
  OPERATIONS_APPROVALS_SECTION_ID,
  pendingOperationsApprovalCount,
} from "@/engines/operations/approval-ux";
import {
  GUEST_ORDERS_LIVE_POLL_MS,
  isGuestOrderLiveEvent,
  type GuestOrderLiveRow,
} from "@/workspaces/owner/orders/guest-orders-live";
import { isNewOrderNotificationEligible } from "@/workspaces/owner/orders/new-order-notifications";
import { scrollWorkspaceSectionIntoView } from "@/workspaces/owner/orders/scroll-workspace-section";

const POLL_INTERVAL_MS = GUEST_ORDERS_LIVE_POLL_MS;
const HIGHLIGHT_MS = 4500;

type OperationsLiveBoardProps = {
  initialOrders: StorefrontOrderListItem[];
  /** Owner-only board tools: Calendar, Propose EXTRA, + New Order. */
  showOwnerBoardTools?: boolean;
  pendingApprovals?: OperationsApprovalRecord[];
  initialQuery?: OperationsBoardQuery;
};

type OrderRowPayload = GuestOrderLiveRow;

export function OperationsLiveBoard({
  initialOrders,
  showOwnerBoardTools = false,
  pendingApprovals = [],
  initialQuery = DEFAULT_OPERATIONS_QUERY,
}: OperationsLiveBoardProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState<OperationsBoardQuery>(initialQuery);
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

  const highlightArrivedOrder = useCallback(
    (item: StorefrontOrderListItem) => {
      if (notifiedIdsRef.current.has(item.id)) return;
      if (!isNewOrderNotificationEligible(item)) return;
      notifiedIdsRef.current.add(item.id);
      highlightOrder(item.id);
    },
    [highlightOrder],
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
      highlightArrivedOrder(item);
    },
    [loadListItem, highlightArrivedOrder, upsertOrder],
  );

  const handleIncomingUpdate = useCallback(
    async (id: string) => {
      const item = await loadListItem(id);
      if (!item) {
        removeOrder(id);
        return;
      }
      upsertOrder(item);
    },
    [loadListItem, removeOrder, upsertOrder],
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
        highlightArrivedOrder(item);
      }
    } catch {
      // Keep showing the last successful board state.
    }
  }, [highlightArrivedOrder]);

  useEffect(() => {
    setOrders(initialOrders);
    for (const order of initialOrders) {
      knownIdsRef.current.add(order.id);
      notifiedIdsRef.current.add(order.id);
    }
  }, [initialOrders]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== `#${OPERATIONS_APPROVALS_SECTION_ID}`) return;
    scrollWorkspaceSectionIntoView(OPERATIONS_APPROVALS_SECTION_ID, {
      focus: true,
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("operations-guest-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as OrderRowPayload;
          if (!isGuestOrderLiveEvent(row)) return;
          void handleIncomingInsert(row.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as OrderRowPayload;
          if (!isGuestOrderLiveEvent(row)) return;
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

  const isTodayView =
    query.pickupFilter === "today" && !operationsSearchSpansPickupDates(query);

  const todayBuckets = useMemo(() => {
    if (!isTodayView) return null;
    return appendPrepareConfirmationInbox(
      partitionOwnerOperationsTodayOrders(visibleOrders),
      operationsSearchAndStatusMatches(orders, query),
      operationsTodayYmd(),
    );
  }, [isTodayView, visibleOrders, orders, query]);

  const todayGroupCounts = useMemo(() => {
    if (!todayBuckets) return null;
    return {
      needsAttention: todayBuckets.needsAttention.length,
      allClear: todayBuckets.allClear.length,
      completed: todayBuckets.completed.length,
    };
  }, [todayBuckets]);

  const listedCount = todayBuckets
    ? todayBuckets.needsAttention.length +
      todayBuckets.allClear.length +
      todayBuckets.completed.length
    : visibleOrders.length;

  const newCount = useMemo(
    () =>
      (todayBuckets?.needsAttention ?? visibleOrders).filter(
        (order) => order.status === "submitted",
      ).length,
    [todayBuckets, visibleOrders],
  );

  const boardHref = useMemo(() => buildOperationsBoardPath(query), [query]);

  const handleQueryChange = useCallback((next: OperationsBoardQuery) => {
    setQuery(next);
    if (typeof window === "undefined") return;
    const href = buildOperationsBoardPath(next);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === href || window.location.pathname !== "/owner") return;
    window.history.replaceState(window.history.state, "", href);
  }, []);

  function renderOrderList(list: StorefrontOrderListItem[]) {
    return (
      <ul className="grid gap-3">
        {list.map((order) => (
          <li key={order.id}>
            <OwnerOrderCard
              highlight={highlightedIds.has(order.id)}
              order={order}
              returnTo={boardHref}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          description="Today’s fulfilment work, first."
          title="Operations"
        />
        <div className="flex shrink-0 flex-wrap gap-2">
          {showOwnerBoardTools ? (
            <>
              <Link
                className="border-line text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium"
                href="/owner/calendar"
                scroll={false}
              >
                Whole Cake Calendar
              </Link>
              <Link
                className="border-line text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium"
                href="/bakery/extra?mode=propose"
              >
                Propose EXTRA
              </Link>
              <Link
                className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium"
                href="/owner/orders/new"
              >
                + New Order
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <OperationsBoardToolbar
        matchCount={listedCount}
        newCount={newCount}
        onChange={handleQueryChange}
        pendingApprovalCount={pendingOperationsApprovalCount(pendingApprovals)}
        query={query}
        todayGroupCounts={todayGroupCounts}
      />

      {todayBuckets ? null : (
        <OperationsApprovalsSection
          approvals={pendingApprovals}
          returnTo={boardHref}
        />
      )}

      <section className="space-y-3">
        {todayBuckets ? (
          <div className="space-y-6">
            <section className="space-y-2.5">
              <h2 className="text-status-warning text-sm font-bold tracking-wide uppercase">
                Needs Attention
                <span className="ml-2 font-bold normal-case tabular-nums">
                  {todayBuckets.needsAttention.length}
                </span>
              </h2>
              {todayBuckets.needsAttention.length === 0 ? (
                <p className="text-skyline text-sm">Nothing needs attention.</p>
              ) : (
                renderOrderList(todayBuckets.needsAttention)
              )}
            </section>
            <OperationsApprovalsSection
              approvals={pendingApprovals}
              returnTo={boardHref}
            />
            <section className="space-y-2.5">
              <h2 className="text-status-success text-sm font-semibold tracking-wide uppercase">
                All Clear
                <span className="ml-2 font-semibold normal-case tabular-nums">
                  {todayBuckets.allClear.length}
                </span>
              </h2>
              {todayBuckets.allClear.length === 0 ? (
                <p className="text-skyline text-sm">No all-clear orders.</p>
              ) : (
                renderOrderList(todayBuckets.allClear)
              )}
            </section>
            <section className="space-y-2.5">
              <h2 className="text-skyline/80 text-sm font-medium tracking-wide uppercase">
                Completed
                <span className="ml-2 font-medium normal-case tabular-nums">
                  {todayBuckets.completed.length}
                </span>
              </h2>
              {todayBuckets.completed.length === 0 ? (
                <p className="text-skyline text-sm">No completed orders yet.</p>
              ) : (
                renderOrderList(todayBuckets.completed)
              )}
            </section>
          </div>
        ) : visibleOrders.length === 0 ? (
          <EmptyState
            description={
              operationsSearchSpansPickupDates(query)
                ? OPERATIONS_SEARCH_EMPTY_DESCRIPTION
                : orders.length === 0
                  ? "New customer preorders will appear here automatically."
                  : "Try clearing search or filters to see more orders."
            }
            title={
              operationsSearchSpansPickupDates(query)
                ? OPERATIONS_SEARCH_EMPTY_TITLE
                : orders.length === 0
                  ? "You’re all caught up."
                  : "No matching orders."
            }
          />
        ) : (
          renderOrderList(visibleOrders)
        )}
      </section>
    </div>
  );
}
