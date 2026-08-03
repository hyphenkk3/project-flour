import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/dates";
import type { OrderListItem } from "@/types/order";
import {
  formatOrderDate,
  fulfilmentMethodLabel,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/workspaces/customer-operations/orders/status";

type OrderCardProps = {
  order: OrderListItem;
};

export function OrderCard({ order }: OrderCardProps) {
  return (
    <Link
      className="border-fog hover:border-signal block rounded-2xl border bg-white p-4 shadow-sm transition"
      href={`/customer-operations/orders/${order.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink font-semibold tracking-tight">
            {order.orderNumber}
          </p>
          <p className="text-ink mt-1 truncate text-sm font-medium">
            {order.customer.fullName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={orderStatusLabel(order.status)}
            tone={orderStatusTone(order.status)}
          />
          <StatusBadge
            label={paymentStatusLabel(order.paymentStatus)}
            tone={paymentStatusTone(order.paymentStatus)}
          />
        </div>
      </div>

      <dl className="text-skyline mt-3 grid gap-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="sr-only">Pickup date</dt>
          <dd>Pickup · {formatOrderDate(order.pickupDate)}</dd>
        </div>
        <div>
          <dt className="sr-only">Fulfilment</dt>
          <dd>{fulfilmentMethodLabel(order.fulfilmentMethod)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="sr-only">Last updated</dt>
          <dd>Updated · {formatDateTime(order.updatedAt)}</dd>
        </div>
      </dl>
    </Link>
  );
}
