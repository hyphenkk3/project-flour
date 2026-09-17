"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import {
  availableDineInVenues,
  dineInVenueLabel,
  parseDineInVenue,
  resolveDineInVenueSelection,
} from "@/engines/business-calendar/dine-in-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  extraCustomerSameDayUnavailableNotice,
  extraCustomerVisibleFulfilmentDates,
  firstAvailableFreshPicksFulfilment,
  freshPicksChooserStates,
  freshPicksMethodAvailability,
} from "@/engines/extra/fresh-picks-fulfilment";
import {
  DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  type FreshPicksPreparationConfig,
} from "@/engines/extra/fresh-picks-preparation";
import {
  FRESH_PICKS_NAME_HELP,
  FRESH_PICKS_SUCCESS_FLOW,
  FRESH_PICKS_WHATSAPP_NOTE,
} from "@/engines/extra/customer-fresh-picks";
import {
  OWNER_DELIVERY_CITY,
  OWNER_DELIVERY_STATE,
  RECIPIENT_NOTIFY_OPTIONS,
  parseCustomerWebsiteFulfilmentMethod,
  workspaceFulfilmentSectionTitle,
  workspaceScheduleDateLabel,
  workspaceScheduleTimeLabel,
  type CustomerWebsiteFulfilmentMethod,
} from "@/engines/orders/fulfilment";
import { FulfilmentMethodChooser } from "@/workspaces/storefront/checkout/FulfilmentMethodChooser";
import { OPTIONAL_NOTES_CUSTOMER_WARNING } from "@/engines/orders/order-guide";
import {
  customerPaidAddonMessageRequired,
  customerPaidAddonMessageVisible,
  customerPreorderCommercialTotal,
  formatCustomerPreorderOptionLabel,
  isCustomerPaidAddonCode,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
} from "@/engines/orders/customer-preorder-options";
import { formatShortBusinessDate } from "@/lib/dates";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  buildExtraCheckoutConfirmSnapshot,
  CheckoutConfirmPrompt,
  type CheckoutConfirmSnapshot,
} from "@/workspaces/storefront/checkout/CheckoutConfirmPrompt";
import type { PhysicalReceiptChoice } from "@/workspaces/storefront/checkout/preorder-draft";
import {
  loadExtraCustomerOptions,
  submitGuestExtraOrderAction,
  type ExtraOrderState,
} from "@/workspaces/storefront/extra/actions";
import {
  patchFreshPickCart,
  readFreshPickCart,
  writeFreshPickCart,
} from "@/workspaces/storefront/extra/fresh-pick-cart";
import { useFreshPickCart } from "@/workspaces/storefront/extra/useFreshPickCart";

const initialState: ExtraOrderState = { error: null };

type GuestExtraCheckoutFormProps = {
  hoursSnapshot?: OperatingHoursSnapshot;
  preparationConfig?: FreshPicksPreparationConfig;
};

