"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  dineInVenueLabel,
  type DineInVenue,
} from "@/engines/business-calendar/dine-in-hours";
import {
  CUSTOMER_PAID_ADDON_QUANTITY,
  type CustomerPaidAddonOption,
} from "@/engines/orders/customer-preorder-options";
import { workspaceFulfilmentSectionTitle } from "@/engines/orders/fulfilment";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import type {
  PreorderDraftFields,
  PreorderDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";

export type CheckoutConfirmLine = {
  key: string;
  name: string;
  sizeLabel?: string;
  quantity: number;
  linePrice: number;
};

export type CheckoutConfirmSnapshot = {
  collectionDate: string;
  collectionTime: string;
  fulfilmentLabel: string;
  fulfilmentDetails: string[];
  customerName: string;
  customerPhone: string;
  notes: string;
  lines: CheckoutConfirmLine[];
  total: number;
};

export function buildCheckoutConfirmSnapshot(input: {
  items: readonly PreorderDraftItem[];
  total: number;
  pickupDateLabel: string | null;
  fields: PreorderDraftFields;
  paidAddonOptions: readonly CustomerPaidAddonOption[];
}): CheckoutConfirmSnapshot {
  const cakeLines: CheckoutConfirmLine[] = input.items.map((item, index) => ({
    key: `${item.cakeId}:${item.sizeId}:${index}`,
    name: item.cakeName,
    sizeLabel: item.sizeLabel,
    quantity: item.quantity,
    linePrice: item.unitPrice * item.quantity,
  }));
  const selectedAddons = new Set(input.fields.paidAddonCodes);
  const addonLines: CheckoutConfirmLine[] = input.paidAddonOptions
    .filter((option) => selectedAddons.has(option.code))
    .map((option) => ({
      key: `addon:${option.code}`,
      name: option.name,
      quantity: CUSTOMER_PAID_ADDON_QUANTITY,
      linePrice: option.unitPrice * CUSTOMER_PAID_ADDON_QUANTITY,
    }));

  return {
    collectionDate: input.pickupDateLabel?.trim() || input.fields.pickupDate,
    collectionTime: formatPickupTime(input.fields.pickupTime),
    fulfilmentLabel: workspaceFulfilmentSectionTitle(
      input.fields.fulfilmentMethod,
    ),
    fulfilmentDetails: confirmFulfilmentDetails(input.fields),
    customerName: input.fields.customerName.trim(),
    customerPhone: input.fields.phone.trim(),
    notes: input.fields.notes.trim(),
    lines: [...cakeLines, ...addonLines],
    total: input.total,
  };
}

function confirmFulfilmentDetails(fields: PreorderDraftFields): string[] {
  if (fields.fulfilmentMethod === "dine_in") {
    const details: string[] = [];
    if (fields.dineInVenue === "hyphen" || fields.dineInVenue === "whitebird") {
      details.push(dineInVenueLabel(fields.dineInVenue as DineInVenue));
    }
    const guests = Number(fields.guestCount);
    if (fields.guestCount.trim()) {
      details.push(
        `${fields.guestCount} ${guests === 1 ? "guest" : "guests"}`,
      );
    }
    if (fields.reservationTime) {
      details.push(`Reservation ${formatPickupTime(fields.reservationTime)}`);
    }
    return details;
  }

  if (fields.fulfilmentMethod === "delivery") {
    const details: string[] = [];
    const address = [
      fields.addressLine1,
      fields.addressLine2,
      fields.postcode,
      fields.city,
      fields.state,
    ]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");
    if (address) details.push(address);
    if (!fields.sameAsCustomer && fields.recipientName.trim()) {
      details.push(`Recipient ${fields.recipientName.trim()}`);
    }
    return details;
  }

  return [];
}

type CheckoutConfirmPromptProps = {
  open: boolean;
  pending?: boolean;
  snapshot: CheckoutConfirmSnapshot;
  onConfirm: () => void;
  onGoBack: () => void;
};

function ConfirmBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-skyline text-[11px] font-semibold tracking-[0.14em] uppercase">
        {label}
      </h3>
      <div className="text-ink text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export function CheckoutConfirmPrompt({
  open,
  pending = false,
  snapshot,
  onConfirm,
  onGoBack,
}: CheckoutConfirmPromptProps) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || pending) return;
    confirmRef.current?.focus();
  }, [open, pending]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || pending) return;
      event.preventDefault();
      onGoBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onGoBack, open, pending]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="bg-ink/40 absolute inset-0" />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="border-fog bg-mist text-ink absolute inset-x-0 bottom-0 z-[60] mx-auto flex w-full max-w-md max-h-[min(85dvh,40rem)] flex-col overflow-hidden rounded-t-2xl border shadow-lg md:top-1/2 md:bottom-auto md:left-1/2 md:right-auto md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
        role="dialog"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5">
          <p className="text-signal text-[11px] font-semibold tracking-[0.18em] uppercase">
            Whitebird
          </p>
          <h2
            className="font-display text-ink mt-1 text-2xl tracking-tight"
            id={titleId}
          >
            Confirm Your Order
          </h2>

          <div className="mt-5 space-y-5">
            <ConfirmBlock label="Collection">
              <p className="font-medium">{snapshot.collectionDate}</p>
              {snapshot.collectionTime ? (
                <p className="text-skyline">{snapshot.collectionTime}</p>
              ) : null}
            </ConfirmBlock>

            <ConfirmBlock label="Your Order">
              <ul className="divide-fog divide-y">
                {snapshot.lines.map((line) => (
                  <li
                    className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0"
                    key={line.key}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{line.name}</p>
                      <p className="text-skyline mt-0.5">
                        {line.sizeLabel
                          ? `${line.sizeLabel} · Qty ${line.quantity}`
                          : `Qty ${line.quantity}`}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium tabular-nums">
                      {formatRm(line.linePrice)}
                    </p>
                  </li>
                ))}
              </ul>
            </ConfirmBlock>

            <div className="border-fog flex items-baseline justify-between gap-3 border-t pt-3">
              <p className="text-ink text-sm font-medium">Total</p>
              <p className="font-display text-ink text-xl tracking-tight tabular-nums">
                {formatRm(snapshot.total)}
              </p>
            </div>

            <ConfirmBlock label="Customer">
              <p className="font-medium">{snapshot.customerName}</p>
              <p className="text-skyline">{snapshot.customerPhone}</p>
            </ConfirmBlock>

            <ConfirmBlock label="Fulfilment">
              <p className="font-medium">{snapshot.fulfilmentLabel}</p>
              {snapshot.fulfilmentDetails.map((detail) => (
                <p className="text-skyline" key={detail}>
                  {detail}
                </p>
              ))}
            </ConfirmBlock>

            {snapshot.notes ? (
              <ConfirmBlock label="Notes">
                <p className="whitespace-pre-wrap">{snapshot.notes}</p>
              </ConfirmBlock>
            ) : null}
          </div>
        </div>

        <div className="border-fog shrink-0 border-t px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-5">
          <p className="text-ink text-sm font-medium">
            Would you like to confirm this order?
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <button
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-medium transition disabled:opacity-60"
              disabled={pending}
              onClick={onConfirm}
              ref={confirmRef}
              type="button"
            >
              {pending ? "Submitting…" : "Confirm Order"}
            </button>
            <button
              className="text-ink hover:text-skyline inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-medium disabled:opacity-60"
              disabled={pending}
              onClick={onGoBack}
              type="button"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
