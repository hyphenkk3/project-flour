"use client";

import { FormField, FormInput } from "@/components/ui/form";
import { OwnerPickupFields } from "@/components/ui/OwnerPickupFields";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import {
  OWNER_CREATE_FULFILMENT_OPTIONS,
  RECIPIENT_NOTIFY_OPTIONS,
  copyCustomerToRecipientDraft,
  markRecipientDivergedFromCustomer,
  type DeliveryCreateDraft,
  type OwnerCreateFulfilmentMethod,
} from "@/engines/orders/fulfilment";
import type { RecipientNotifyPreference } from "@/types/storefront";

type OrderFulfilmentCreateFieldsProps = {
  method: OwnerCreateFulfilmentMethod;
  onMethodChange: (method: OwnerCreateFulfilmentMethod) => void;
  delivery: DeliveryCreateDraft;
  onDeliveryChange: (next: DeliveryCreateDraft) => void;
  customerName: string;
  customerPhone: string;
  /** Owner free clock vs website slots. */
  scheduleMode?: "owner" | "slots";
  defaultDate?: string;
  defaultTime?: string;
  onDateChange?: (date: string) => void;
};

export function OrderFulfilmentCreateFields({
  method,
  onMethodChange,
  delivery,
  onDeliveryChange,
  customerName,
  customerPhone,
  scheduleMode = "owner",
  defaultDate,
  defaultTime,
  onDateChange,
}: OrderFulfilmentCreateFieldsProps) {
  const isDelivery = method === "delivery";
  const showNotifyChoice = !delivery.sameAsCustomer;
  const dateLabel = isDelivery ? "Delivery date" : "Pickup date";
  const timeLabel = isDelivery ? "Delivery time" : "Pickup time";

  function patchDelivery(patch: Partial<DeliveryCreateDraft>) {
    let next: DeliveryCreateDraft = { ...delivery, ...patch };
    if ("recipientName" in patch || "recipientPhone" in patch) {
      next = markRecipientDivergedFromCustomer(next);
      if ("recipientName" in patch) {
        next.recipientName = String(patch.recipientName ?? "");
      }
      if ("recipientPhone" in patch) {
        next.recipientPhone = String(patch.recipientPhone ?? "");
      }
    }
    onDeliveryChange(next);
  }

  return (
    <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
      <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
        Fulfilment
      </h2>

      <fieldset className="space-y-2">
        <legend className="text-ink text-sm font-medium">Method</legend>
        <div
          aria-label="Fulfilment method"
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
        >
          {OWNER_CREATE_FULFILMENT_OPTIONS.map((option) => {
            const selected = method === option.value;
            return (
              <button
                aria-checked={selected}
                className={
                  selected
                    ? "border-ink bg-ink text-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-4 text-sm font-medium"
                    : "border-fog text-ink hover:border-skyline hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium"
                }
                key={option.value}
                onClick={() => onMethodChange(option.value)}
                role="radio"
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {scheduleMode === "slots" ? (
        <PickupSlotFields
          dateLabel={dateLabel}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          onDateChange={onDateChange}
          timeLabel={timeLabel}
        />
      ) : (
        <OwnerPickupFields
          dateLabel={dateLabel}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          onDateChange={onDateChange}
          timeLabel={timeLabel}
        />
      )}

      {isDelivery ? (
        <div className="border-fog space-y-4 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-ink text-xs font-semibold tracking-[0.12em] uppercase">
              Delivery details
            </h3>
            <button
              className="text-signal text-sm font-medium"
              onClick={() =>
                onDeliveryChange(
                  copyCustomerToRecipientDraft(delivery, {
                    name: customerName,
                    phone: customerPhone,
                  }),
                )
              }
              type="button"
            >
              Same as Customer
            </button>
          </div>

          <FormField htmlFor="delivery_recipient_name" label="Recipient name">
            <FormInput
              id="delivery_recipient_name"
              onChange={(event) =>
                patchDelivery({ recipientName: event.target.value })
              }
              required
              value={delivery.recipientName}
            />
          </FormField>
          <FormField htmlFor="delivery_recipient_phone" label="Recipient phone">
            <FormInput
              id="delivery_recipient_phone"
              onChange={(event) =>
                patchDelivery({ recipientPhone: event.target.value })
              }
              required
              type="tel"
              value={delivery.recipientPhone}
            />
          </FormField>

          <FormField htmlFor="delivery_address_line_1" label="Address line 1">
            <FormInput
              id="delivery_address_line_1"
              onChange={(event) =>
                patchDelivery({ addressLine1: event.target.value })
              }
              required
              value={delivery.addressLine1}
            />
          </FormField>
          <FormField
            htmlFor="delivery_address_line_2"
            label="Address line 2 (optional)"
          >
            <FormInput
              id="delivery_address_line_2"
              onChange={(event) =>
                patchDelivery({ addressLine2: event.target.value })
              }
              value={delivery.addressLine2}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField htmlFor="delivery_postcode" label="Postcode">
              <FormInput
                id="delivery_postcode"
                onChange={(event) =>
                  patchDelivery({ postcode: event.target.value })
                }
                required
                value={delivery.postcode}
              />
            </FormField>
          </div>

          {showNotifyChoice ? (
            <fieldset className="space-y-2">
              <legend className="text-ink text-sm font-medium">
                Recipient notification
              </legend>
              <div
                aria-label="Recipient notification preference"
                className="grid gap-2 sm:grid-cols-2"
                role="radiogroup"
              >
                {RECIPIENT_NOTIFY_OPTIONS.map((option) => {
                  const selected =
                    delivery.recipientNotifyPreference === option.value;
                  return (
                    <button
                      aria-checked={selected}
                      className={
                        selected
                          ? "border-ink bg-ink text-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-3 text-sm font-medium"
                          : "border-fog text-ink hover:border-skyline hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium"
                      }
                      key={option.value}
                      onClick={() =>
                        patchDelivery({
                          recipientNotifyPreference:
                            option.value as RecipientNotifyPreference,
                        })
                      }
                      role="radio"
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <p className="text-skyline text-xs">
              Recipient matches Customer — Whitebird will communicate with the
              ordering customer about this delivery.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
