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
  collectionDeskBadgeTone,
  collectionDeskLabel,
  collectionDeskPresentation,
  collectionPrimaryCakeSummary,
  hasCollectionPaymentAttention,
  isCollectionOrderSecured,
} from "@/workspaces/collection/eligibility";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";

type CollectionOrderCardProps = {
  order: CollectionBoardOrder;
  boardDate: string;
};

export function CollectionOrderCard({
  order,
  boardDate,
}: CollectionOrderCardProps) {
  const presentation = collectionDeskPresentation({
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
  });
  const { cakeName, sizeLabel, additionalCakeCount } =
    collectionPrimaryCakeSummary(order);
  const secured = isCollectionOrderSecured(order.status);
  const paymentAttention = hasCollectionPaymentAttention({
    readyAt: order.readyAt,
    status: order.status,
  });

  return (
    <article className="border-fog rounded-2xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-signal text-sm font-semibold tracking-tight">
          {formatPickupTime(order.pickupTime)}
        </p>
        <StatusBadge
          label={collectionDeskLabel(presentation)}
          tone={collectionDeskBadgeTone(presentation)}
        />
      </div>
      <h3 className="font-display text-ink mt-1 text-xl leading-tight tracking-tight">
        {order.guestName}
      </h3>
      <p className="text-ink mt-1 text-sm">
        {cakeName}
        {sizeLabel ? <span className="text-skyline"> · {sizeLabel}</span> : null}
      </p>
      {additionalCakeCount > 0 ? (
        <p className="text-skyline mt-1 text-sm">+{additionalCakeCount} more</p>
      ) : null}
      <p className="text-skyline mt-3 text-sm">{order.orderNumber}</p>
      <div className="mt-2 flex flex-wrap gap-2">
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
      {order.customerNotes?.trim() ? (
        <p className="text-ink mt-2 line-clamp-2 text-sm font-medium">
          {order.customerNotes.trim()}
        </p>
      ) : null}
      <Link
        className="text-signal hover:text-ink mt-4 inline-flex min-h-11 items-center text-sm font-medium transition"
        href={collectionOrderHref(order.id, boardDate)}
      >
        Open →
      </Link>
    </article>
  );
}