export function GuestExtraCheckoutForm({
  hoursSnapshot = OPERATING_HOURS_SEED,
  preparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
}: GuestExtraCheckoutFormProps) {
  const cart = useFreshPickCart();
  const [state, formAction, pending] = useActionState(
    submitGuestExtraOrderAction,
    initialState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSnapshot, setConfirmSnapshot] =
    useState<CheckoutConfirmSnapshot | null>(null);
  const pendingSubmitRef = useRef<FormData | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [includeReceiptChoice, setIncludeReceiptChoice] =
    useState<PhysicalReceiptChoice>("");
  const [complimentaryOptions, setComplimentaryOptions] = useState<
    CustomerComplimentaryOption[]
  >([]);
  const [paidAddonOptions, setPaidAddonOptions] = useState<
    CustomerPaidAddonOption[]
  >([]);
  const [complimentaryCodes, setComplimentaryCodes] = useState<string[]>([]);
  const [paidAddonCodes, setPaidAddonCodes] = useState<string[]>([]);
  const [birthdayCardMessage, setBirthdayCardMessage] = useState("");
  const [wishingCardMessage, setWishingCardMessage] = useState("");

  const pickupDate = cart?.pickupDate ?? "";
  const pickupTime = cart?.pickupTime ?? "";
  const [fulfilmentMethod, setFulfilmentMethod] =
    useState<CustomerWebsiteFulfilmentMethod>(
      cart?.fulfilmentMethod ?? "pickup",
    );
  const [dineInVenue, setDineInVenue] = useState(cart?.dineInVenue ?? "");
  const [guestCount, setGuestCount] = useState(cart?.guestCount ?? "");
  const [reservationNote, setReservationNote] = useState(
    cart?.reservationNote ?? "",
  );
  const [sameAsCustomer, setSameAsCustomer] = useState(
    cart?.sameAsCustomer !== false,
  );
  const [recipientName, setRecipientName] = useState(cart?.recipientName ?? "");
  const [recipientPhone, setRecipientPhone] = useState(
    cart?.recipientPhone ?? "",
  );
  const [addressLine1, setAddressLine1] = useState(cart?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(cart?.addressLine2 ?? "");
  const [postcode, setPostcode] = useState(cart?.postcode ?? "");
  const [city, setCity] = useState(cart?.city || OWNER_DELIVERY_CITY);
  const [stateName, setStateName] = useState(cart?.state || OWNER_DELIVERY_STATE);
  const [recipientNotifyPreference, setRecipientNotifyPreference] = useState(
    cart?.recipientNotifyPreference ?? "",
  );
  const [selectedDate, setSelectedDate] = useState(pickupDate);
  const [selectedTime, setSelectedTime] = useState(pickupTime);

  useEffect(() => {
    if (!cart) return;
    setIncludeReceiptChoice(cart.includeReceiptChoice);
    setComplimentaryCodes(cart.complimentaryCodes);
    setPaidAddonCodes(cart.paidAddonCodes);
    setBirthdayCardMessage(cart.birthdayCardMessage);
    setWishingCardMessage(cart.wishingCardMessage);
    setFulfilmentMethod(cart.fulfilmentMethod);
    setDineInVenue(cart.dineInVenue);
    setGuestCount(cart.guestCount);
    setReservationNote(cart.reservationNote);
    setSameAsCustomer(cart.sameAsCustomer !== false);
    setRecipientName(cart.recipientName);
    setRecipientPhone(cart.recipientPhone);
    setAddressLine1(cart.addressLine1);
    setAddressLine2(cart.addressLine2);
    setPostcode(cart.postcode);
    setCity(cart.city || OWNER_DELIVERY_CITY);
    setStateName(cart.state || OWNER_DELIVERY_STATE);
    setRecipientNotifyPreference(cart.recipientNotifyPreference);
    setSelectedDate(cart.pickupDate);
    setSelectedTime(cart.pickupTime);
  }, [cart]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedDate) {
        setComplimentaryOptions([]);
        setPaidAddonOptions([]);
        return;
      }
      const next = await loadExtraCustomerOptions(selectedDate);
      if (cancelled) return;
      setComplimentaryOptions(next.complimentaryOptions);
      setPaidAddonOptions(next.paidAddonOptions);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  useEffect(() => {
    if (!state.orderId) return;
    window.location.assign(
      `/order/success?order=${state.orderId}&flow=${FRESH_PICKS_SUCCESS_FLOW}`,
    );
  }, [state.orderId]);

  const displayedTotal = customerPreorderCommercialTotal({
    items: (cart?.items ?? []).map((item) => ({
      unitPrice: item.unitPrice ?? 0,
      quantity: 1,
    })),
    options: paidAddonOptions,
    selectedCodes: paidAddonCodes,
  });

  const fulfilmentContext = {
    window: {
      pickupAvailableFromAt: cart?.pickupAvailableFromAt ?? "",
      orderCutoffAt: cart?.orderCutoffAt ?? "",
    },
    snapshot: hoursSnapshot,
    config: preparationConfig,
  };
  const dates = cart
    ? extraCustomerVisibleFulfilmentDates(fulfilmentContext)
    : [];
  const sameDayNotice = cart
    ? extraCustomerSameDayUnavailableNotice(fulfilmentContext)
    : null;
  const methodStates = selectedDate
    ? freshPicksChooserStates(selectedDate, fulfilmentContext)
    : undefined;
  const resolvedMethod = selectedDate
    ? firstAvailableFreshPicksFulfilment(
        selectedDate,
        fulfilmentMethod,
        fulfilmentContext,
      )
    : fulfilmentMethod;
  const methodAvailability = selectedDate
    ? freshPicksMethodAvailability(
        resolvedMethod,
        selectedDate,
        fulfilmentContext,
      )
    : null;
  const usableSlots = methodAvailability?.slots ?? [];
  const timeStillValid = usableSlots.some((slot) => slot.value === selectedTime);
  const dineInVenues = selectedDate
    ? availableDineInVenues(
        selectedDate,
        timeStillValid ? selectedTime : "",
        hoursSnapshot,
      )
    : [];
  const resolvedVenue =
    resolvedMethod === "dine_in" && selectedDate
      ? resolveDineInVenueSelection(
          selectedDate,
          timeStillValid ? selectedTime : "",
          dineInVenue,
          hoursSnapshot,
        )
      : "";

  function extraConfirmDetails(): string[] {
    if (resolvedMethod === "dine_in") {
      const details: string[] = [];
      const venue = parseDineInVenue(resolvedVenue || dineInVenue);
      if (venue) details.push(dineInVenueLabel(venue));
      if (guestCount.trim()) {
        const n = Number(guestCount);
        details.push(`${guestCount} ${n === 1 ? "guest" : "guests"}`);
      }
      return details;
    }
    if (resolvedMethod === "delivery") {
      const details: string[] = [];
      const address = [
        addressLine1,
        addressLine2,
        postcode,
        city,
        stateName,
      ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");
      if (address) details.push(address);
      if (!sameAsCustomer && recipientName.trim()) {
        details.push(`Recipient ${recipientName.trim()}`);
      }
      return details;
    }
    return [];
  }

  function persistCheckoutFields(form: HTMLFormElement) {
    const current = readFreshPickCart();
    if (!current) return;
    const data = new FormData(form);
    writeFreshPickCart(
      patchFreshPickCart(current, {
        customerName: String(data.get("customer_name") ?? current.customerName),
        phone: String(data.get("phone") ?? current.phone),
        includeReceiptChoice,
        notes: String(data.get("notes") ?? current.notes),
        complimentaryCodes,
        paidAddonCodes,
        birthdayCardMessage,
        wishingCardMessage,
        pickupDate: selectedDate,
        pickupTime: timeStillValid ? selectedTime : "",
        fulfilmentMethod: resolvedMethod,
        dineInVenue: resolvedVenue || dineInVenue,
        guestCount,
        reservationNote,
        sameAsCustomer,
        recipientName,
        recipientPhone,
        addressLine1,
        addressLine2,
        postcode,
        city,
        state: stateName,
        recipientNotifyPreference,
      }),
    );
  }

  function openConfirm() {
    const form = formRef.current;
    if (!form || !cart || cart.items.length === 0) return;
    if (!form.reportValidity()) return;
    persistCheckoutFields(form);
    const data = new FormData(form);
    pendingSubmitRef.current = data;
    setConfirmSnapshot(
      buildExtraCheckoutConfirmSnapshot({
        items: cart.items,
        cakeName: cart.items[0]?.cakeName ?? "",
        sizeLabel: cart.items[0]?.sizeLabel ?? "",
        unitPrice: cart.items[0]?.unitPrice ?? null,
        pickupDate: selectedDate,
        pickupTime: timeStillValid ? selectedTime : "",
        fulfilmentMethod: resolvedMethod,
        fulfilmentDetails: extraConfirmDetails(),
        customerName: String(data.get("customer_name") ?? ""),
        customerPhone: String(data.get("phone") ?? ""),
        notes: String(data.get("notes") ?? ""),
        paidAddonOptions,
        paidAddonCodes,
        complimentaryOptions,
        complimentaryCodes,
        total: displayedTotal,
      }),
    );
    setConfirmOpen(true);
  }

  function confirmOrder() {
    if (pending || state.orderId) return;
    const formData = pendingSubmitRef.current;
    if (!formData) return;
    formAction(formData);
  }

  function goBackFromConfirm() {
    if (pending || state.orderId) return;
    setConfirmOpen(false);
  }

  function toggleComplimentary(code: string, checked: boolean) {
    setComplimentaryCodes((current) =>
      checked ? [...current, code] : current.filter((value) => value !== code),
    );
  }

  function togglePaidAddon(code: string, checked: boolean) {
    setPaidAddonCodes((current) =>
      checked ? [...current, code] : current.filter((value) => value !== code),
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="border-fog mt-8 border-t pt-8">
        <p className="text-ink text-sm">Your Fresh Pick order is empty.</p>
        <p className="mt-6">
          <Link className="text-signal text-sm font-medium" href="/extra">
            View Fresh Picks
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          openConfirm();
        }}
        ref={formRef}
      >
        {cart.items.map((item) => (
          <span key={item.extraStockId}>
            <input name="extra_stock_id" type="hidden" value={item.extraStockId} />
            <input name="extra_cake_name" type="hidden" value={item.cakeName} />
          </span>
        ))}
        <input name="pickup_date" type="hidden" value={selectedDate} />
        <input name="pickup_time" type="hidden" value={timeStillValid ? selectedTime : ""} />
        <input name="fulfilment_method" type="hidden" value={resolvedMethod} />

        <section className="space-y-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Your order
          </h2>
          <ul className="divide-fog divide-y">
            {cart.items.map((item) => (
              <li className="flex items-start justify-between gap-3 py-3" key={item.extraStockId}>
                <div>
                  <p className="text-ink text-sm font-medium">{item.cakeName}</p>
                  <p className="text-skyline text-sm">{item.sizeLabel}</p>
                </div>
                <p className="text-ink text-sm tabular-nums">
                  {item.unitPrice != null ? formatRm(item.unitPrice) : "—"}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-skyline text-sm">
            {workspaceFulfilmentSectionTitle(resolvedMethod)} ·{" "}
            {formatShortBusinessDate(selectedDate) || selectedDate} ·{" "}
            {formatPickupTime(timeStillValid ? selectedTime : "")}
          </p>
          <p className="text-ink text-sm font-semibold">
            Total · {formatRm(displayedTotal)}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Fulfilment
          </h2>
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-medium text-ink"
              htmlFor="checkout_pickup_date"
            >
              {workspaceScheduleDateLabel(resolvedMethod)}
            </label>
            <FormSelect
              id="checkout_pickup_date"
              onChange={(event) => {
                const next = event.target.value;
                setSelectedDate(next);
                const nextMethod = firstAvailableFreshPicksFulfilment(
                  next,
                  fulfilmentMethod,
                  fulfilmentContext,
                );
                setFulfilmentMethod(nextMethod);
                const nextSlots = freshPicksMethodAvailability(
                  nextMethod,
                  next,
                  fulfilmentContext,
                ).slots;
                setSelectedTime(nextSlots[0]?.value ?? "");
              }}
              required
              value={selectedDate}
            >
              {dates.map((date) => (
                <option key={date} value={date}>
                  {formatShortBusinessDate(date)}
                </option>
              ))}
            </FormSelect>
          </div>
          {sameDayNotice ? (
            <p className="text-skyline text-sm leading-relaxed" role="status">
              {sameDayNotice}
            </p>
          ) : null}
          {selectedDate ? (
            <FulfilmentMethodChooser
              closedDates={[]}
              dateYmd={selectedDate}
              hoursSnapshot={hoursSnapshot}
              includeFieldName={false}
              methodStates={methodStates}
              onChange={(value) => {
                const next = parseCustomerWebsiteFulfilmentMethod(value);
                setFulfilmentMethod(next);
                const nextSlots = freshPicksMethodAvailability(
                  next,
                  selectedDate,
                  fulfilmentContext,
                ).slots;
                setSelectedTime(nextSlots[0]?.value ?? "");
              }}
              value={resolvedMethod}
            />
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-medium text-ink"
              htmlFor="checkout_pickup_time"
            >
              {resolvedMethod === "dine_in"
                ? "Dine-in reservation time"
                : workspaceScheduleTimeLabel(resolvedMethod)}
            </label>
            <FormSelect
              id="checkout_pickup_time"
              onChange={(event) => setSelectedTime(event.target.value)}
              required
              value={timeStillValid ? selectedTime : ""}
            >
              <option value="">Choose a time</option>
              {usableSlots.map((slot) => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))}
            </FormSelect>
          </div>
          {resolvedMethod === "dine_in" ? (
            <div className="space-y-3">
              {dineInVenues.length > 0 ? (
                <FormRadioGroup
                  legend="Where would you like to sit?"
                  name="dine_in_venue"
                  onChange={(value) => setDineInVenue(value)}
                  options={dineInVenues.map((venue) => ({
                    value: venue,
                    label: dineInVenueLabel(venue),
                  }))}
                  required
                  value={resolvedVenue}
                />
              ) : null}
              <FormField htmlFor="guest_count" label="Number of guests">
                <FormInput
                  id="guest_count"
                  max={50}
                  min={1}
                  name="guest_count"
                  onChange={(event) => setGuestCount(event.target.value)}
                  required
                  step={1}
                  type="number"
                  value={guestCount}
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
                  onChange={(event) => setReservationNote(event.target.value)}
                  rows={3}
                  value={reservationNote}
                />
              </FormField>
            </div>
          ) : null}
          {resolvedMethod === "delivery" ? (
            <div className="space-y-3">
              <FormCheckbox
                checked={sameAsCustomer}
                label="Recipient is the same as the ordering customer"
                name="same_as_customer"
                onChange={(event) => {
                  const next = event.target.checked;
                  setSameAsCustomer(next);
                  if (next) setRecipientNotifyPreference("");
                }}
              />
              {!sameAsCustomer ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField htmlFor="recipient_name" label="Recipient name">
                    <FormInput
                      id="recipient_name"
                      name="recipient_name"
                      onChange={(event) => setRecipientName(event.target.value)}
                      required
                      value={recipientName}
                    />
                  </FormField>
                  <FormField htmlFor="recipient_phone" label="Recipient phone">
                    <FormInput
                      id="recipient_phone"
                      name="recipient_phone"
                      onChange={(event) =>
                        setRecipientPhone(event.target.value)
                      }
                      required
                      type="tel"
                      value={recipientPhone}
                    />
                  </FormField>
                </div>
              ) : null}
              <FormField htmlFor="address_line_1" label="Address line 1">
                <FormInput
                  id="address_line_1"
                  name="address_line_1"
                  onChange={(event) => setAddressLine1(event.target.value)}
                  required
                  value={addressLine1}
                />
              </FormField>
              <FormField htmlFor="address_line_2" label="Address line 2">
                <FormInput
                  id="address_line_2"
                  name="address_line_2"
                  onChange={(event) => setAddressLine2(event.target.value)}
                  value={addressLine2}
                />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField htmlFor="postcode" label="Postcode">
                  <FormInput
                    id="postcode"
                    name="postcode"
                    onChange={(event) => setPostcode(event.target.value)}
                    required
                    value={postcode}
                  />
                </FormField>
                <FormField htmlFor="city" label="City">
                  <FormInput
                    id="city"
                    name="city"
                    onChange={(event) => setCity(event.target.value)}
                    required
                    value={city}
                  />
                </FormField>
                <FormField htmlFor="state" label="State">
                  <FormInput
                    id="state"
                    name="state"
                    onChange={(event) => setStateName(event.target.value)}
                    required
                    value={stateName}
                  />
                </FormField>
              </div>
              {!sameAsCustomer ? (
                <FormRadioGroup
                  legend="Should we inform the recipient?"
                  name="recipient_notify_preference"
                  onChange={(value) => setRecipientNotifyPreference(value)}
                  options={[...RECIPIENT_NOTIFY_OPTIONS]}
                  required
                  value={recipientNotifyPreference}
                />
              ) : null}
            </div>
          ) : null}
        </section>

        {complimentaryOptions.length > 0 || paidAddonOptions.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
              Options
            </h2>
            {complimentaryOptions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-ink text-sm font-medium">Complimentary</p>
                {complimentaryOptions.map((option) => (
                  <FormCheckbox
                    checked={complimentaryCodes.includes(option.code)}
                    key={option.code}
                    label={formatCustomerPreorderOptionLabel(option.name, 0)}
                    name="complimentary_code"
                    onChange={(event) =>
                      toggleComplimentary(option.code, event.target.checked)
                    }
                    value={option.code}
                  />
                ))}
              </div>
            ) : null}
            {paidAddonOptions.length > 0 ? (
              <div className="space-y-3">
                <p className="text-ink text-sm font-medium">Paid</p>
                {paidAddonOptions.map((option) => {
                  const messageVisible =
                    isCustomerPaidAddonCode(option.code) &&
                    customerPaidAddonMessageVisible(option.code, paidAddonCodes);
                  const messageRequired =
                    isCustomerPaidAddonCode(option.code) &&
                    customerPaidAddonMessageRequired(option.code, paidAddonCodes);
                  const messageValue =
                    option.code === "birthday_card"
                      ? birthdayCardMessage
                      : option.code === "wishing_card"
                        ? wishingCardMessage
                        : "";
                  return (
                    <div className="space-y-2" key={option.code}>
                      <FormCheckbox
                        checked={paidAddonCodes.includes(option.code)}
                        label={formatCustomerPreorderOptionLabel(
                          option.name,
                          option.unitPrice,
                        )}
                        name="paid_addon_code"
                        onChange={(event) =>
                          togglePaidAddon(option.code, event.target.checked)
                        }
                        value={option.code}
                      />
                      {messageVisible ? (
                        <FormField
                          help="Optional."
                          htmlFor={`${option.code}_message`}
                          label={`Written message on ${option.name}`}
                        >
                          <FormTextarea
                            id={`${option.code}_message`}
                            name={`${option.code}_message`}
                            onChange={(event) => {
                              if (option.code === "birthday_card") {
                                setBirthdayCardMessage(event.target.value);
                              } else if (option.code === "wishing_card") {
                                setWishingCardMessage(event.target.value);
                              }
                            }}
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
          <FormField
            help={FRESH_PICKS_NAME_HELP}
            htmlFor="customer_name"
            label="Name"
          >
            <FormInput
              defaultValue={cart.customerName}
              id="customer_name"
              name="customer_name"
              required
            />
          </FormField>
          <FormField
            help={FRESH_PICKS_WHATSAPP_NOTE}
            htmlFor="phone"
            label="WhatsApp phone"
          >
            <FormInput
              defaultValue={cart.phone}
              id="phone"
              name="phone"
              required
              type="tel"
            />
          </FormField>
          <FormRadioGroup
            legend="Would you like a copy of the receipt? (will be attached during pickup)"
            name="include_receipt"
            onChange={(value) =>
              setIncludeReceiptChoice(
                value === "yes" || value === "no" ? value : "",
              )
            }
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            required
            value={includeReceiptChoice}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Notes
          </h2>
          <p className="text-ink text-sm font-medium">Optional notes</p>
          <p
            className="text-status-danger text-sm leading-snug font-bold"
            id="optional-notes-warning"
          >
            {OPTIONAL_NOTES_CUSTOMER_WARNING}
          </p>
          <FormTextarea
            aria-describedby="optional-notes-warning"
            aria-label="Optional notes"
            defaultValue={cart.notes}
            id="notes"
            name="notes"
            rows={3}
          />
        </section>

        <FormError message={state.error} />

        <FormActions>
          <FormSubmitButton
            disabled={confirmOpen}
            pending={pending || Boolean(state.orderId)}
          >
            Place order
          </FormSubmitButton>
          <Link
            className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
            href="/extra"
          >
            Continue shopping
          </Link>
        </FormActions>
      </form>
      {confirmSnapshot ? (
        <CheckoutConfirmPrompt
          onConfirm={confirmOrder}
          onGoBack={goBackFromConfirm}
          open={confirmOpen}
          pending={pending || Boolean(state.orderId)}
          snapshot={confirmSnapshot}
        />
      ) : null}
    </>
  );
}
