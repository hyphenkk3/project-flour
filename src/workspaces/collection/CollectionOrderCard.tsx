import Link from "next/link";
import {
  formatPickupTime,
  formatTimelineTime,
  guestOrderStatusBadgeClassName,
  guestOrderStatusBadgeTone,
  guestOrderStatusLabel,
} from "@/workspaces/owner/orders/labels";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import { formatLongBusinessDate } from "@/lib/dates";
import { collectionOrderHref } from "@/workspaces/collection/date";
import {
  collectionDeskAttention,
  collectionHandoffCompletedAt,
  collectionPrimaryCakeSummary,
  hasCollectionPaymentAttention,
  isCollectionDeliveryMethod,
  isCollectionDineInMethod,
  isCollectionOrderSecured,
  type CollectionBoardTab,
} from "@/workspaces/collection/eligibility";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";

type CollectionOrderCardProps = {
  order: CollectionBoardOrder;
  boardDate: string;
  tab?: CollectionBoardTab;
  now: Date;
};

export function CollectionOrderCard({
  order,
  boardDate,
  tab = "ready",
  now,
}: CollectionOrderCardProps) {
  const desk = collectionDeskAttention({
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
    deliveredAt: order.deliveredAt,
    fulfilmentMethod: order.fulfilmentMethod,
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
  const completedAt = collectionHandoffCompletedAt(order);
  const completedLabel = completedAt ? formatTimelineTime(completedAt) : null;
  const dineIn = isCollectionDineInMethod(order.fulfilmentMethod);
  const methodLabel = isCollectionDeliveryMethod(order.fulfilmentMethod)
    ? "Delivery"
    : dineIn
      ? "Dine-in"
      : "Pickup";
  const showCompletedMeta = tab === "completed" || tab === "history";
  const reservationTime = order.dineIn?.reservationTime ?? "";
  const guestCount = order.dineIn?.guestCount;

  return (
    <article className="border-fog rounded-xl border bg-white px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {dineIn ? (
              <h3 className="text-ink min-w-0 truncate text-sm font-semibold tracking-tight">
                {order.guestName}
              </h3>
            ) : (
              <>
                <span
                  className={
                    desk.overdue
                      ? "text-status-warning shrink-0 text-sm font-semibold tracking-tight"
                      : "text-signal shrink-0 text-sm font-semibold tracking-tight"
                  }
                >
                  {showCompletedMeta && completedLabel
                    ? completedLabel
                    : formatPickupTime(order.pickupTime)}
                </span>
                <h3 className="text-ink min-w-0 truncate text-sm font-semibold tracking-tight">
                  {order.guestName}
                </h3>
              </>
            )}
          </div>
          {dineIn ? (
            <div className="text-skyline mt-1 space-y-0.5 text-xs leading-snug">
              <p>
                <span className="text-ink font-medium">Reservation:</span>{" "}
                {reservationTime
                  ? formatPickupTime(reservationTime)
                  : "—"}
              </p>
              <p>
                <span className="text-ink font-medium">Cake serving:</span>{" "}
                {formatPickupTime(order.pickupTime)}
              </p>
              {order.dineIn ? (
                <p>
                  {dineInVenueLabel(order.dineIn.venue)}
                  {guestCount
                    ? ` · ${guestCount} guest${guestCount === 1 ? "" : "s"}`
                    : null}
                </p>
              ) : null}
              {order.guestPhone ? <p>{order.guestPhone}</p> : null}
            </div>
          ) : null}
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
          {showCompletedMeta ? (
            <p className="text-skyline mt-0.5 text-xs leading-snug">
              {methodLabel}
              {order.pickupDate !== boardDate
                ? ` · ${formatLongBusinessDate(order.pickupDate)}`
                : null}
            </p>
          ) : null}
          {notes ? (
            <p className="text-ink mt-0.5 line-clamp-1 text-xs font-medium">
              {notes}
            </p>
          ) : null}
        </div>
        <StatusBadge label={desk.label} tone={desk.tone} />
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
          {paymentAttention && tab === "ready" ? (
            <StatusBadge label="Payment Attention" tone="danger" />
          ) : null}
        </div>
        <Link
          className="text-signal hover:text-ink inline-flex min-h-9 shrink-0 items-center text-sm font-medium transition"
          href={collectionOrderHref(order.id, boardDate, tab)}
        >
          Open →
        </Link>
      </div>
    </article>
  );
}
