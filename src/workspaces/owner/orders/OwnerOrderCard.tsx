import Link from "next/link";
import { formatDdMmYyyy } from "@/lib/dates";
import {
  formatPickupTime,
  guestOrderStatusLabel,
} from "@/workspaces/owner/orders/labels";
import type { StorefrontOrderListItem } from "@/types/storefront";
import { StatusBadge } from "@/components/ui/StatusBadge";

type OwnerOrderCardProps = {
  order: StorefrontOrderListItem;
  highlight?: boolean;
};

export function OwnerOrderCard({ order, highlight = false }: OwnerOrderCardProps) {
  return (
    <Link
      className={
        highlight
          ? "border-signal bg-signal/5 ring-signal/20 block rounded-xl border-2 p-4 shadow-sm ring-2 transition-colors"
          : "border-fog hover:border-skyline block rounded-xl border bg-white p-4 transition-colors"
      }
      href={`/owner/orders/${order.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-ink truncate text-base font-semibold">
            {order.customerName}
          </p>
          <p className="text-ink text-sm">
            {order.cakeName} · {order.sizeLabel}
          </p>
          <p className="text-skyline text-sm">
            {formatDdMmYyyy(order.pickupDate)} ·{" "}
            {formatPickupTime(order.pickupTime)}
          </p>
        </div>
        <StatusBadge
          label={guestOrderStatusLabel(order.status)}
          tone={order.status === "submitted" ? "warning" : "info"}
        />
      </div>
    </Link>
  );
}
