"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CUSTOMER_FORM_HIGHLIGHT_SUMMARY,
  FormActions,
  FormCheckbox,
  FormError,
  FormField,
  FormInput,
  FormRadioGroup,
  FormRequiredLegend,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
  RequiredAsterisk,
  collectInvalidFieldMessages,
  focusFirstInvalidField,
  formStyles,
} from "@/components/ui/form";
import { DineInVenuePartyFields } from "@/components/ui/DineInVenuePartyFields";
import {
  EMPTY_DINE_IN_VENUE_PHOTOS,
  type DineInVenuePhotoMap,
} from "@/engines/orders/dine-in-venue-photos";
import {
  availableDineInVenues,
  dineInVenueLabel,
  parseDineInVenue,
  resolveDineInVenueSelection,
} from "@/engines/business-calendar/dine-in-hours";
import {
  derivedGuestCountDraft,
  parseDineInPartyCounts,
  readDineInPartyDraftFields,
} from "@/engines/orders/dine-in-party";
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
import {
  buildDeliveryProcessingFeeAckPayload,
  checkoutDeliveryChargesBreakdown,
  DELIVERY_FEE_LINE_LABEL,
  DELIVERY_FEE_PENDING_EXPLANATION,
  DELIVERY_FEE_PENDING_LABEL,
  DELIVERY_PROCESSING_FEE_ACK_LABEL,
  DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
  DELIVERY_PROCESSING_FEE_EXPLANATION,
  DELIVERY_PROCESSING_FEE_LINE_LABEL,
  DELIVERY_PROCESSING_FEE_SECTION_TITLE,
  deliveryProcessingFeeAckRequired,
  deliveryProcessingFeeAckSatisfied,
  deliveryProcessingFeeAckSnapshot,
  ITEMS_SUBTOTAL_LABEL,
  TOTAL_BEFORE_DELIVERY_FEE_LABEL,
} from "@/engines/orders/delivery-processing-fee-ack";
import { OPTIONAL_NOTES_CUSTOMER_WARNING } from "@/engines/orders/order-guide";
import { DineInReservationNotesNotice } from "@/workspaces/storefront/checkout/DineInReservationNotesNotice";
import { FulfilmentMethodChooser } from "@/workspaces/storefront/checkout/FulfilmentMethodChooser";
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
import {
  CatalogueVoucherAmountLines,
  catalogueVoucherPreviewPayable,
} from "@/workspaces/storefront/offers/CatalogueVoucherAmountLines";
import { useEligibleCatalogueVoucher } from "@/workspaces/storefront/offers/useEligibleCatalogueVoucher";

const initialState: ExtraOrderState = { error: null };

type GuestExtraCheckoutFormProps = {
  hoursSnapshot?: OperatingHoursSnapshot;
  preparationConfig?: FreshPicksPreparationConfig;
  venuePhotos?: DineInVenuePhotoMap;
};

