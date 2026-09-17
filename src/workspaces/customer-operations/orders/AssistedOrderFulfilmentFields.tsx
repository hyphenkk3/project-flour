"use client";

import { useState } from "react";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import {
  FormCheckbox,
  FormField,
  FormInput,
  FormRadioGroup,
  FormTextarea,
} from "@/components/ui/form";
import {
  DINE_IN_VENUES,
  cakeServingSlotsForReservation,
  dineInVenueLabel,
  resolveDineInVenueForPair,
  venuesForReservationAndServing,
} from "@/engines/business-calendar/dine-in-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import { isPickupOrdersClosed } from "@/engines/business-calendar/order-availability";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  ASSISTED_ORDER_FULFILMENT_OPTIONS,
  type AssistedDineInDraft,
} from "@/engines/orders/assisted-fulfilment";
import {
  DINE_IN_RESERVATION_INCLUDED_NOTICE,
  customerFulfilmentSlotsForDate,
} from "@/engines/orders/customer-fulfilment-availability";
import {
  RECIPIENT_NOTIFY_OPTIONS,
  copyCustomerToRecipientDraft,
  markRecipientDivergedFromCustomer,
  workspaceScheduleDateLabel,
  workspaceScheduleTimeLabel,
  type CustomerWebsiteFulfilmentMethod,
  type DeliveryCreateDraft,
} from "@/engines/orders/fulfilment";
import type { RecipientNotifyPreference } from "@/types/storefront";

type AssistedOrderFulfilmentFieldsProps = {
  method: CustomerWebsiteFulfilmentMethod;
  onMethodChange: (method: CustomerWebsiteFulfilmentMethod) => void;
  delivery: DeliveryCreateDraft;
  onDeliveryChange: (next: DeliveryCreateDraft) => void;
  dineIn: AssistedDineInDraft;
  onDineInChange: (next: AssistedDineInDraft) => void;
  customerName: string;
  customerPhone: string;
  closedDates?: readonly string[];
  hoursSnapshot?: OperatingHoursSnapshot;
  canOverrideCustomerFulfilmentSchedule?: boolean;
};

