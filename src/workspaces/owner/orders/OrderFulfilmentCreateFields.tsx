import { FormField, FormInput, FormTextarea } from "@/components/ui/form";
import { DineInVenuePartyFields } from "@/components/ui/DineInVenuePartyFields";
import { OwnerPickupFields } from "@/components/ui/OwnerPickupFields";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import { DINE_IN_VENUES } from "@/engines/business-calendar/dine-in-hours";
import {
  OWNER_CREATE_FULFILMENT_OPTIONS,
  RECIPIENT_NOTIFY_OPTIONS,
  copyCustomerToRecipientDraft,
  markRecipientDivergedFromCustomer,
  type DeliveryCreateDraft,
  type OwnerCreateFulfilmentMethod,
} from "@/engines/orders/fulfilment";
import type { AssistedDineInDraft } from "@/engines/orders/assisted-fulfilment";
import {
  LATE_ORDER_EDIT_SECTION_EXCLUDED,
  LATE_ORDER_EDIT_SECTION_PICKUP_INCLUDED,
} from "@/engines/operations/approval-ux";
import type { RecipientNotifyPreference } from "@/types/storefront";

type OrderFulfilmentCreateFieldsProps = {
  method: OwnerCreateFulfilmentMethod | "dine_in";
  onMethodChange: (method: OwnerCreateFulfilmentMethod | "dine_in") => void;
  allowDineIn?: boolean;
  dineIn?: AssistedDineInDraft;
  onDineInChange?: (next: AssistedDineInDraft) => void;
  delivery: DeliveryCreateDraft;
  onDeliveryChange: (next: DeliveryCreateDraft) => void;
  customerName: string;
  customerPhone: string;
  /** Owner free clock vs website slots. */
  scheduleMode?: "owner" | "slots";
  defaultDate?: string;
  defaultTime?: string;
  /** Keep an unchanged historical date valid while new dates retain the minimum. */
  minDate?: string;
  onDateChange?: (date: string) => void;
  onTimeChange?: (time: string) => void;
  /** CO late-edit cutoff: muted scope cues near method vs pickup. */
  lateEditCutoffHints?: boolean;
  hoursSnapshot?: OperatingHoursSnapshot;
};