export function GuestExtraCheckoutForm({
  hoursSnapshot = OPERATING_HOURS_SEED,
  preparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  venuePhotos = EMPTY_DINE_IN_VENUE_PHOTOS,
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
  const cartParty = readDineInPartyDraftFields(cart ?? {});
  const [adultCount, setAdultCount] = useState(cartParty.adultCount);
  const [kidCount, setKidCount] = useState(cartParty.kidCount);
  const [toddlerCount, setToddlerCount] = useState(cartParty.toddlerCount);
  const [
    whitebirdSplitSeatingAcknowledged,
    setWhitebirdSplitSeatingAcknowledged,
  ] = useState(cartParty.whitebirdSplitSeatingAcknowledged);
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
  const [stateName, setStateName] = useState(
    cart?.state || OWNER_DELIVERY_STATE,
  );
  const [recipientNotifyPreference, setRecipientNotifyPreference] = useState(
    cart?.recipientNotifyPreference ?? "",
  );
  const [selectedDate, setSelectedDate] = useState(pickupDate);
  const [selectedTime, setSelectedTime] = useState(pickupTime);
  const [deliveryProcessingAckSnapshot, setDeliveryProcessingAckSnapshot] =
    useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!cart) return;
    setIncludeReceiptChoice(cart.includeReceiptChoice);
    setComplimentaryCodes(cart.complimentaryCodes);
    setPaidAddonCodes(cart.paidAddonCodes);
    setBirthdayCardMessage(cart.birthdayCardMessage);
    setWishingCardMessage(cart.wishingCardMessage);
    setFulfilmentMethod(cart.fulfilmentMethod);
    setDineInVenue(cart.dineInVenue);
    const nextParty = readDineInPartyDraftFields(cart);
    setAdultCount(nextParty.adultCount);
    setKidCount(nextParty.kidCount);
    setToddlerCount(nextParty.toddlerCount);
    setWhitebirdSplitSeatingAcknowledged(
      nextParty.whitebirdSplitSeatingAcknowledged,
    );
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
  const catalogueVoucherDraft = {
    pickupDate: selectedDate,
    items: (cart?.items ?? []).map((item) => ({
      cakeId: "",
      sizeId: item.extraStockId,
      sizeLabel: item.sizeLabel,
      quantity: 1,
      unitPrice: item.unitPrice ?? 0,
    })),
  };
  const catalogueVoucher = useEligibleCatalogueVoucher(
    catalogueVoucherDraft,
    "fresh_pick",
  );

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
  const timeStillValid = usableSlots.some(
    (slot) => slot.value === selectedTime,
  );
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
  const deliveryAckRequired = deliveryProcessingFeeAckRequired(resolvedMethod);
  const deliveryProcessingFeeAcknowledged = deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: resolvedMethod,
    acknowledgedSnapshot: deliveryProcessingAckSnapshot,
  });
  const deliveryProcessingFeeAckJson =
    deliveryAckRequired && deliveryProcessingFeeAcknowledged
      ? JSON.stringify(buildDeliveryProcessingFeeAckPayload())
      : "";
  const deliveryCharges = checkoutDeliveryChargesBreakdown({
    fulfilmentMethod: resolvedMethod,
    itemsSubtotal: displayedTotal,
  });

  function applyFulfilment(next: CustomerWebsiteFulfilmentMethod) {
    if (next !== "delivery") {
      setDeliveryProcessingAckSnapshot("");
      setClientError(null);
    }
    setFulfilmentMethod(next);
  }

  function extraConfirmDetails(): string[] {
    if (resolvedMethod === "dine_in") {
      const details: string[] = [];
      const venue = parseDineInVenue(resolvedVenue || dineInVenue);
      if (venue) details.push(dineInVenueLabel(venue));
      const parsed = parseDineInPartyCounts({
        adultCount,
        kidCount,
        toddlerCount,
        guestCount: derivedGuestCountDraft({
          adultCount,
          kidCount,
          toddlerCount,
          whitebirdSplitSeatingAcknowledged,
        }),
      });
      if (parsed.ok) {
        details.push(
          `${parsed.counts.totalGuestCount} ${
            parsed.counts.totalGuestCount === 1 ? "guest" : "guests"
          }`,
        );
      }
      return details;
    }
    if (resolvedMethod === "delivery") {
      const details: string[] = [];
      const address = [addressLine1, addressLine2, postcode, city, stateName]
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
        adultCount,
        kidCount,
        toddlerCount,
        guestCount: derivedGuestCountDraft({
          adultCount,
          kidCount,
          toddlerCount,
          whitebirdSplitSeatingAcknowledged,
        }),
        whitebirdSplitSeatingAcknowledged,
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
    const errors = collectInvalidFieldMessages(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setClientError(CUSTOMER_FORM_HIGHLIGHT_SUMMARY);
      focusFirstInvalidField(form);
      return;
    }
    persistCheckoutFields(form);
    const data = new FormData(form);
    if (deliveryAckRequired && !deliveryProcessingFeeAcknowledged) {
      setFieldErrors((current) => ({
        ...current,
        delivery_processing_fee_ack_accepted:
          DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
      }));
      setClientError(CUSTOMER_FORM_HIGHLIGHT_SUMMARY);
      return;
    }
    setFieldErrors({});
    setClientError(null);
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
    if (deliveryAckRequired && !deliveryProcessingFeeAcknowledged) {
      setConfirmOpen(false);
      setClientError(DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE);
      return;
    }
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
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          openConfirm();
        }}
        ref={formRef}
      >
        <FormRequiredLegend />
        {cart.items.map((item) => (
          <span key={item.extraStockId}>
            <input
              name="extra_stock_id"
              type="hidden"
              value={item.extraStockId}
            />
            <input name="extra_cake_name" type="hidden" value={item.cakeName} />
          </span>
        ))}
        <input name="pickup_date" type="hidden" value={selectedDate} />
        <input
          name="pickup_time"
          type="hidden"
          value={timeStillValid ? selectedTime : ""}
        />
        <input name="fulfilment_method" type="hidden" value={resolvedMethod} />
        <input
          name="delivery_processing_fee_ack_json"
          type="hidden"
          value={deliveryProcessingFeeAckJson}
        />
        <input
          name="catalogue_voucher_id"
          type="hidden"
          value={catalogueVoucher?.id ?? ""}
        />

        <section className="space-y-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Your order
          </h2>
          <ul className="divide-fog divide-y">
            {cart.items.map((item) => (
              <li
                className="flex items-start justify-between gap-3 py-3"
                key={item.extraStockId}
              >
                <div>
                  <p className="text-ink text-sm font-medium">
                    {item.cakeName}
                  </p>
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
          {deliveryCharges ? (
            <div className="space-y-1.5">
              <p className="text-ink text-sm">
                {ITEMS_SUBTOTAL_LABEL} · {formatRm(deliveryCharges.itemsSubtotal)}
              </p>
              {catalogueVoucher ? (
                <p className="text-ink text-sm">
                  {catalogueVoucher.code} · -{" "}
                  {formatRm(Math.abs(catalogueVoucher.amount))}
                </p>
              ) : null}
              <p className="text-ink text-sm">
                {DELIVERY_PROCESSING_FEE_LINE_LABEL} ·{" "}
                {formatRm(deliveryCharges.processingFee)}
              </p>
              <p className="text-skyline text-sm">
                {DELIVERY_FEE_LINE_LABEL} · {DELIVERY_FEE_PENDING_LABEL}
              </p>
              <p className="text-ink text-sm font-semibold">
                {TOTAL_BEFORE_DELIVERY_FEE_LABEL} ·{" "}
                {formatRm(
                  catalogueVoucherPreviewPayable(
                    deliveryCharges.totalBeforeDeliveryFee,
                    catalogueVoucher,
                  ),
                )}
              </p>
            </div>
          ) : catalogueVoucher ? (
            <dl className="space-y-1.5">
              <CatalogueVoucherAmountLines
                commercialTotal={displayedTotal}
                voucher={catalogueVoucher}
              />
            </dl>
          ) : (
            <p className="text-ink text-sm font-semibold">
              Total · {formatRm(displayedTotal)}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Fulfilment
          </h2>
          <div className="flex flex-col gap-1.5">
            <label
              className="text-ink text-sm font-medium"
              htmlFor="checkout_pickup_date"
            >
              <span data-field-label="">
                {workspaceScheduleDateLabel(resolvedMethod)}
                <RequiredAsterisk />
              </span>
            </label>
            <FormSelect
              aria-invalid={fieldErrors.checkout_pickup_date ? true : undefined}
              className={
                fieldErrors.checkout_pickup_date
                  ? formStyles.invalidControlClass
                  : ""
              }
              id="checkout_pickup_date"
              onChange={(event) => {
                const next = event.target.value;
                setSelectedDate(next);
                const nextMethod = firstAvailableFreshPicksFulfilment(
                  next,
                  fulfilmentMethod,
                  fulfilmentContext,
                );
                applyFulfilment(nextMethod);
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
            {fieldErrors.checkout_pickup_date ? (
              <p className={formStyles.fieldErrorClass} role="alert">
                {fieldErrors.checkout_pickup_date}
              </p>
            ) : null}
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
                applyFulfilment(next);
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
              className="text-ink text-sm font-medium"
              htmlFor="checkout_pickup_time"
            >
              <span data-field-label="">
                {resolvedMethod === "dine_in"
                  ? "Dine-in reservation time"
                  : workspaceScheduleTimeLabel(resolvedMethod)}
                <RequiredAsterisk />
              </span>
            </label>
            <FormSelect
              aria-invalid={fieldErrors.checkout_pickup_time ? true : undefined}
              className={
                fieldErrors.checkout_pickup_time
                  ? formStyles.invalidControlClass
                  : ""
              }
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
            {fieldErrors.checkout_pickup_time ? (
              <p className={formStyles.fieldErrorClass} role="alert">
                {fieldErrors.checkout_pickup_time}
              </p>
            ) : null}
          </div>
          {resolvedMethod === "dine_in" ? (
            <div className="space-y-3">
              {dineInVenues.length > 0 ? (
                <DineInVenuePartyFields
                  fieldErrors={fieldErrors}
                  markRequired
                  onChange={(next) => {
                    setDineInVenue(next.venue);
                    setAdultCount(next.adultCount);
                    setKidCount(next.kidCount);
                    setToddlerCount(next.toddlerCount);
                    setWhitebirdSplitSeatingAcknowledged(
                      next.whitebirdSplitSeatingAcknowledged,
                    );
                  }}
                  photos={venuePhotos}
                  value={{
                    venue: resolvedVenue || dineInVenue,
                    adultCount,
                    kidCount,
                    toddlerCount,
                    whitebirdSplitSeatingAcknowledged,
                  }}
                  venues={dineInVenues}
                />
              ) : null}
              <DineInReservationNotesNotice />
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
                  <FormField
                    error={fieldErrors.recipient_name}
                    htmlFor="recipient_name"
                    label="Recipient name"
                    required
                  >
                    <FormInput
                      id="recipient_name"
                      name="recipient_name"
                      onChange={(event) => setRecipientName(event.target.value)}
                      required
                      value={recipientName}
                    />
                  </FormField>
                  <FormField
                    error={fieldErrors.recipient_phone}
                    htmlFor="recipient_phone"
                    label="Recipient phone"
                    required
                  >
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
              <FormField
                error={fieldErrors.address_line_1}
                htmlFor="address_line_1"
                label="Address line 1"
                required
              >
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
                <FormField
                  error={fieldErrors.postcode}
                  htmlFor="postcode"
                  label="Postcode"
                  required
                >
                  <FormInput
                    id="postcode"
                    name="postcode"
                    onChange={(event) => setPostcode(event.target.value)}
                    required
                    value={postcode}
                  />
                </FormField>
                <FormField
                  error={fieldErrors.city}
                  htmlFor="city"
                  label="City"
                  required
                >
                  <FormInput
                    id="city"
                    name="city"
                    onChange={(event) => setCity(event.target.value)}
                    required
                    value={city}
                  />
                </FormField>
                <FormField
                  error={fieldErrors.state}
                  htmlFor="state"
                  label="State"
                  required
                >
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
                  error={fieldErrors.recipient_notify_preference}
                  legend="Should we inform the recipient?"
                  name="recipient_notify_preference"
                  onChange={(value) => setRecipientNotifyPreference(value)}
                  options={[...RECIPIENT_NOTIFY_OPTIONS]}
                  required
                  value={recipientNotifyPreference}
                />
              ) : null}
              <div className="space-y-3">
                <p className="text-ink text-sm font-medium">
                  {DELIVERY_PROCESSING_FEE_SECTION_TITLE}
                </p>
                <p className="text-ink text-sm leading-relaxed">
                  {DELIVERY_PROCESSING_FEE_EXPLANATION}
                </p>
                <p className="text-ink text-sm leading-relaxed">
                  {DELIVERY_FEE_PENDING_EXPLANATION}
                </p>
                <FormCheckbox
                  checked={deliveryProcessingFeeAcknowledged}
                  error={fieldErrors.delivery_processing_fee_ack_accepted}
                  id="delivery_processing_fee_ack_accepted"
                  label={DELIVERY_PROCESSING_FEE_ACK_LABEL}
                  markRequired
                  name="delivery_processing_fee_ack_accepted"
                  required
                  onChange={(event) => {
                    setDeliveryProcessingAckSnapshot(
                      event.target.checked
                        ? deliveryProcessingFeeAckSnapshot()
                        : "",
                    );
                    if (event.target.checked) setClientError(null);
                  }}
                />
              </div>
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
                    customerPaidAddonMessageVisible(
                      option.code,
                      paidAddonCodes,
                    );
                  const messageRequired =
                    isCustomerPaidAddonCode(option.code) &&
                    customerPaidAddonMessageRequired(
                      option.code,
                      paidAddonCodes,
                    );
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
                          help={messageRequired ? undefined : "Optional."}
                          htmlFor={`${option.code}_message`}
                          label={`Written message on ${option.name}`}
                          required={messageRequired}
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
            error={fieldErrors.customer_name}
            help={FRESH_PICKS_NAME_HELP}
            htmlFor="customer_name"
            label="Name"
            required
          >
            <FormInput
              defaultValue={cart.customerName}
              id="customer_name"
              name="customer_name"
              required
            />
          </FormField>
          <FormField
            error={fieldErrors.phone}
            help={FRESH_PICKS_WHATSAPP_NOTE}
            htmlFor="phone"
            label="WhatsApp phone"
            required
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
            error={fieldErrors.include_receipt}
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

        <FormError message={clientError ?? state.error} />

        <FormActions>
          <FormSubmitButton
            disabled={
              confirmOpen ||
              (deliveryAckRequired && !deliveryProcessingFeeAcknowledged)
            }
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
