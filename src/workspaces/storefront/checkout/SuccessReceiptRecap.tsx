import { formatDdMmYyyy } from "@/lib/dates";
import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import {
  workspaceFulfilmentSectionTitle,
  workspaceScheduleDateLabel,
  workspaceScheduleTimeLabel,
} from "@/engines/orders/fulfilment";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  ReceiptPhotoBox,
  SuccessReceiptPhotoController,
} from "@/workspaces/storefront/checkout/SuccessReceiptPhotos";
import { SuccessRecapPerfProbe } from "@/workspaces/storefront/checkout/SuccessRecapPerfProbe";
import type { GuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";
import {
  DELIVERY_FEE_PENDING_RECEIPT_EXPLANATION,
  receiptAmountPresentation,
} from "@/engines/orders/receipt-amount-presentation";

export function SuccessReceiptRecap({
  orderId,
  receipt,
}: {
  orderId?: string;
  receipt: GuestPreorderReceipt;
}) {
  const amountPresentation = receiptAmountPresentation(receipt);

  return (
    <SuccessReceiptPhotoController orderId={orderId} receipt={receipt}>
      <SuccessRecapPerfProbe
        hasAdjustment={receipt.adjustments.length > 0}
        hasDate={Boolean(receipt.pickupDate)}
        hasItem={receipt.items.length > 0}
        hasOrderNumber={Boolean(receipt.orderNumber)}
        hasTotal={Number.isFinite(receipt.total)}
      />
      <section className="border-fog mt-8 border-t pt-8 text-left">
        <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
          Order recap
        </p>
        <ul className="mt-3 space-y-3">
          {receipt.items.map((item) => (
            <li className="flex items-start gap-3" key={item.key}>
              <ReceiptPhotoBox item={item} />
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm font-medium">{item.cakeName}</p>
                <p className="text-skyline text-sm">
                  {item.sizeLabel} × {item.quantity}
                  {item.unitPrice != null
                    ? ` · ${formatRm(item.unitPrice * item.quantity)}`
                    : ""}
                </p>
              </div>
            </li>
          ))}
          {receipt.paidAddons.map((addon) => (
            <li className="text-ink text-sm" key={addon.key}>
              <span className="font-medium">{addon.name}</span>
              <span className="text-skyline">
                {" "}
                · × {addon.quantity} ·{" "}
                {formatRm(addon.unitPrice * addon.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="border-fog mt-4 space-y-2 border-t pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-skyline">Fulfilment</dt>
            <dd className="text-ink text-right font-medium">
              {workspaceFulfilmentSectionTitle(receipt.fulfilmentMethod)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-skyline">
              {workspaceScheduleDateLabel(receipt.fulfilmentMethod)}
            </dt>
            <dd className="text-ink text-right font-medium">
              {formatDdMmYyyy(receipt.pickupDate)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-skyline">
              {workspaceScheduleTimeLabel(receipt.fulfilmentMethod)}
            </dt>
            <dd className="text-ink text-right font-medium">
              {formatPickupTime(receipt.pickupTime)}
            </dd>
          </div>
          {receipt.fulfilmentMethod === "dine_in" && receipt.reservationTime ? (
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Dine-in reservation time</dt>
              <dd className="text-ink text-right font-medium">
                {formatPickupTime(receipt.reservationTime)}
              </dd>
            </div>
          ) : null}
          {receipt.fulfilmentMethod === "dine_in" && receipt.dineInVenue ? (
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Venue</dt>
              <dd className="text-ink text-right font-medium">
                {dineInVenueLabel(receipt.dineInVenue)}
              </dd>
            </div>
          ) : null}
          {receipt.fulfilmentMethod === "dine_in" &&
          receipt.guestCount != null ? (
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Guests</dt>
              <dd className="text-ink text-right font-medium">
                {receipt.guestCount}{" "}
                {receipt.guestCount === 1 ? "guest" : "guests"}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-skyline">{amountPresentation.amountLabel}</dt>
            <dd className="font-display text-ink text-right text-xl tracking-tight tabular-nums">
              {formatRm(receipt.total)}
            </dd>
          </div>
          {amountPresentation.processingFeeAmount != null ? (
            <div className="flex justify-end">
              <dt className="sr-only">Processing fee included</dt>
              <dd className="text-skyline text-right text-xs">
                Includes {formatRm(amountPresentation.processingFeeAmount)}{" "}
                processing fee
              </dd>
            </div>
          ) : null}
          {amountPresentation.deliveryFeePending ? (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-skyline">Delivery fee</dt>
                <dd className="text-skyline text-right">To be confirmed</dd>
              </div>
              <div>
                <dt className="sr-only">Delivery amount clarification</dt>
                <dd className="text-skyline text-right text-xs">
                  {DELIVERY_FEE_PENDING_RECEIPT_EXPLANATION}
                </dd>
              </div>
            </>
          ) : null}
          {receipt.notes ? (
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Notes</dt>
              <dd className="text-ink text-right font-medium whitespace-pre-wrap">
                {receipt.notes}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
    </SuccessReceiptPhotoController>
  );
}
