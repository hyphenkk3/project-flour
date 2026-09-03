import Link from "next/link";
import { formatDdMmYyyy } from "@/lib/dates";
import {
  deriveOwnerAttention,
  type OwnerAttentionReason,
} from "@/engines/operations/owner-attention";
import {
  isFulfilmentTerminal,
  operationalMarkerFromTimestamps,
} from "@/engines/orders/operational-state";
import {
  formatPickupTime,
  orderSourceLabel,
} from "@/workspaces/owner/orders/labels";
import {
  deriveOrderLifecycleStage,
  orderLifecycleBadgeTone,
  orderLifecycleLabel,
} from "@/engines/orders/lifecycle";
import type { StorefrontOrderListItem } from "@/types/storefront";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";

type OwnerOrderCardProps = {
  order: StorefrontOrderListItem;
  highlight?: boolean;
  /** Validated Operations or Calendar return path. */
  returnTo?: string | null;
};

function attentionInput(order: StorefrontOrderListItem) {
  return {
    status: order.status,
    confirmationNeedsResend: order.confirmationNeedsResend,
    fulfilmentMethod: order.fulfilmentMethod,
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
    outForDeliveryAt: order.outForDeliveryAt,
    deliveredAt: order.deliveredAt,
    paymentDeadlineAt: order.paymentDeadlineAt,
    hasPendingFeeRequest: order.hasPendingFeeRequest,
  };
}

export function OwnerOrderCard({
  order,
  highlight = false,
  returnTo = null,
}: OwnerOrderCardProps) {
  const cakeLine =
    order.additionalItemCount > 0
      ? `${order.cakeName} · ${order.sizeLabel} + ${order.additionalItemCount} more`
      : `${order.cakeName} · ${order.sizeLabel}`;
  const marker = operationalMarkerFromTimestamps({
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
    outForDeliveryAt: order.outForDeliveryAt,
    deliveredAt: order.deliveredAt,
    fulfilmentMethod: order.fulfilmentMethod,
  });
  const completed = isFulfilmentTerminal({
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
    outForDeliveryAt: order.outForDeliveryAt,
    deliveredAt: order.deliveredAt,
    fulfilmentMethod: order.fulfilmentMethod,
  });
  const reasons: OwnerAttentionReason[] = completed
    ? []
    : deriveOwnerAttention(attentionInput(order));

  return (
    <Link
      className={
        highlight
          ? "border-signal bg-signal/5 ring-signal/20 block rounded-xl border-2 p-4 shadow-sm ring-2 transition-colors"
          : completed
            ? "border-fog/80 bg-mist/40 text-skyline block rounded-xl border p-4 transition-colors"
            : "border-fog hover:border-skyline block rounded-xl border bg-white p-4 transition-colors"
      }
      href={ownerOrderWorkspaceHref(order.id, returnTo)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p
            className={
              completed
                ? "text-skyline truncate text-base font-semibold"
                : "text-ink truncate text-base font-semibold"
            }
          >
            {marker ? `${marker} ` : ""}
            {order.customerName}
          </p>
          <p className="text-skyline truncate text-sm">
            {orderSourceLabel(order.orderSource)}
            {order.extraStockId ? " · Fresh Picks" : ""}
          </p>
          <p className={completed ? "text-skyline text-sm" : "text-ink text-sm"}>
            {cakeLine}
          </p>
          <p className="text-skyline text-sm">
            {formatDdMmYyyy(order.pickupDate)} ·{" "}
            {formatPickupTime(order.pickupTime)}
          </p>
          {reasons.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {reasons.map((reason) => (
                <li
                  className="text-status-warning text-xs font-medium"
                  key={reason.key}
                >
                  {reason.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <StatusBadge
          label={orderLifecycleLabel({
            status: order.status,
            productionStartedAt: order.productionStartedAt,
            readyAt: order.readyAt,
            pickedUpAt: order.pickedUpAt,
            deliveredAt: order.deliveredAt,
          })}
          tone={orderLifecycleBadgeTone(
            deriveOrderLifecycleStage({
              status: order.status,
              productionStartedAt: order.productionStartedAt,
              readyAt: order.readyAt,
              pickedUpAt: order.pickedUpAt,
              deliveredAt: order.deliveredAt,
            }),
          )}
        />
      </div>
    </Link>
  );
}