export function AssistedOrderFulfilmentFields({
  method,
  onMethodChange,
  delivery,
  onDeliveryChange,
  dineIn,
  onDineInChange,
  customerName,
  customerPhone,
  closedDates = [],
  hoursSnapshot = OPERATING_HOURS_SEED,
  canOverrideCustomerFulfilmentSchedule = false,
}: AssistedOrderFulfilmentFieldsProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [servingTime, setServingTime] = useState("");
  const [specialArrangement, setSpecialArrangement] = useState(false);
  const isDelivery = method === "delivery";
  const isDineIn = method === "dine_in";
  const showNotifyChoice = !delivery.sameAsCustomer;
  const dateLabel = workspaceScheduleDateLabel(method);
  const timeLabel = workspaceScheduleTimeLabel(method);
  const useSpecialSchedule =
    canOverrideCustomerFulfilmentSchedule && specialArrangement;

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

  function changeMethod(next: CustomerWebsiteFulfilmentMethod) {
    setServingTime("");
    onDineInChange({
      ...dineIn,
      reservationTime: "",
      venue: "",
    });
    onMethodChange(next);
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
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
        >
          {ASSISTED_ORDER_FULFILMENT_OPTIONS.map((option) => {
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
                onClick={() => changeMethod(option.value)}
                role="radio"
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {canOverrideCustomerFulfilmentSchedule ? (
        <FormCheckbox
          checked={specialArrangement}
          help="Normal customer dates and times remain the default. Use this only for an Owner special arrangement outside those slots, including after cutoff."
          label="Special arrangement (custom date/time)"
          name="owner_special_arrangement"
          onChange={(event) => {
            const next = event.target.checked;
            setSpecialArrangement(next);
            if (next) return;
            setSelectedDate("");
            setServingTime("");
            onDineInChange({
              ...dineIn,
              reservationTime: "",
              venue: "",
            });
          }}
          value="1"
        />
      ) : null}

      {isDineIn ? (
        <>
          <p className="text-ink text-sm leading-relaxed">
            {DINE_IN_RESERVATION_INCLUDED_NOTICE}
          </p>
          {useSpecialSchedule ? (
            <>
              <FormField htmlFor="pickup_date" label={dateLabel}>
                <FormInput
                  id="pickup_date"
                  name="pickup_date"
                  onChange={(event) => {
                    const date = event.target.value;
                    setSelectedDate(date);
                    setServingTime("");
                    onDineInChange({
                      ...dineIn,
                      reservationTime: "",
                      venue: "",
                    });
                  }}
                  required
                  type="date"
                  value={selectedDate}
                />
              </FormField>
              <FormField
                help="Custom reservation clock time for this special arrangement."
                htmlFor="reservation_time"
                label="Dine-in reservation time"
              >
                <FormInput
                  id="reservation_time"
                  name="reservation_time"
                  onChange={(event) => {
                    const reservationTime = event.target.value;
                    onDineInChange({
                      ...dineIn,
                      reservationTime,
                      venue: "",
                    });
                  }}
                  required
                  type="time"
                  value={dineIn.reservationTime}
                />
              </FormField>
              <FormField
                help="Cake serving time must be within 1 hour of the reservation time."
                htmlFor="pickup_time"
                label="Cake serving time"
              >
                <FormInput
                  id="pickup_time"
                  name="pickup_time"
                  onChange={(event) => setServingTime(event.target.value)}
                  required
                  type="time"
                  value={servingTime}
                />
              </FormField>
            </>
          ) : (
            <>
              <PickupSlotFields
                closedDates={closedDates}
                dateLabel={dateLabel}
                hoursSnapshot={hoursSnapshot}
                key={`assisted-dine-in-reservation-${method}`}
                onDateChange={(date) => {
                  setSelectedDate(date);
                  setServingTime("");
                  onDineInChange({
                    ...dineIn,
                    reservationTime: "",
                    venue: "",
                  });
                }}
                onTimeChange={(reservationTime) => {
                  const servingOptions = cakeServingSlotsForReservation(
                    selectedDate,
                    reservationTime,
                    hoursSnapshot,
                  );
                  const nextServing = servingOptions.some(
                    (slot) => slot.value === servingTime,
                  )
                    ? servingTime
                    : "";
                  setServingTime(nextServing);
                  onDineInChange({
                    ...dineIn,
                    reservationTime,
                    venue: nextServing
                      ? resolveDineInVenueForPair(
                          selectedDate,
                          reservationTime,
                          nextServing,
                          dineIn.venue,
                          hoursSnapshot,
                        )
                      : "",
                  });
                }}
                slotsForDate={(date, closed) =>
                  customerFulfilmentSlotsForDate(
                    "dine_in",
                    date,
                    closed,
                    hoursSnapshot,
                  )
                }
                timeHelp="Choose when the table reservation should start."
                timeId="reservation_time"
                timeLabel="Dine-in reservation time"
                timeName="reservation_time"
              />
              {dineIn.reservationTime ? (
                <PickupSlotFields
                  closedDates={closedDates}
                  defaultDate={selectedDate}
                  defaultTime={servingTime}
                  hoursSnapshot={hoursSnapshot}
                  includeFieldNames
                  key={`assisted-dine-in-serving-${dineIn.reservationTime}`}
                  onTimeChange={(nextServing) => {
                    setServingTime(nextServing);
                    onDineInChange({
                      ...dineIn,
                      venue: resolveDineInVenueForPair(
                        selectedDate,
                        dineIn.reservationTime,
                        nextServing,
                        dineIn.venue,
                        hoursSnapshot,
                      ),
                    });
                  }}
                  showDate={false}
                  slotsForDate={(date, closed) =>
                    isPickupOrdersClosed(date, closed)
                      ? []
                      : cakeServingSlotsForReservation(
                          date,
                          dineIn.reservationTime,
                          hoursSnapshot,
                        )
                  }
                  timeHelp="Cake serving time must be within 1 hour of the reservation time."
                  timeLabel="Cake serving time"
                />
              ) : null}
            </>
          )}
          {((useSpecialSchedule && Boolean(selectedDate)) ||
            (!useSpecialSchedule &&
              Boolean(selectedDate) &&
              Boolean(dineIn.reservationTime) &&
              Boolean(servingTime))) ? (
            <FormRadioGroup
              legend="Where would you like to sit?"
              name="dine_in_venue"
              onChange={(value) => onDineInChange({ ...dineIn, venue: value })}
              options={(useSpecialSchedule
                ? [...DINE_IN_VENUES]
                : venuesForReservationAndServing(
                    selectedDate,
                    dineIn.reservationTime,
                    servingTime,
                    hoursSnapshot,
                  )
              ).map((venue) => ({
                value: venue,
                label: dineInVenueLabel(venue),
              }))}
              required
              value={dineIn.venue}
            />
          ) : null}
          <FormField htmlFor="guest_count" label="Number of guests">
            <FormInput
              id="guest_count"
              max={50}
              min={1}
              name="guest_count"
              onChange={(event) =>
                onDineInChange({ ...dineIn, guestCount: event.target.value })
              }
              required
              step={1}
              type="number"
              value={dineIn.guestCount}
            />
          </FormField>
          <FormField
            help="Optional."
            htmlFor="reservation_note"
            label="Reservation note"
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
        </>
      ) : useSpecialSchedule ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="pickup_date" label={dateLabel}>
            <FormInput
              id="pickup_date"
              name="pickup_date"
              onChange={(event) => setSelectedDate(event.target.value)}
              required
              type="date"
              value={selectedDate}
            />
          </FormField>
          <FormField
            help="Custom clock time for this special arrangement."
            htmlFor="pickup_time"
            label={timeLabel}
          >
            <FormInput
              id="pickup_time"
              name="pickup_time"
              onChange={(event) => setServingTime(event.target.value)}
              required
              type="time"
              value={servingTime}
            />
          </FormField>
        </div>
      ) : (
        <PickupSlotFields
          closedDates={closedDates}
          dateLabel={dateLabel}
          hoursSnapshot={hoursSnapshot}
          key={`assisted-${method}-schedule`}
          onDateChange={setSelectedDate}
          onTimeChange={setServingTime}
          slotsForDate={(date, closed) =>
            customerFulfilmentSlotsForDate(method, date, closed, hoursSnapshot)
          }
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
