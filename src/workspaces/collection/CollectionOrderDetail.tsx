import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
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
  collectionDeskAttention,
  collectionDeskPresentation,
  collectionHandoffSurface,
  hasCollectionPaymentAttention,
  isCollectionCompleteDineInEligible,
  isCollectionDineInMethod,
  isCollectionMarkCollectedEligible,
  isCollectionOrderSecured,
  isCollectionUndoCollectedEligible,
  isCollectionUndoDineInEligible,
  type CollectionBoardTab,
} from "@/workspaces/collection/eligibility";
import { deriveCollectionPackingReminders } from "@/workspaces/collection/packing";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";

type CollectionOrderDetailProps = {
  order: CollectionBoardOrder;
  boardDate: string;
  tab?: CollectionBoardTab;
  capabilities: CollectionWorkspaceCapabilities;
};

export function CollectionOrderDetail({
  order,
  boardDate,
  tab = "ready",
  capabilities,
}: CollectionOrderDetailProps) {
  const presentation = collectionDeskPresentation({
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
    deliveredAt: order.deliveredAt,
    fulfilmentMethod: order.fulfilmentMethod,
  });
  const desk = collectionDeskAttention({
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
    deliveredAt: order.deliveredAt,
    fulfilmentMethod: order.fulfilmentMethod,
    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
    now: new Date(),
  });
  const secured = isCollectionOrderSecured(order.status);
  const paymentAttention = hasCollectionPaymentAttention({
    readyAt: order.readyAt,
    status: order.status,
  });
  const packing = deriveCollectionPackingReminders(order);
  const dineIn = isCollectionDineInMethod(order.fulfilmentMethod);
  const surface = collectionHandoffSurface({
    presentation,
    canMarkCollected: capabilities.canMarkCollected,
    canUndoCollected: capabilities.canUndoCollected,
    markCollectedEligible: dineIn
      ? isCollectionCompleteDineInEligible({
          readyAt: order.readyAt,
          pickedUpAt: order.pickedUpAt,
          fulfilmentMethod: order.fulfilmentMethod,
          status: order.status,
        })
      : isCollectionMarkCollectedEligible({
          readyAt: order.readyAt,
          pickedUpAt: order.pickedUpAt,
          fulfilmentMethod: order.fulfilmentMethod,
          status: order.status,
        }),
    undoCollectedEligible: dineIn
      ? isCollectionUndoDineInEligible({
          pickedUpAt: order.pickedUpAt,
          fulfilmentMethod: order.fulfilmentMethod,
        })
      : isCollectionUndoCollectedEligible({
          pickedUpAt: order.pickedUpAt,
          fulfilmentMethod: order.fulfilmentMethod,
        }),
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-3 pb-28 sm:px-8 sm:pt-4 sm:pb-12">
      <Link
        className="text-skyline hover:text-ink inline-flex min-h-9 items-center text-sm font-medium transition"
        href={collectionDateNavHref(boardDate, tab)}
      >
        ← Board
      </Link>

      <header className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={desk.label}
            tone={desk.tone}
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
          <h1 className="font-display text-ink text-3xl tracking-tight sm:text-4xl">
            {order.guestName}
          </h1>
          <p className="text-skyline mt-1 text-sm sm:text-base">
            {order.cakeLines[0]?.cakeName ?? "Order"}
            <span className="text-fog mx-1.5">·</span>
            {order.orderNumber}
          </p>
        </div>
      </header>

      {paymentAttention ? (
        <p className="border-status-danger/20 bg-status-danger-soft text-status-danger mt-4 rounded-2xl border px-4 py-2.5 text-sm leading-relaxed">
          Payment Attention — balance still needs Owner resolution. Collection
          may complete handoff; do not take or correct payment here.
        </p>
      ) : null}

      {!secured && order.status === "awaiting_payment" && !paymentAttention ? (
        <p className="border-status-warning/20 bg-status-warning-soft text-status-warning mt-4 rounded-2xl border px-4 py-2.5 text-sm leading-relaxed">
          Not secured — payment is still pending. Collection does not change
          payment status.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <section className="border-fog rounded-2xl border bg-white px-4 py-3.5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-skyline">Fulfilment</dt>
              <dd className="text-ink mt-0.5 font-medium">
                {dineIn
                  ? "Dine-in"
                  : order.fulfilmentMethod === "delivery"
                    ? "Delivery"
                    : "Pickup"}
              </dd>
            </div>
            <div>
              <dt className="text-skyline">Date</dt>
              <dd className="text-ink mt-0.5 font-medium">
                {formatLongBusinessDate(order.pickupDate)}
              </dd>
            </div>
            {dineIn ? (
              <>
                <div>
                  <dt className="text-skyline">Reservation</dt>
                  <dd className="text-ink mt-0.5 font-medium">
                    {order.dineIn?.reservationTime
                      ? formatPickupTime(order.dineIn.reservationTime)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Cake serving</dt>
                  <dd className="text-ink mt-0.5 font-medium">
                    {formatPickupTime(order.pickupTime)}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Venue</dt>
                  <dd className="text-ink mt-0.5 font-medium">
                    {order.dineIn
                      ? dineInVenueLabel(order.dineIn.venue)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Guests</dt>
                  <dd className="text-ink mt-0.5 font-medium">
                    {order.dineIn?.guestCount ?? "—"}
                  </dd>
                </div>
                {order.guestPhone ? (
                  <div>
                    <dt className="text-skyline">Phone</dt>
                    <dd className="text-ink mt-0.5 font-medium">
                      {order.guestPhone}
                    </dd>
                  </div>
                ) : null}
              </>
            ) : (
              <div>
                <dt className="text-skyline">Time</dt>
                <dd className="text-ink mt-0.5 font-medium">
                  {formatPickupTime(order.pickupTime)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-skyline">Desk</dt>
              <dd
                className={
                  desk.overdue
                    ? "text-status-warning mt-0.5 font-medium"
                    : "text-ink mt-0.5 font-medium"
                }
              >
                {desk.label}
              </dd>
            </div>
          </dl>
        </section>

        <section className="border-fog rounded-2xl border bg-white px-4 py-3.5">
          <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
            Cakes
          </h2>
          <ul className="mt-2 space-y-2">
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

        {order.dineIn?.reservationNote?.trim() ? (
          <section className="border-fog rounded-2xl border bg-white px-4 py-3.5">
            <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
              Reservation note
            </h2>
            <p className="text-ink mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
              {order.dineIn.reservationNote.trim()}
            </p>
          </section>
        ) : null}

        {order.customerNotes?.trim() ? (
          <section className="border-fog rounded-2xl border bg-white px-4 py-3.5">
            <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
              Customer notes
            </h2>
            <p className="text-ink mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
              {order.customerNotes.trim()}
            </p>
          </section>
        ) : null}

        <CollectionHandoffActions
          canMarkCollected={surface.canMarkCollected}
          canUndoCollected={surface.canUndoCollected}
          completeLabel={dineIn ? "Complete Dine-in" : "Mark Collected"}
          undoLabel={dineIn ? "Undo Complete" : "Undo Collected"}
          orderId={order.id}
        />

        <CollectionPackingChecklist items={packing} />
      </div>
    </main>
  );
}