export function OrderFulfilmentCreateFields({
  method,
  onMethodChange,
  allowDineIn = false,
  dineIn,
  onDineInChange,
  delivery,
  onDeliveryChange,
  customerName,
  customerPhone,
  scheduleMode = "owner",
  defaultDate,
  defaultTime,
  minDate,
  onDateChange,
  onTimeChange,
  lateEditCutoffHints = false,
  hoursSnapshot = OPERATING_HOURS_SEED,
}: OrderFulfilmentCreateFieldsProps) {
  const isDelivery = method === "delivery";
  const isDineIn = method === "dine_in";
  const showNotifyChoice = !delivery.sameAsCustomer;
  const dateLabel = isDineIn
    ? "Dine-in date"
    : isDelivery
      ? "Delivery date"
      : "Pickup date";
  const timeLabel = isDineIn
    ? "Cake serving time"
    : isDelivery
      ? "Delivery time"
      : "Pickup time";
  const fulfilmentOptions = allowDineIn
    ? [
        ...OWNER_CREATE_FULFILMENT_OPTIONS,
        { value: "dine_in" as const, label: "Dine-in" },
      ]
    : OWNER_CREATE_FULFILMENT_OPTIONS;

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
        {lateEditCutoffHints ? (
          <p className="text-skyline text-sm">
            {LATE_ORDER_EDIT_SECTION_EXCLUDED}
          </p>
        ) : null}
        <div
          aria-label="Fulfilment method"
          className={`grid gap-2 ${allowDineIn ? "grid-cols-3" : "grid-cols-2"}`}
          role="radiogroup"
        >
          {fulfilmentOptions.map((option) => {
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
                onClick={() =>
                  onMethodChange(
                    option.value as OwnerCreateFulfilmentMethod | "dine_in",
                  )
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

      {lateEditCutoffHints ? (
        <p className="text-skyline text-sm">
          {LATE_ORDER_EDIT_SECTION_PICKUP_INCLUDED}
        </p>
      ) : null}

      {isDineIn ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="pickup_date" label={dateLabel}>
            <FormInput
              defaultValue={defaultDate}
              id="pickup_date"
              name="pickup_date"
              onChange={(event) => onDateChange?.(event.target.value)}
              required
              type="date"
            />
          </FormField>
          <FormField
            help="Choose the cake serving time. It must be within 1 hour of the reservation and during venue hours."
            htmlFor="pickup_time"
            label={timeLabel}
          >
            <FormInput
              defaultValue={defaultTime}
              id="pickup_time"
              name="pickup_time"
              onChange={(event) => onTimeChange?.(event.target.value)}
              required
              step={15 * 60}
              type="time"
            />
          </FormField>
        </div>
      ) : scheduleMode === "slots" ? (
        <PickupSlotFields
          dateLabel={dateLabel}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          hoursSnapshot={hoursSnapshot}
          minDate={minDate}
          onDateChange={onDateChange}
          onTimeChange={onTimeChange}
          timeLabel={timeLabel}
        />
      ) : (
        <OwnerPickupFields
          dateLabel={dateLabel}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          hoursSnapshot={hoursSnapshot}
          onDateChange={onDateChange}
          onTimeChange={onTimeChange}
          timeLabel={timeLabel}
        />
      )}

      {isDineIn && dineIn && onDineInChange ? (
        <div className="border-fog space-y-4 rounded-lg border p-3">
          <FormField
            help="When the table reservation starts."
            htmlFor="reservation_time"
            label="Dine-in reservation time"
          >
            <FormInput
              id="reservation_time"
              name="reservation_time"
              onChange={(event) =>
                onDineInChange({
                  ...dineIn,
                  reservationTime: event.target.value,
                })
              }
              required
              step={15 * 60}
              type="time"
              value={dineIn.reservationTime}
            />
          </FormField>
          <DineInVenuePartyFields
            onChange={(party) =>
              onDineInChange({
                ...dineIn,
                venue: party.venue,
                adultCount: party.adultCount,
                kidCount: party.kidCount,
                toddlerCount: party.toddlerCount,
                whitebirdSplitSeatingAcknowledged:
                  party.whitebirdSplitSeatingAcknowledged,
                guestCount: String(
                  Number(party.adultCount || 0) +
                    Number(party.kidCount || 0) +
                    Number(party.toddlerCount || 0),
                ),
              })
            }
            requireAcknowledgement={false}
            value={{
              venue: dineIn.venue,
              adultCount: dineIn.adultCount,
              kidCount: dineIn.kidCount,
              toddlerCount: dineIn.toddlerCount,
              whitebirdSplitSeatingAcknowledged:
                dineIn.whitebirdSplitSeatingAcknowledged,
            }}
            venues={[...DINE_IN_VENUES]}
          />
          <input
            name="whitebird_split_seating_acknowledged"
            type="hidden"
            value={dineIn.whitebirdSplitSeatingAcknowledged ? "1" : ""}
          />
          <FormField
            htmlFor="reservation_note"
            label="Reservation note (optional)"
          >
            <FormTextarea
              id="reservation_note"
              name="reservation_note"
              onChange={(event) =>
                onDineInChange({
                  ...dineIn,
                  reservationNote: event.target.value,
                })
              }
              rows={3}
              value={dineIn.reservationNote}
            />
          </FormField>
        </div>
      ) : null}

      {isDelivery ? (
        <div className="border-fog space-y-4 rounded-lg border p-3">
          {lateEditCutoffHints ? (
            <p className="text-skyline text-sm">
              {LATE_ORDER_EDIT_SECTION_EXCLUDED}
            </p>
          ) : null}
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
