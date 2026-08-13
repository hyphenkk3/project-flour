import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatLongBusinessDate } from "@/lib/dates";
import type { BakeryWorkspaceCapabilities } from "@/engines/bakery/capabilities";
import {
  formatPickupTime,
  guestOrderStatusBadgeClassName,
  guestOrderStatusBadgeTone,
  guestOrderStatusLabel,
} from "@/workspaces/owner/orders/labels";
import { BakeryPackingChecklist } from "@/workspaces/bakery/BakeryPackingChecklist";
import { BakeryProductionActions } from "@/workspaces/bakery/BakeryProductionActions";
import { bakeryDateNavHref } from "@/workspaces/bakery/date";
import {
  BAKERY_EARLY_PICKUP_DETAIL,
  bakeryAttentionBadgeLabel,
  bakeryFulfilmentCue,
  bakeryProductionBadgeTone,
  bakeryProductionLabel,
  bakeryProductionPresentation,
  bakeryStartSurface,
  deriveBakeryPackingReminders,
  hasPaymentAttention,
  isBakeryOrderSecured,
  isEarlyPickupAttention,
  isWaitingCustomerConfirmation,
} from "@/workspaces/bakery/eligibility";
import type { BakeryBoardOrder } from "@/workspaces/bakery/types";

type BakeryOrderDetailProps = {
  order: BakeryBoardOrder;
  boardDate: string;
  capabilities: BakeryWorkspaceCapabilities;
};

export function BakeryOrderDetail({
  order,
  boardDate,
  capabilities,
}: BakeryOrderDetailProps) {
  const presentation = bakeryProductionPresentation({
    productionStartedAt: order.productionStartedAt,
    readyAt: order.readyAt,
  });
  const paymentAttention = hasPaymentAttention({
    productionStartedAt: order.productionStartedAt,
    readyAt: order.readyAt,
    status: order.status,
  });
  const packing = deriveBakeryPackingReminders(order);
  const fulfilment = bakeryFulfilmentCue(order.fulfilmentMethod);
  const secured = isBakeryOrderSecured(order.status);
  const surface = bakeryStartSurface({
    presentation,
    status: order.status,
    canStartProduction: capabilities.canStartProduction,
    canUndoStart: capabilities.canUndoStart,
  });
  const waitingConfirmation = isWaitingCustomerConfirmation(order.status);
  const earlyPickup = isEarlyPickupAttention(order.pickupDate, order.pickupTime);
  const attentionBadge = bakeryAttentionBadgeLabel({
    needsBakeryAttention: order.needsBakeryAttention,
    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
  });

  return (
    <>
      <main className="mx-auto w-full max-w-5xl px-5 pt-5 pb-28 sm:px-8 sm:pt-8">
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
          href={bakeryDateNavHref(boardDate)}
        >
          ← Board
        </Link>

        <header className="mt-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={bakeryProductionLabel(presentation)}
              tone={bakeryProductionBadgeTone(presentation)}
            />
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
          <div>
            <h1 className="font-display text-ink text-4xl tracking-tight sm:text-5xl">
              {order.cakeLines[0]?.cakeName ?? "Order"}
            </h1>
            <p className="text-skyline mt-2 text-base sm:text-lg">
              {order.guestName}
              <span className="text-fog mx-1.5">·</span>
              {order.orderNumber}
            </p>
          </div>
        </header>

        {!secured && waitingConfirmation ? (
          <p className="border-status-warning/20 bg-status-warning-soft text-status-warning mt-6 rounded-2xl border px-4 py-3 text-sm leading-relaxed">
            Not secured — waiting for customer confirmation.
          </p>
        ) : null}

        {!secured && order.status === "awaiting_payment" && !paymentAttention ? (
          <p className="border-status-warning/20 bg-status-warning-soft text-status-warning mt-6 rounded-2xl border px-4 py-3 text-sm leading-relaxed">
            Not secured — payment is still pending.
          </p>
        ) : null}

        {paymentAttention ? (
          <p className="border-status-danger/20 bg-status-danger-soft text-status-danger mt-6 rounded-2xl border px-4 py-3 text-sm leading-relaxed">
            Payment Attention — balance needs Owner resolution. Bakery keeps
            this order visible because production has already begun. Do not
            chase payment from Bakery.
          </p>
        ) : null}

        <div className="mt-8">
          <div className="mx-auto max-w-2xl space-y-4">
            <section className="border-fog rounded-2xl border bg-white p-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-skyline">Fulfilment</dt>
                  <dd className="text-ink mt-1 font-medium">{fulfilment}</dd>
                </div>
                <div>
                  <dt className="text-skyline">Date</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {formatLongBusinessDate(order.pickupDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Time</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {formatPickupTime(order.pickupTime)}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Production</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {bakeryProductionLabel(presentation)}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Order status</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {guestOrderStatusLabel(order.status)}
                    {!secured ? " · Not secured" : null}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="border-fog rounded-2xl border bg-white p-5">
              <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
                Cakes
              </h2>
              <ul className="mt-3 space-y-3">
                {order.cakeLines.map((line) => (
                  <li key={line.id} className="text-ink text-sm">
                    <p className="font-medium">{line.cakeName}</p>
                    <p className="text-skyline mt-0.5">
                      {line.sizeLabel}
                      {line.quantity > 1 ? ` · ×${line.quantity}` : null}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <BakeryPackingChecklist items={packing} />

            {order.customerNotes?.trim() ? (
              <section className="border-fog rounded-2xl border bg-white p-5">
                <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
                  Customer notes
                </h2>
                <p className="text-ink mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {order.customerNotes.trim()}
                </p>
              </section>
            ) : null}

            {earlyPickup ? (
              <section className="border-status-warning/20 bg-status-warning-soft rounded-2xl border p-5">
                <h2 className="text-status-warning text-xs font-semibold tracking-wide uppercase">
                  Early pickup
                </h2>
                <p className="text-ink mt-2 text-sm leading-relaxed">
                  {BAKERY_EARLY_PICKUP_DETAIL}
                </p>
              </section>
            ) : null}

            {order.needsBakeryAttention && order.bakeryAttentionNote?.trim() ? (
              <section className="border-status-warning/20 bg-status-warning-soft rounded-2xl border p-5">
                <h2 className="text-status-warning text-xs font-semibold tracking-wide uppercase">
                  Bakery Attention
                </h2>
                <p className="text-ink mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {order.bakeryAttentionNote.trim()}
                </p>
              </section>
            ) : order.needsBakeryAttention ? (
              <section className="border-status-warning/20 bg-status-warning-soft rounded-2xl border p-5">
                <h2 className="text-status-warning text-xs font-semibold tracking-wide uppercase">
                  Bakery Attention
                </h2>
                <p className="text-ink mt-2 text-sm">Flagged by Owner.</p>
              </section>
            ) : null}
          </div>
        </div>
      </main>

      <BakeryProductionActions orderId={order.id} surface={surface} />
    </>
  );
}
