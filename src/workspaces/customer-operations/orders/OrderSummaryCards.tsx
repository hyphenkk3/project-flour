import type { OrderListItem, OrderStatus } from "@/types/order";
import { orderStatusLabel } from "@/workspaces/customer-operations/orders/status";

type OrderSummaryCardsProps = {
  orders: OrderListItem[];
};

type SummaryItem = {
  label: string;
  count: number;
};

function countByStatus(orders: OrderListItem[], status: OrderStatus): number {
  return orders.filter((order) => order.status === status).length;
}

export function OrderSummaryCards({ orders }: OrderSummaryCardsProps) {
  const items: SummaryItem[] = [
    { label: "Total Orders", count: orders.length },
    {
      label: orderStatusLabel("submitted"),
      count: countByStatus(orders, "submitted"),
    },
    {
      label: orderStatusLabel("pending_confirmation"),
      count: countByStatus(orders, "pending_confirmation"),
    },
    {
      label: orderStatusLabel("awaiting_payment"),
      count: countByStatus(orders, "awaiting_payment"),
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <li
          className="border-fog rounded-xl border bg-white px-4 py-3 shadow-sm"
          key={item.label}
        >
          <p className="text-skyline text-xs tracking-wide uppercase">
            {item.label}
          </p>
          <p className="text-ink mt-1 text-2xl font-semibold tabular-nums">
            {item.count}
          </p>
        </li>
      ))}
    </ul>
  );
}
