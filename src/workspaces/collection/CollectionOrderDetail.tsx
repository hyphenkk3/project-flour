import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatLongBusinessDate } from "@/lib/dates";
import type { CollectionWorkspaceCapabilities } from "@/engines/collection/capabilities";
import {
  formatPickupTime,
  guestOrderStatusBadgeClassName,
  guestOrderStatusBadgeTone,
  guestOrderStatusLabel,
} from "@/workspaces/owner/orders/labels";
import { CollectionHandoffActions } from "@/workspaces/collection/CollectionHandoffActions";
import { CollectionPackingChecklist } from "@/workspaces/collection/CollectionPackingChecklist";
import { collectionDateNavHref } from "@/workspaces/collection/date";
import {
  collectionDeskBadgeTone,
  collectionDeskLabel,
  collectionDeskPresentation,
  collectionHandoffSurface,
  hasCollectionPaymentAttention,
  isCollectionMarkCollectedEligible,
  isCollectionOrderSecured,
  isCollectionUndoCollectedEligible,
} from "@/workspaces/collection/eligibility";
import { deriveCollectionPackingReminders } from "@/workspaces/collection/packing";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";

type CollectionOrderDetailProps = {
  order: CollectionBoardOrder;
  boardDate: string;
  capabilities: CollectionWorkspaceCapabilities;
};

export function CollectionOrderDetail({
  order,
  boardDate,
  capabilities,
}: CollectionOrderDetailProps) {
  const presentation = collectionDeskPresentation({
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
  });
  const secured = isCollectionOrderSecured(order.status);
  const paymentAttention = hasCollectionPaymentAttention({
    readyAt: order.readyAt,
    status: order.status,
  });
  const packing = deriveCollectionPackingReminders(order);
  const surface = collectionHandoffSurface({
    presentation,
    canMarkCollected: capabilities.canMarkCollected,
    canUndoCollected: capabilities.canUndoCollected,
    markCollectedEligible: isCollectionMarkCollectedEligible({
      readyAt: order.readyAt,
      pickedUpAt: order.pickedUpAt,
      fulfilmentMethod: order.fulfilmentMethod,
      status: order.status,
    }),
    undoCollectedEligible: isCollectionUndoCollectedEligible({
      pickedUpAt: order.pickedUpAt,
      fulfilmentMethod: order.fulfilmentMethod,
    }),
  });

  return (
    <>
      <main className="mx-auto w-full max-w-3xl px-5 pt-5 pb-28 sm:px-8 sm:pt-8">
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
          href={collectionDateNavHref(boardDate)}
        >
          ← Board
        </Link>

        <header className="mt-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={collectionDeskLabel(presentation)}
              tone={collectionDeskBadgeTone(presentation)}
            />
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
          <div>
            <h1 className="font-display text-ink text-4xl tracking-tight sm:text-5xl">
              {order.guestName}
            </h1>
            <p className="text-skyline mt-2 text-base sm:text-lg">
              {order.cakeLines[0]?.cakeName ?? "Order"}
              <span className="text-fog mx-1.5">·</span>
              {order.orderNumber}
            </p>
          </div>
        </header>

        {paymentAttention ? (
          <p className="border-status-danger/20 bg-status-danger-soft text-status-danger mt-6 rounded-2xl border px-4 py-3 text-sm leading-relaxed">
            Payment Attention — balance still needs Owner resolution. Collection
            may complete handoff; do not take or correct payment here.
          </p>
        ) : null}

        {!secured && order.status === "awaiting_payment" && !paymentAttention ? (
          <p className="border-status-warning/20 bg-status-warning-soft text-status-warning mt-6 rounded-2xl border px-4 py-3 text-sm leading-relaxed">
            Not secured — payment is still pending. Collection does not change
            payment status.
          </p>
        ) : null}

        <div className="mt-8 space-y-4">
          <section className="border-fog rounded-2xl border bg-white p-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-skyline">Fulfilment</dt>
                <dd className="text-ink mt-1 font-medium">Pickup</dd>
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
                <dt className="text-skyline">Desk</dt>
                <dd className="text-ink mt-1 font-medium">
                  {collectionDeskLabel(presentation)}
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

          {order.customerNotes?.trim() ? (
            <section className="border-fog rounded-2xl border bg-white p-5">
              <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
                Customer notes
              </h2>
              <p className="text-ink mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                {order.customerNotes.trim()}
              </p>
            </section>
          ) : null}

          <CollectionPackingChecklist items={packing} />
        </div>
      </main>

      <CollectionHandoffActions
        canMarkCollected={surface.canMarkCollected}
        canUndoCollected={surface.canUndoCollected}
        orderId={order.id}
      />
    </>
  );
}
