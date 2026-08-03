import type { OrderListItem } from "@/types/order";

export type OrderSearchField = "orderNumber" | "customerName";

/**
 * Expandable order search matcher.
 * Current fields: order number, customer name.
 * Add fields here later without redesigning the directory.
 */
export function matchesOrderQuery(
  order: OrderListItem,
  query: string,
  fields: readonly OrderSearchField[] = ["orderNumber", "customerName"],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  for (const field of fields) {
    switch (field) {
      case "orderNumber":
        if (order.orderNumber.toLowerCase().includes(q)) {
          return true;
        }
        break;
      case "customerName":
        if (order.customer.fullName.toLowerCase().includes(q)) {
          return true;
        }
        break;
    }
  }

  return false;
}

export type OrderSortKey =
  "updatedAt" | "pickupDate" | "orderNumber" | "customerName";

export function sortOrders(
  orders: OrderListItem[],
  sortKey: OrderSortKey,
  direction: "asc" | "desc" = "desc",
): OrderListItem[] {
  const sorted = [...orders];
  const factor = direction === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    let left = "";
    let right = "";

    switch (sortKey) {
      case "updatedAt":
        left = a.updatedAt;
        right = b.updatedAt;
        break;
      case "pickupDate":
        left = `${a.pickupDate}T${a.pickupTime}`;
        right = `${b.pickupDate}T${b.pickupTime}`;
        break;
      case "orderNumber":
        left = a.orderNumber;
        right = b.orderNumber;
        break;
      case "customerName":
        left = a.customer.fullName.toLowerCase();
        right = b.customer.fullName.toLowerCase();
        break;
    }

    if (left < right) return -1 * factor;
    if (left > right) return 1 * factor;
    return 0;
  });

  return sorted;
}
