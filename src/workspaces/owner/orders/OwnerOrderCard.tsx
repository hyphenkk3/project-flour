import Link from "next/link";
import { formatDdMmYyyy } from "@/lib/dates";
import { operationalMarkerFromTimestamps } from "@/engines/orders/operational-state";
import {
  formatPickupTime,
  guestOrderStatusBadgeClassName,
  guestOrderStatusBadgeTone,
  guestOrderStatusLabel,
  orderSourceLabel,
} from "@/workspaces/owner/orders/labels";
import type { StorefrontOrderListItem } from "@/types/storefront";
import { StatusBadge } from "@/components/ui/StatusBadge";

type OwnerOrderCardProps = {
  order: StorefrontOrderListItem;
  highlight?: boolean;
};

export function OwnerOrderCard({
  order,
  highlight = false,
}: OwnerOrderCardProps) {
  const cakeLine =
    order.additionalItemCount > 0
      ? `${order.cakeName} · ${order.sizeLabel} + ${order.additionalItemCount} more`
      : `${order.cakeName} · ${order.sizeLabel}`;
  const marker = operationalMarkerFromTimestamps({
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
  });

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
            {marker ? `${marker} ` : ""}
            {order.customerName}
          </p>
          <p className="text-skyline truncate text-sm">
            {orderSourceLabel(order.orderSource)}
          </p>
          <p className="text-ink text-sm">{cakeLine}</p>
          <p className="text-skyline text-sm">
            {formatDdMmYyyy(order.pickupDate)} ·{" "}
            {formatPickupTime(order.pickupTime)}
          </p>
          {order.confirmationNeedsResend ? (
            <p className="text-status-warning text-xs font-medium">
              Previous confirmation outdated — reconfirmation required
            </p>
          ) : null}
        </div>
        <StatusBadge
          className={guestOrderStatusBadgeClassName(order.status)}
          label={guestOrderStatusLabel(order.status)}
          tone={guestOrderStatusBadgeTone(order.status)}
        />
      </div>
    </Link>
  );
}
