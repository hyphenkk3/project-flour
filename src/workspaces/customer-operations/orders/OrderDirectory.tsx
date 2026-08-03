"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OrderListItem } from "@/types/order";
import { OrderCard } from "@/workspaces/customer-operations/orders/OrderCard";
import {
  matchesOrderQuery,
  sortOrders,
  type OrderSortKey,
} from "@/workspaces/customer-operations/orders/search";

type OrderDirectoryProps = {
  orders: OrderListItem[];
};

const SORT_OPTIONS: { value: OrderSortKey; label: string }[] = [
  { value: "updatedAt", label: "Last updated" },
  { value: "pickupDate", label: "Pickup date" },
  { value: "orderNumber", label: "Order number" },
  { value: "customerName", label: "Customer name" },
];

export function OrderDirectory({ orders }: OrderDirectoryProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<OrderSortKey>("updatedAt");

  const visible = useMemo(() => {
    const filtered = orders.filter((order) => matchesOrderQuery(order, query));
    return sortOrders(
      filtered,
      sortKey,
      sortKey === "customerName" || sortKey === "orderNumber" ? "asc" : "desc",
    );
  }, [orders, query, sortKey]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <label className="sr-only" htmlFor="order-search">
            Search orders
          </label>
          <input
            autoComplete="off"
            className="border-fog text-ink focus:border-signal w-full rounded-lg border bg-white py-3 pr-20 pl-4 text-base outline-none"
            id="order-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search order number or customer name"
            type="search"
            value={query}
          />
          {hasQuery ? (
            <button
              className="text-skyline hover:text-ink absolute top-1/2 right-2 min-h-10 min-w-14 -translate-y-1/2 rounded-md px-2 text-sm font-medium"
              onClick={() => setQuery("")}
              type="button"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="sm:w-56">
          <label className="sr-only" htmlFor="order-sort">
            Sort orders
          </label>
          <select
            className="border-fog text-ink focus:border-signal min-h-12 w-full rounded-lg border bg-white px-3 text-base outline-none"
            id="order-sort"
            onChange={(event) => setSortKey(event.target.value as OrderSortKey)}
            value={sortKey}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Sort · {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          compact
          description={
            hasQuery
              ? "Try a different order number or customer name."
              : "Create an order to start Order Operations."
          }
          title={hasQuery ? "No orders match your search." : "No orders yet."}
        />
      ) : (
        <ul className="grid gap-3">
          {visible.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
