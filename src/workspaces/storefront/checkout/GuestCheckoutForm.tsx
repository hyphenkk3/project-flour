"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormCheckbox,
  FormError,
  FormField,
  FormInput,
  FormRadioGroup,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import { OrderGuideCallout } from "@/components/ui/OrderGuideCallout";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import {
  ORDERS_CLOSED_CUSTOMER_LABEL,
  ORDERS_CLOSED_RPC_MESSAGE,
  customerPickupSlotsForDate,
  isPickupOrdersClosed,
} from "@/engines/business-calendar/order-availability";
import { getDeliverySlotsForDate } from "@/engines/business-calendar/delivery-hours";
import {
  cakeServingSlotsForReservation,
  dineInVenueLabel,
  getDineInSlotsForDate,
  resolveDineInVenueForPair,
  venuesForReservationAndServing,
} from "@/engines/business-calendar/dine-in-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import {
  customerFulfilmentHoursNotice,
  DINE_IN_RESERVATION_INCLUDED_NOTICE,
  firstAvailableCustomerFulfilment,
} from "@/engines/orders/customer-fulfilment-availability";
import {
  OWNER_DELIVERY_CITY,
  OWNER_DELIVERY_STATE,
  RECIPIENT_NOTIFY_OPTIONS,
  parseCustomerWebsiteFulfilmentMethod,
  workspaceScheduleDateLabel,
  workspaceScheduleTimeLabel,
} from "@/engines/orders/fulfilment";
import { formatShortBusinessDate } from "@/lib/dates";
import { FulfilmentMethodChooser } from "@/workspaces/storefront/checkout/FulfilmentMethodChooser";
import type { StorefrontCake } from "@/types/storefront";
import {
  formatCollectionAvailabilityLabel,
  formatRm,
  startingPrice,
} from "@/workspaces/storefront/catalog/pricing";
import {
  customerPaidAddonMessageRequired,
  customerPaidAddonMessageVisible,
  customerPreorderCommercialTotal,
  formatCustomerPreorderOptionLabel,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
} from "@/engines/orders/customer-preorder-options";
import {
  loadCheckoutPickupOffer,
  submitGuestPreorderAction,
  type CheckoutState,
} from "@/workspaces/storefront/checkout/actions";
import {
  emptyPreorderFields,
  fieldsAfterFulfilmentChange,
  filterDraftItemsToOfferedCakes,
  readPreorderDraft,
  writePreorderDraft,
  type PreorderDraft,
  type PreorderDraftFields,
  type PreorderDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";

function formatCheckoutCakeDate(ymd: string): string {
  const year = ymd.slice(0, 4);
  return /^\d{4}$/.test(year)
    ? `${formatShortBusinessDate(ymd)} ${year}`
    : formatShortBusinessDate(ymd);
}

function dineInCheckoutSlots(
  date: string,
  closedDates: readonly string[],
  snapshot: OperatingHoursSnapshot,
) {
  if (isPickupOrdersClosed(date, closedDates)) return [];
  return getDineInSlotsForDate(date, snapshot);
}

function deliveryCheckoutSlots(
  date: string,
  closedDates: readonly string[],
  snapshot: OperatingHoursSnapshot,
) {
  if (isPickupOrdersClosed(date, closedDates)) return [];
  return getDeliverySlotsForDate(date, snapshot);
}

const initialState: CheckoutState = { error: null };

type GuestCheckoutFormProps = {
  closedDates?: readonly string[];
  suggestedPickupDate?: string | null;
  minPickupDate?: string | null;
  maxPickupDate?: string | null;
  hoursSnapshot?: OperatingHoursSnapshot;
};

function persistDraft(
  items: PreorderDraftItem[],
  fields: PreorderDraftFields,
): void {
  const draft: PreorderDraft = {
    ...fields,
    items,
  };
  writePreorderDraft(draft);
}

export function GuestCheckoutForm({
  closedDates = [],
  suggestedPickupDate = null,
  minPickupDate = null,
  maxPickupDate = null,
  hoursSnapshot = OPERATING_HOURS_SEED,
}: GuestCheckoutFormProps) {
  const [state, formAction, pending] = useActionState(
    submitGuestPreorderAction,
    initialState,
  );

  const [items, setItems] = useState<PreorderDraftItem[]>([]);
  const [fields, setFields] = useState<PreorderDraftFields>(() =>
    emptyPreorderFields(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [cakes, setCakes] = useState<StorefrontCake[]>([]);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(
    null,
  );
  const [offerLabel, setOfferLabel] = useState<string | null>(null);
  const [complimentaryOptions, setComplimentaryOptions] = useState<
    CustomerComplimentaryOption[]
  >([]);
  const [paidAddonOptions, setPaidAddonOptions] = useState<
    CustomerPaidAddonOption[]
  >([]);
  const [optionsReady, setOptionsReady] = useState(false);
  const [loadingOffer, setLoadingOffer] = useState(false);
  const [addSizeByCake, setAddSizeByCake] = useState<Record<string, string>>(
    {},
  );
  const [addingCake, setAddingCake] = useState(false);
  const [changingDate, setChangingDate] = useState(false);

  useEffect(() => {
    const draft = readPreorderDraft();
    const suggested = suggestedPickupDate?.trim().slice(0, 10) ?? "";
    const min = minPickupDate?.trim().slice(0, 10) ?? "";
    const max = maxPickupDate?.trim().slice(0, 10) ?? "";
    let pickupDate = /^\d{4}-\d{2}-\d{2}$/.test(suggested)
      ? suggested
      : (draft?.pickupDate ?? "");
    if (max && pickupDate > max) {
      pickupDate = "";
    }
    if (min && pickupDate && pickupDate < min) {
      pickupDate =
        /^\d{4}-\d{2}-\d{2}$/.test(suggested) &&
        suggested >= min &&
        (!max || suggested <= max)
          ? suggested
          : min;
    }
    if (!pickupDate) {
      pickupDate = min || earliestPickupDateYmd();
    }
    setItems(draft?.items ?? []);
    setFields({
      ...emptyPreorderFields(),
      customerName: draft?.customerName ?? "",
      phone: draft?.phone ?? "",
      email: draft?.email ?? "",
      emailSubmissionReceiptRequested:
        draft?.emailSubmissionReceiptRequested ?? false,
      includeReceiptChoice: draft?.includeReceiptChoice ?? "",
      pickupDate,
      pickupTime: draft?.pickupTime ?? "",
      reservationTime: draft?.reservationTime ?? "",
      fulfilmentMethod: parseCustomerWebsiteFulfilmentMethod(
        draft?.fulfilmentMethod,
      ),
      dineInVenue:
        draft?.reservationTime && draft?.pickupTime
          ? resolveDineInVenueForPair(
              pickupDate,
              draft.reservationTime,
              draft.pickupTime,
              draft.dineInVenue,
              hoursSnapshot,
            )
          : "",
      guestCount: draft?.guestCount ?? "",
      reservationNote: draft?.reservationNote ?? "",
      recipientName: draft?.recipientName ?? "",
      recipientPhone: draft?.recipientPhone ?? "",
      addressLine1: draft?.addressLine1 ?? "",
      addressLine2: draft?.addressLine2 ?? "",
      postcode: draft?.postcode ?? "",
      city: draft?.city ?? OWNER_DELIVERY_CITY,
      state: draft?.state ?? OWNER_DELIVERY_STATE,
      recipientNotifyPreference: draft?.recipientNotifyPreference ?? "",
      sameAsCustomer: draft?.sameAsCustomer ?? true,
      notes: draft?.notes ?? "",
      complimentaryCodes: draft?.complimentaryCodes ?? [],
      paidAddonCodes: draft?.paidAddonCodes ?? [],
      birthdayCardMessage: draft?.birthdayCardMessage ?? "",
      wishingCardMessage: draft?.wishingCardMessage ?? "",
      paidAddonUnitPriceByCode: draft?.paidAddonUnitPriceByCode ?? {},
    });
    setHydrated(true);
  }, [suggestedPickupDate, minPickupDate, maxPickupDate]);

  useEffect(() => {
    if (!hydrated) return;
    persistDraft(items, fields);
  }, [items, fields, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const pickupDate = fields.pickupDate;
    if (!pickupDate) {
      setCakes([]);
      setUnavailableMessage(null);
      setOfferLabel(null);
      setComplimentaryOptions([]);
      setPaidAddonOptions([]);
      setOptionsReady(false);
      setLoadingOffer(false);
      return;
    }

    let cancelled = false;
    setLoadingOffer(true);
    void loadCheckoutPickupOffer(pickupDate).then((offer) => {
      if (cancelled) return;
      setCakes(offer.cakes);
      setUnavailableMessage(offer.unavailableMessage);
      setComplimentaryOptions(offer.complimentaryOptions);
      setPaidAddonOptions(offer.paidAddonOptions);
      setOptionsReady(offer.optionsReady);
      setOfferLabel(
        offer.collection
          ? formatCollectionAvailabilityLabel(offer.collection)
          : null,
      );
      setAddSizeByCake(
        Object.fromEntries(
          offer.cakes.map((cake) => [cake.id, cake.sizes[0]?.id ?? ""]),
        ),
      );
      setItems((current) => {
        const filtered = filterDraftItemsToOfferedCakes(current, offer.cakes);
        if (filtered.dropped) {
          setItemError(
            "Some cakes are not available for this pickup date and were removed.",
          );
        }
        return filtered.items;
      });
      setFields((current) => ({
        ...current,
        complimentaryCodes: current.complimentaryCodes.filter((code) =>
          offer.complimentaryOptions.some((option) => option.code === code),
        ),
        paidAddonCodes: current.paidAddonCodes.filter((code) =>
          offer.paidAddonOptions.some((option) => option.code === code),
        ),
        paidAddonUnitPriceByCode: Object.fromEntries(
          offer.paidAddonOptions.map((option) => [
            option.code,
            option.unitPrice,
          ]),
        ),
      }));
      setLoadingOffer(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fields.pickupDate, hydrated]);

  const total = useMemo(
    () =>
      customerPreorderCommercialTotal({
        items,
        options: paidAddonOptions,
        selectedCodes: fields.paidAddonCodes,
      }),
    [items, paidAddonOptions, fields.paidAddonCodes],
  );
  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          cakeId: item.cakeId,
          sizeId: item.sizeId,
          quantity: item.quantity,
        })),
      ),
    [items],
  );
  const optionsJson = useMemo(
    () =>
      JSON.stringify({
        complimentaryCodes: fields.complimentaryCodes,
        paidAddonCodes: fields.paidAddonCodes,
        birthdayCardMessage: fields.birthdayCardMessage,
        wishingCardMessage: fields.wishingCardMessage,
      }),
    [
      fields.complimentaryCodes,
      fields.paidAddonCodes,
      fields.birthdayCardMessage,
      fields.wishingCardMessage,
    ],
  );

  function patchFields(patch: Partial<PreorderDraftFields>) {
    setFields((current) => ({ ...current, ...patch }));
  }

  function changeFulfilment(value: string) {
    const method = parseCustomerWebsiteFulfilmentMethod(value);
    setFields((current) => fieldsAfterFulfilmentChange(current, method));
  }

  function changeDate(nextDate: string) {
    setFields((current) => {
      const withDate = {
        ...current,
        pickupDate: nextDate,
        pickupTime: "",
        reservationTime: "",
        dineInVenue: "",
      };
      const nextMethod = firstAvailableCustomerFulfilment(
        nextDate,
        closedDates,
        withDate.fulfilmentMethod,
        hoursSnapshot,
      );
      if (nextMethod === withDate.fulfilmentMethod) return withDate;
      return fieldsAfterFulfilmentChange(withDate, nextMethod);
    });
  }

  function addOfferedCakeAndClosePicker(cake: StorefrontCake) {
    addOfferedCake(cake);
    setAddingCake(false);
  }

  function toggleComplimentary(code: string, selected: boolean) {
    const next = selected
      ? Array.from(new Set([...fields.complimentaryCodes, code]))
      : fields.complimentaryCodes.filter((entry) => entry !== code);
    patchFields({ complimentaryCodes: next });
  }

  function togglePaidAddon(code: string, selected: boolean) {
    const next = selected
      ? Array.from(new Set([...fields.paidAddonCodes, code]))
      : fields.paidAddonCodes.filter((entry) => entry !== code);
    patchFields({ paidAddonCodes: next });
  }

  function updateItem(index: number, patch: Partial<PreorderDraftItem>) {
    setItemError(null);
    setItems((current) => {
      const next = current.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      );
      const map = new Map<string, PreorderDraftItem>();
      for (const item of next) {
        const key = `${item.cakeId}::${item.sizeId}`;
        const existing = map.get(key);
        if (existing) {
          map.set(key, {
            ...existing,
            quantity: existing.quantity + item.quantity,
          });
        } else {
          map.set(key, item);
        }
      }
      return Array.from(map.values());
    });
  }

  function changeSize(index: number, sizeId: string) {
    const item = items[index];
    const cake = cakes.find((entry) => entry.id === item.cakeId);
    const size = cake?.sizes.find((entry) => entry.id === sizeId);
    if (!size) return;
    updateItem(index, {
      sizeId: size.id,
      sizeLabel: size.size,
      unitPrice: size.price,
    });
  }

  function removeItem(index: number) {
    setItemError(null);
    setItems((current) => current.filter((_, i) => index !== i));
  }

  function addOfferedCake(cake: StorefrontCake) {
    const sizeId = addSizeByCake[cake.id] || cake.sizes[0]?.id;
    const size = cake.sizes.find((entry) => entry.id === sizeId);
    if (!size) return;
    setItemError(null);
    setItems((current) => {
      const filtered = filterDraftItemsToOfferedCakes(
        [
          ...current,
          {
            cakeId: cake.id,
            sizeId: size.id,
            quantity: 1,
            cakeName: cake.name,
            sizeLabel: size.size,
            unitPrice: size.price,
          },
        ],
        cakes,
      );
      return filtered.items;
    });
  }

  function handleSubmit(formData: FormData) {
    if (unavailableMessage) {
      setItemError(unavailableMessage);
      return;
    }
    if (items.length === 0) {
      setItemError("Please add at least one cake to your preorder.");
      return;
    }
    const pickupDate = String(formData.get("pickup_date") ?? "").trim();
    if (isPickupOrdersClosed(pickupDate, closedDates)) {
      setItemError(ORDERS_CLOSED_RPC_MESSAGE);
      return;
    }
    setItemError(null);
    persistDraft(items, fields);
    formAction(formData);
  }

  const upcomingClosed = closedDates
    .filter((date) => date >= earliestPickupDateYmd())
    .slice(0, 8);
  const catalogueReady = Boolean(fields.pickupDate) && !unavailableMessage;

  if (!hydrated) {
    return (
      <p className="text-skyline text-sm" aria-live="polite">
        Preparing your preorder…
      </p>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      <input name="items_json" type="hidden" value={itemsJson} />
      <input name="preorder_options_json" type="hidden" value={optionsJson} />
      <input
        name="preorder_options_ready"
        type="hidden"
        value={optionsReady ? "1" : "0"}
      />

      <section className="border-fog space-y-3 rounded-xl border bg-white px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
              Your cakes
            </h2>
            {fields.pickupDate ? (
              <p className="text-skyline mt-1 text-sm">
                For {formatCheckoutCakeDate(fields.pickupDate)}
              </p>
            ) : null}
          </div>
          <button
            className="text-signal text-sm font-medium"
            onClick={() => setChangingDate((open) => !open)}
            type="button"
          >
            {changingDate ? "Done" : "Change date"}
          </button>
        </div>
        {changingDate ? (
          <PickupSlotFields
            closedDates={closedDates}
            dateLabel="Date"
            defaultDate={fields.pickupDate}
            defaultTime={fields.pickupTime}
            includeFieldNames={false}
            key={`cake-date-${fields.pickupDate}`}
            maxDate={maxPickupDate ?? undefined}
            minDate={minPickupDate ?? undefined}
            onDateChange={changeDate}
            showTime={false}
          />
        ) : null}
        {upcomingClosed.length > 0 ? (
          <p className="text-skyline text-sm">
            {upcomingClosed.length === 1
              ? `${formatShortBusinessDate(upcomingClosed[0] ?? "")} — ${ORDERS_CLOSED_CUSTOMER_LABEL}.`
              : `Pickup dates with ${ORDERS_CLOSED_CUSTOMER_LABEL.toLowerCase()}: ${upcomingClosed
                  .map((date) => formatShortBusinessDate(date))
                  .join(", ")}.`}
          </p>
        ) : null}
        {loadingOffer ? (
          <p className="text-skyline text-sm" aria-live="polite">
            Loading cakes for that date…
          </p>
        ) : unavailableMessage ? (
          <div role="status">
            <p className="text-ink text-sm font-medium leading-relaxed">
              {unavailableMessage}
            </p>
            <p className="text-skyline mt-2 text-sm leading-relaxed">
              Please choose a date in a published catalogue.
            </p>
          </div>
        ) : (
          <>
            {offerLabel ? (
              <p className="text-skyline text-sm">{offerLabel}</p>
            ) : null}
            {items.length === 0 ? (
              <p className="text-skyline text-sm">No cakes added yet.</p>
            ) : (
              <ul className="space-y-3">
                {items.map((item, index) => {
                  const cake = cakes.find((entry) => entry.id === item.cakeId);
                  return (
                    <li
                      className="border-fog space-y-2 rounded-lg border px-3 py-3"
                      key={`${item.cakeId}-${item.sizeId}-${index}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-ink font-medium">{item.cakeName}</p>
                          <p className="text-skyline mt-0.5 text-sm">
                            {item.sizeLabel} × {item.quantity} ·{" "}
                            {formatRm(item.unitPrice * item.quantity)}
                          </p>
                        </div>
                        <button
                          className="text-skyline hover:text-ink text-xs font-medium"
                          onClick={() => removeItem(index)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <FormField htmlFor={`size-${index}`} label="Size">
                          <FormSelect
                            id={`size-${index}`}
                            onChange={(event) =>
                              changeSize(index, event.target.value)
                            }
                            value={item.sizeId}
                          >
                            {(cake?.sizes ?? []).map((size) => (
                              <option key={size.id} value={size.id}>
                                {size.size} — {formatRm(size.price)}
                              </option>
                            ))}
                          </FormSelect>
                        </FormField>
                        <FormField htmlFor={`qty-${index}`} label="Quantity">
                          <FormInput
                            id={`qty-${index}`}
                            min={1}
                            onChange={(event) =>
                              updateItem(index, {
                                quantity: Math.max(
                                  1,
                                  Number(event.target.value) || 1,
                                ),
                              })
                            }
                            step={1}
                            type="number"
                            value={item.quantity}
                          />
                        </FormField>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {addingCake ? (
              cakes.length > 0 ? (
                <div className="border-fog space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ink text-sm font-medium">
                      Available cakes for this date
                    </p>
                    <button
                      className="text-skyline text-sm font-medium"
                      onClick={() => setAddingCake(false)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {cakes.map((cake) => (
                      <li
                        className="flex flex-wrap items-center gap-2"
                        key={cake.id}
                      >
                        <span className="text-ink min-w-0 flex-1 text-sm">
                          {cake.name}
                          {startingPrice(cake) != null
                            ? ` · from ${formatRm(startingPrice(cake) ?? 0)}`
                            : ""}
                        </span>
                        <FormSelect
                          aria-label={`Size for ${cake.name}`}
                          className="w-36"
                          onChange={(event) =>
                            setAddSizeByCake((current) => ({
                              ...current,
                              [cake.id]: event.target.value,
                            }))
                          }
                          value={addSizeByCake[cake.id] ?? cake.sizes[0]?.id ?? ""}
                        >
                          {cake.sizes.map((size) => (
                            <option key={size.id} value={size.id}>
                              {size.size}
                            </option>
                          ))}
                        </FormSelect>
                        <button
                          className="text-signal text-sm font-medium"
                          onClick={() => addOfferedCakeAndClosePicker(cake)}
                          type="button"
                        >
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-skyline text-sm">
                  No cakes are offered for this date.
                </p>
              )
            ) : catalogueReady ? (
              <button
                className="text-signal text-sm font-medium"
                onClick={() => setAddingCake(true)}
                type="button"
              >
                + Add another cake
              </button>
            ) : null}
          </>
        )}

        {!unavailableMessage && fields.pickupDate ? (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <p className="text-ink text-sm font-semibold">
              Total · {formatRm(total)}
            </p>
          </div>
        ) : null}
        {itemError ? (
          <p className="text-status-danger text-sm" role="alert">
            {itemError}
          </p>
        ) : null}
      </section>

      <OrderGuideCallout />

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Fulfilment
        </h2>
        <p className="text-skyline text-sm leading-relaxed">
          {customerFulfilmentHoursNotice(hoursSnapshot)}
        </p>
        <FulfilmentMethodChooser
          closedDates={closedDates}
          dateYmd={fields.pickupDate}
          hoursSnapshot={hoursSnapshot}
          onChange={changeFulfilment}
          value={fields.fulfilmentMethod}
        />
        {fields.fulfilmentMethod === "dine_in" ? (
          <>
            <p className="text-ink text-sm leading-relaxed">
              {DINE_IN_RESERVATION_INCLUDED_NOTICE}
            </p>
            <PickupSlotFields
              closedDates={closedDates}
              dateLabel="Dine-in date"
              defaultDate={fields.pickupDate}
              defaultTime={fields.reservationTime}
              key={`dine-in-reservation-${fields.pickupDate}`}
              maxDate={maxPickupDate ?? undefined}
              minDate={minPickupDate ?? undefined}
              onDateChange={changeDate}
              onTimeChange={(reservationTime) => {
                const servingOptions = cakeServingSlotsForReservation(
                  fields.pickupDate,
                  reservationTime,
                  hoursSnapshot,
                );
                const nextServing = servingOptions.some(
                  (slot) => slot.value === fields.pickupTime,
                )
                  ? fields.pickupTime
                  : "";
                patchFields({
                  reservationTime,
                  pickupTime: nextServing,
                  dineInVenue: nextServing
                    ? resolveDineInVenueForPair(
                        fields.pickupDate,
                        reservationTime,
                        nextServing,
                        fields.dineInVenue,
                        hoursSnapshot,
                      )
                    : "",
                });
              }}
              slotsForDate={(date, closed) =>
                dineInCheckoutSlots(date, closed, hoursSnapshot)
              }
              timeHelp="Choose when you would like your table reservation to start."
              timeId="reservation_time"
              timeLabel="Dine-in reservation time"
              timeName="reservation_time"
            />
            {fields.reservationTime ? (
              <PickupSlotFields
                closedDates={closedDates}
                defaultDate={fields.pickupDate}
                defaultTime={fields.pickupTime}
                includeFieldNames
                key={`dine-in-serving-${fields.pickupDate}-${fields.reservationTime}`}
                onTimeChange={(pickupTime) =>
                  patchFields({
                    pickupTime,
                    dineInVenue: resolveDineInVenueForPair(
                      fields.pickupDate,
                      fields.reservationTime,
                      pickupTime,
                      fields.dineInVenue,
                      hoursSnapshot,
                    ),
                  })
                }
                showDate={false}
                slotsForDate={(date, closed) =>
                  isPickupOrdersClosed(date, closed)
                    ? []
                    : cakeServingSlotsForReservation(
                        date,
                        fields.reservationTime,
                        hoursSnapshot,
                      )
                }
                timeHelp="Choose when you would like your cake served. Cake serving time must be within 1 hour of your reservation time."
                timeLabel="Cake serving time"
              />
            ) : null}
            <div className="space-y-3">
              {fields.pickupDate &&
              fields.reservationTime &&
              fields.pickupTime ? (
                <FormRadioGroup
                  legend="Where would you like to sit?"
                  name="dine_in_venue"
                  onChange={(value) => patchFields({ dineInVenue: value })}
                  options={venuesForReservationAndServing(
                    fields.pickupDate,
                    fields.reservationTime,
                    fields.pickupTime,
                    hoursSnapshot,
                  ).map((venue) => ({
                    value: venue,
                    label: dineInVenueLabel(venue),
                  }))}
                  required
                  value={fields.dineInVenue}
                />
              ) : null}
              <FormField htmlFor="guest_count" label="Number of guests">
                <FormInput
                  id="guest_count"
                  max={50}
                  min={1}
                  name="guest_count"
                  onChange={(event) =>
                    patchFields({ guestCount: event.target.value })
                  }
                  required
                  step={1}
                  type="number"
                  value={fields.guestCount}
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
                    patchFields({ reservationNote: event.target.value })
                  }
                  rows={3}
                  value={fields.reservationNote}
                />
              </FormField>
            </div>
          </>
        ) : (
          <PickupSlotFields
            closedDates={closedDates}
            dateLabel={workspaceScheduleDateLabel(fields.fulfilmentMethod)}
            defaultDate={fields.pickupDate}
            defaultTime={fields.pickupTime}
            key={`${fields.fulfilmentMethod}-${fields.pickupDate}`}
            maxDate={maxPickupDate ?? undefined}
            minDate={minPickupDate ?? undefined}
            onDateChange={changeDate}
            onTimeChange={(pickupTime) => patchFields({ pickupTime })}
            slotsForDate={
              fields.fulfilmentMethod === "delivery"
                ? (date, closed) =>
                    deliveryCheckoutSlots(date, closed, hoursSnapshot)
                : (date, closed) =>
                    customerPickupSlotsForDate(date, closed, hoursSnapshot)
            }
            timeLabel={workspaceScheduleTimeLabel(fields.fulfilmentMethod)}
          />
        )}
        {fields.fulfilmentMethod === "delivery" ? (
          <div className="space-y-3">
            <FormCheckbox
              checked={fields.sameAsCustomer}
              label="Recipient is the same as the ordering customer"
              name="same_as_customer"
              onChange={(event) => {
                const sameAsCustomer = event.target.checked;
                patchFields({
                  sameAsCustomer,
                  recipientName: sameAsCustomer ? fields.customerName : "",
                  recipientPhone: sameAsCustomer ? fields.phone : "",
                  recipientNotifyPreference: sameAsCustomer
                    ? ""
                    : fields.recipientNotifyPreference,
                });
              }}
            />
            {!fields.sameAsCustomer ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField htmlFor="recipient_name" label="Recipient name">
                  <FormInput
                    id="recipient_name"
                    name="recipient_name"
                    onChange={(event) =>
                      patchFields({ recipientName: event.target.value })
                    }
                    required
                    value={fields.recipientName}
                  />
                </FormField>
                <FormField htmlFor="recipient_phone" label="Recipient phone">
                  <FormInput
                    id="recipient_phone"
                    name="recipient_phone"
                    onChange={(event) =>
                      patchFields({ recipientPhone: event.target.value })
                    }
                    required
                    type="tel"
                    value={fields.recipientPhone}
                  />
                </FormField>
              </div>
            ) : null}
            <FormField htmlFor="address_line_1" label="Address line 1">
              <FormInput
                id="address_line_1"
                name="address_line_1"
                onChange={(event) =>
                  patchFields({ addressLine1: event.target.value })
                }
                required
                value={fields.addressLine1}
              />
            </FormField>
            <FormField htmlFor="address_line_2" label="Address line 2">
              <FormInput
                id="address_line_2"
                name="address_line_2"
                onChange={(event) =>
                  patchFields({ addressLine2: event.target.value })
                }
                value={fields.addressLine2}
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField htmlFor="postcode" label="Postcode">
                <FormInput
                  id="postcode"
                  name="postcode"
                  onChange={(event) =>
                    patchFields({ postcode: event.target.value })
                  }
                  required
                  value={fields.postcode}
                />
              </FormField>
              <FormField htmlFor="city" label="City">
                <FormInput
                  id="city"
                  name="city"
                  onChange={(event) =>
                    patchFields({ city: event.target.value })
                  }
                  required
                  value={fields.city}
                />
              </FormField>
              <FormField htmlFor="state" label="State">
                <FormInput
                  id="state"
                  name="state"
                  onChange={(event) =>
                    patchFields({ state: event.target.value })
                  }
                  required
                  value={fields.state}
                />
              </FormField>
            </div>
            {!fields.sameAsCustomer ? (
              <FormRadioGroup
                legend="Should we inform the recipient?"
                name="recipient_notify_preference"
                onChange={(value) =>
                  patchFields({ recipientNotifyPreference: value })
                }
                options={[...RECIPIENT_NOTIFY_OPTIONS]}
                required
                value={fields.recipientNotifyPreference}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      {optionsReady &&
      (complimentaryOptions.length > 0 || paidAddonOptions.length > 0) ? (
        <section className="space-y-4">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Options
          </h2>
          {complimentaryOptions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-ink text-sm font-medium">Complimentary</p>
              {complimentaryOptions.map((option) => (
                <FormCheckbox
                  checked={fields.complimentaryCodes.includes(option.code)}
                  key={option.code}
                  label={formatCustomerPreorderOptionLabel(option.name, 0)}
                  onChange={(event) =>
                    toggleComplimentary(option.code, event.target.checked)
                  }
                />
              ))}
            </div>
          ) : null}
          {paidAddonOptions.length > 0 ? (
            <div className="space-y-3">
              <p className="text-ink text-sm font-medium">Paid</p>
              {paidAddonOptions.map((option) => {
                const selected = fields.paidAddonCodes.includes(option.code);
                const messageVisible =
                  option.code === "birthday_card" ||
                  option.code === "wishing_card"
                    ? customerPaidAddonMessageVisible(
                        option.code,
                        fields.paidAddonCodes,
                      )
                    : false;
                const messageRequired =
                  option.code === "birthday_card" ||
                  option.code === "wishing_card"
                    ? customerPaidAddonMessageRequired(
                        option.code,
                        fields.paidAddonCodes,
                      )
                    : false;
                const messageValue =
                  option.code === "birthday_card"
                    ? fields.birthdayCardMessage
                    : option.code === "wishing_card"
                      ? fields.wishingCardMessage
                      : "";
                return (
                  <div className="space-y-2" key={option.code}>
                    <FormCheckbox
                      checked={selected}
                      label={formatCustomerPreorderOptionLabel(
                        option.name,
                        option.unitPrice,
                      )}
                      onChange={(event) =>
                        togglePaidAddon(option.code, event.target.checked)
                      }
                    />
                    {messageVisible ? (
                      <FormField
                        help="Optional."
                        htmlFor={`${option.code}_message`}
                        label={`Written message on ${option.name}`}
                      >
                        <FormTextarea
                          id={`${option.code}_message`}
                          onChange={(event) =>
                            patchFields(
                              option.code === "birthday_card"
                                ? {
                                    birthdayCardMessage: event.target.value,
                                  }
                                : {
                                    wishingCardMessage: event.target.value,
                                  },
                            )
                          }
                          required={messageRequired}
                          rows={3}
                          value={messageValue}
                        />
                      </FormField>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Customer
        </h2>
        <FormField htmlFor="customer_name" label="Name">
          <FormInput
            id="customer_name"
            name="customer_name"
            onChange={(event) =>
              patchFields({ customerName: event.target.value })
            }
            required
            value={fields.customerName}
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            help="Primary contact for WhatsApp updates"
            htmlFor="phone"
            label="WhatsApp phone"
          >
            <FormInput
              id="phone"
              name="phone"
              onChange={(event) => patchFields({ phone: event.target.value })}
              required
              type="tel"
              value={fields.phone}
            />
          </FormField>
          <FormField
            help="For a copy of your preorder submission"
            htmlFor="email"
            label="Email (optional)"
          >
            <FormInput
              id="email"
              name="email"
              onChange={(event) => patchFields({ email: event.target.value })}
              required={fields.emailSubmissionReceiptRequested}
              type="email"
              value={fields.email}
            />
          </FormField>
        </div>
        <FormCheckbox
          checked={fields.emailSubmissionReceiptRequested}
          label="Email me a copy of my preorder submission"
          name="email_submission_receipt_requested"
          onChange={(event) =>
            patchFields({
              emailSubmissionReceiptRequested: event.target.checked,
            })
          }
        />
        <FormRadioGroup
          legend="Would you like a copy of the receipt? (will be attached during pickup)"
          name="include_receipt"
          onChange={(value) =>
            patchFields({
              includeReceiptChoice: value === "yes" || value === "no" ? value : "",
            })
          }
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          required
          value={fields.includeReceiptChoice}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Notes
        </h2>
        <FormField htmlFor="notes" label="Optional notes">
          <FormTextarea
            id="notes"
            name="notes"
            onChange={(event) => patchFields({ notes: event.target.value })}
            rows={3}
            value={fields.notes}
          />
        </FormField>
      </section>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton
          disabled={!catalogueReady || Boolean(unavailableMessage)}
          pending={pending}
        >
          Submit Preorder
        </FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          href="/order"
        >
          Back
        </Link>
      </FormActions>
    </form>
  );
}
