import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  formatPickupTime,
  guestOrderStatusBadgeClassName,
  guestOrderStatusBadgeTone,
  guestOrderStatusLabel,
} from "@/workspaces/owner/orders/labels";
import { bakeryOrderHref } from "@/workspaces/bakery/date";
import {
  bakeryAttentionBadgeLabel,
  bakeryCustomerNotesExcerpt,
  bakeryFulfilmentCue,
  bakeryPrimaryCakeSummary,
  bakeryProductionBadgeTone,
  bakeryProductionLabel,
  bakeryProductionPresentation,
  hasPaymentAttention,
  isBakeryOrderSecured,
} from "@/workspaces/bakery/eligibility";
import type { BakeryBoardOrder } from "@/workspaces/bakery/types";

type BakeryOrderCardProps = {
  order: BakeryBoardOrder;
  boardDate: string;
};

export function BakeryOrderCard({ order, boardDate }: BakeryOrderCardProps) {
  const presentation = bakeryProductionPresentation({
    productionStartedAt: order.productionStartedAt,
    readyAt: order.readyAt,
  });
  const { cakeName, sizeLabel, additionalCakeCount } =
    bakeryPrimaryCakeSummary(order);
  const notesExcerpt = bakeryCustomerNotesExcerpt(order.customerNotes);
  const paymentAttention = hasPaymentAttention({
    productionStartedAt: order.productionStartedAt,
    readyAt: order.readyAt,
    status: order.status,
  });
  const fulfilment = bakeryFulfilmentCue(order.fulfilmentMethod);
  const secured = isBakeryOrderSecured(order.status);
  const attentionBadge = bakeryAttentionBadgeLabel({
    needsBakeryAttention: order.needsBakeryAttention,
    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
  });

  return (
    <article className="border-fog rounded-2xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-signal text-sm font-semibold tracking-tight">
          {formatPickupTime(order.pickupTime)}
        </p>
        <StatusBadge
          label={bakeryProductionLabel(presentation)}
          tone={bakeryProductionBadgeTone(presentation)}
        />
      </div>
      <h3 className="font-display text-ink mt-1 text-xl leading-tight tracking-tight">
        {cakeName}
      </h3>
      <p className="text-ink mt-1 text-sm">
        {sizeLabel}
        <span className="text-skyline"> · {order.guestName}</span>
      </p>
      {additionalCakeCount > 0 ? (
        <p className="text-skyline mt-1 text-sm">+{additionalCakeCount} more</p>
      ) : null}
      <p className="text-skyline mt-3 text-sm">
        {fulfilment}
        <span className="text-fog mx-1.5">·</span>
        {order.orderNumber}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <StatusBadge
          className={guestOrderStatusBadgeClassName(order.status)}
          label={guestOrderStatusLabel(order.status)}
          tone={guestOrderStatusBadgeTone(order.status)}
        />
        {!secured ? (
          <StatusBadge label="Not secured" tone="warning" />
        ) : null}
        {attentionBadge ? (
          <StatusBadge label={attentionBadge} tone="warning" />
        ) : null}
        {paymentAttention ? (
          <StatusBadge label="Payment Attention" tone="danger" />
        ) : null}
      </div>
      {notesExcerpt ? (
        <p className="text-ink mt-2 text-sm font-medium">{notesExcerpt}</p>
      ) : null}
      <Link
        className="text-signal hover:text-ink mt-4 inline-flex min-h-11 items-center text-sm font-medium transition"
        href={bakeryOrderHref(order.id, boardDate)}
      >
        Open →
      </Link>
    </article>
  );
}
