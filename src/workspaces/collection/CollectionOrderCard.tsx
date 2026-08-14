import Link from "next/link";
import {
  formatPickupTime,
  guestOrderStatusBadgeClassName,
  guestOrderStatusBadgeTone,
  guestOrderStatusLabel,
} from "@/workspaces/owner/orders/labels";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { collectionOrderHref } from "@/workspaces/collection/date";
import {
  collectionDeskAttention,
  collectionPrimaryCakeSummary,
  hasCollectionPaymentAttention,
  isCollectionOrderSecured,
} from "@/workspaces/collection/eligibility";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";

type CollectionOrderCardProps = {
  order: CollectionBoardOrder;
  boardDate: string;
  now: Date;
};

export function CollectionOrderCard({
  order,
  boardDate,
  now,
}: CollectionOrderCardProps) {
  const desk = collectionDeskAttention({
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
    now,
  });
  const { cakeName, sizeLabel, additionalCakeCount } =
    collectionPrimaryCakeSummary(order);
  const secured = isCollectionOrderSecured(order.status);
  const paymentAttention = hasCollectionPaymentAttention({
    readyAt: order.readyAt,
    status: order.status,
  });
  const notes = order.customerNotes?.trim() ?? "";

  return (
    <article className="border-fog rounded-xl border bg-white px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={
                desk.overdue
                  ? "text-status-warning shrink-0 text-sm font-semibold tracking-tight"
                  : "text-signal shrink-0 text-sm font-semibold tracking-tight"
              }
            >
              {formatPickupTime(order.pickupTime)}
            </span>
            <h3 className="text-ink min-w-0 truncate text-sm font-semibold tracking-tight">
              {order.guestName}
            </h3>
          </div>
          <p className="text-ink mt-0.5 text-sm leading-snug">
            {cakeName}
            {sizeLabel ? (
              <span className="text-skyline"> · {sizeLabel}</span>
            ) : null}
          </p>
          {additionalCakeCount > 0 ? (
            <p className="text-skyline mt-0.5 text-xs leading-snug">
              +{additionalCakeCount} more
            </p>
          ) : null}
          {notes ? (
            <p className="text-ink mt-0.5 line-clamp-1 text-xs font-medium">
              {notes}
            </p>
          ) : null}
        </div>
        <StatusBadge
          label={desk.label}
          tone={desk.tone}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-skyline text-xs">{order.orderNumber}</span>
          <StatusBadge
            className={guestOrderStatusBadgeClassName(order.status)}
            label={guestOrderStatusLabel(order.status)}
            tone={guestOrderStatusBadgeTone(order.status)}
          />
          {!secured ? (
            <StatusBadge label="Not secured" tone="warning" />
          ) : null}
          {paymentAttention ? (
            <StatusBadge label="Payment Attention" tone="danger" />
          ) : null}
        </div>
        <Link
          className="text-signal hover:text-ink inline-flex min-h-9 shrink-0 items-center text-sm font-medium transition"
          href={collectionOrderHref(order.id, boardDate)}
        >
          Open →
        </Link>
      </div>
    </article>
  );
}
