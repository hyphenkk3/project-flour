"use client";

import { useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import {
  EMPTY_DINE_IN_VENUE_PHOTOS,
  type DineInVenuePhotoMap,
} from "@/engines/orders/dine-in-venue-photos";
import {
  dineInVenueLabel,
  parseDineInVenue,
} from "@/engines/business-calendar/dine-in-hours";
import {
  derivedGuestCountDraft,
  parseDineInPartyCounts,
  readDineInPartyDraftFields,
} from "@/engines/orders/dine-in-party";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  extraCustomerSameDayUnavailableNoticeForDate,
  extraCustomerVisibleFulfilmentDates,
  firstAvailableFreshPicksFulfilmentForItems,
  freshPicksChooserStatesForItems,
  freshPicksDineInReservationSlots,
  freshPicksDineInServingSlotsForReservation,
  freshPicksDineInVenuesForPair,
  freshPicksMethodAvailabilityForItems,
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
import { customerNameValidationError } from "@/engines/orders/customer-name";
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
  loadFreshPickPrices,
  loadExtraCustomerOptions,
  submitGuestExtraOrderAction,
  type ExtraOrderState,
  type FreshPickPrice,
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
import {
  beginSuccessNavigationPerf,
  CheckoutReceivedShellProbe,
  markCheckoutActionReturned,
  submitGuestOrderAndNavigate,
  useCheckoutActionReturnPerf,
} from "@/workspaces/storefront/checkout/CheckoutDevPerf";
import { StorefrontSuccessLoading } from "@/workspaces/storefront/checkout/StorefrontSuccessLoading";

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
  const router = useRouter();
  const [state, , pending] = useActionState(
    submitGuestExtraOrderAction,
    initialState,
  );
  useCheckoutActionReturnPerf(pending, "extra", state.perf);
  const [actionState, setActionState] = useState<typeof initialState | null>(
    null,
  );
  const [actionPending, setActionPending] = useState(false);
  const [receivedShell, setReceivedShell] = useState(false);
  const navigatedRef = useRef(false);
  const viewState = actionState ?? state;
  const submitPending = pending || actionPending;
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
  const [reservationTime, setReservationTime] = useState(
    cart?.reservationTime ?? "",
  );
  const cartItemIds = (cart?.items ?? []).map((item) => item.extraStockId);
  const pricingKey = `${selectedDate}|${cartItemIds.join(",")}`;
  const [pricing, setPricing] = useState<{
    key: string;
    items: FreshPickPrice[];
    error: string | null;
  }>({ key: "", items: [], error: null });
  const pricingReady = pricing.key === pricingKey && !pricing.error;
  const pricingError = pricing.key === pricingKey ? pricing.error : null;
  const priceByExtraId = new Map(
    pricing.items.map((item) => [item.extraStockId, item]),
  );
  const pricedItems = (cart?.items ?? []).map((item) => {
    const resolved = priceByExtraId.get(item.extraStockId);
    return {
      ...item,
      cakeId: resolved?.cakeId ?? item.cakeId ?? "",
      cakeSizeId: resolved?.cakeSizeId ?? item.cakeSizeId ?? "",
      unitPrice: pricingReady ? (resolved?.unitPrice ?? null) : null,
    };
  });
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
    setReservationTime(cart.reservationTime);
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
    let cancelled = false;
    const extraStockIds = (cart?.items ?? []).map((item) => item.extraStockId);
    if (extraStockIds.length === 0 || !selectedDate) return;
    void loadFreshPickPrices(extraStockIds, selectedDate).then((result) => {
      if (cancelled) return;
      setPricing({ key: pricingKey, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [cart, pricingKey, selectedDate]);

  useLayoutEffect(() => {
    if (!viewState.orderId || navigatedRef.current) return;
    navigatedRef.current = true;
    markCheckoutActionReturned();
    beginSuccessNavigationPerf();
    router.replace(
      `/order/success?order=${viewState.orderId}&flow=${FRESH_PICKS_SUCCESS_FLOW}`,
    );
  }, [router, viewState.orderId]);

  const displayedTotal = customerPreorderCommercialTotal({
    items: pricedItems.map((item) => ({
      unitPrice: item.unitPrice ?? 0,
      quantity: 1,
    })),
    options: paidAddonOptions,
    selectedCodes: paidAddonCodes,
  });
  const displayedTotalLabel = pricingReady ? formatRm(displayedTotal) : "—";
  const catalogueVoucherDraft = {
    pickupDate: selectedDate,
    items: pricedItems.map((item) => ({
      cakeId: item.cakeId,
      sizeId: item.cakeSizeId,
      sizeLabel: item.sizeLabel,
      quantity: 1,
      unitPrice: item.unitPrice ?? 0,
    })),
  };
  const catalogueVoucher = useEligibleCatalogueVoucher(
    catalogueVoucherDraft,
    "fresh_pick",
    { enabled: pricingReady },
  );

  const physicalItemContexts = (cart?.items ?? []).map((item) => ({
    window: {
      pickupAvailableFromAt:
        item.pickupAvailableFromAt || cart?.pickupAvailableFromAt || "",
      orderCutoffAt: item.orderCutoffAt || cart?.orderCutoffAt || "",
    },
    readyForCollection: item.readyForCollection,
  }));
  const fulfilmentContext = {
    snapshot: hoursSnapshot,
    config: preparationConfig,
  };
  const candidateDates = physicalItemContexts.map((item) =>
    extraCustomerVisibleFulfilmentDates({
      ...item,
      ...fulfilmentContext,
    }),
  );
  const dates = physicalItemContexts.length
    ? candidateDates[0]!.filter(
        (date) =>
          candidateDates.every((itemDates) => itemDates.includes(date)) &&
          (["pickup", "dine_in", "delivery"] as const).some(
            (method) =>
              freshPicksMethodAvailabilityForItems(
                method,
                date,
                physicalItemContexts,
                fulfilmentContext,
              ).available,
          ),
      )
    : [];
  const sameDayNotice = cart && physicalItemContexts.length > 0 && selectedDate
    ? extraCustomerSameDayUnavailableNoticeForDate(selectedDate, {
        ...physicalItemContexts[0]!,
        ...fulfilmentContext,
      })
    : null;
  const methodStates = selectedDate
    ? freshPicksChooserStatesForItems(
        selectedDate,
        physicalItemContexts,
        fulfilmentContext,
      )
    : undefined;
  const resolvedMethod = selectedDate
    ? firstAvailableFreshPicksFulfilmentForItems(
        selectedDate,
        fulfilmentMethod,
        physicalItemContexts,
        fulfilmentContext,
      )
    : fulfilmentMethod;
  const methodAvailability = selectedDate
    ? freshPicksMethodAvailabilityForItems(
        resolvedMethod,
        selectedDate,
        physicalItemContexts,
        fulfilmentContext,
      )
    : null;
  const methodSlots = methodAvailability?.slots ?? [];
  const reservationSlots =
    resolvedMethod === "dine_in" && selectedDate
      ? freshPicksDineInReservationSlots(
          selectedDate,
          methodSlots,
          hoursSnapshot,
        )
      : [];
  const usableSlots =
    resolvedMethod === "dine_in" && selectedDate && reservationTime
      ? freshPicksDineInServingSlotsForReservation(
          selectedDate,
          reservationTime,
          methodSlots,
          hoursSnapshot,
        )
      : resolvedMethod === "dine_in"
        ? []
        : methodSlots;
  const timeStillValid = usableSlots.some(
    (slot) => slot.value === selectedTime,
  );
  const dineInVenues =
    resolvedMethod === "dine_in" && selectedDate && reservationTime && timeStillValid
      ? freshPicksDineInVenuesForPair(
          selectedDate,
          reservationTime,
          selectedTime,
          hoursSnapshot,
        )
      : [];
  const parsedDineInVenue = parseDineInVenue(dineInVenue);
  const resolvedVenue =
    parsedDineInVenue && dineInVenues.includes(parsedDineInVenue)
      ? parsedDineInVenue
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
    const nextSlots = freshPicksMethodAvailabilityForItems(
      next,
      selectedDate,
      physicalItemContexts,
      fulfilmentContext,
    ).slots;
    if (next !== "dine_in") {
      setReservationTime("");
      setDineInVenue("");
      setSelectedTime((current) =>
        nextSlots.some((slot) => slot.value === current) ? current : "",
      );
      return;
    }
    const nextReservations = freshPicksDineInReservationSlots(
      selectedDate,
      nextSlots,
      hoursSnapshot,
    );
    const nextReservation = nextReservations.some(
      (slot) => slot.value === reservationTime,
    )
      ? reservationTime
      : "";
    const nextServingSlots = nextReservation
      ? freshPicksDineInServingSlotsForReservation(
          selectedDate,
          nextReservation,
          nextSlots,
          hoursSnapshot,
        )
      : [];
    const nextServing = nextServingSlots.some(
      (slot) => slot.value === selectedTime,
    )
      ? selectedTime
      : "";
    const nextVenues = nextServing
      ? freshPicksDineInVenuesForPair(
          selectedDate,
          nextReservation,
          nextServing,
          hoursSnapshot,
        )
      : [];
    setReservationTime(nextReservation);
    setSelectedTime(nextServing);
    setDineInVenue(
      nextVenues.includes(dineInVenue as "hyphen" | "whitebird")
        ? dineInVenue
        : "",
    );
  }

  function changeSelectedDate(nextDate: string) {
    setSelectedDate(nextDate);
    const nextMethod = firstAvailableFreshPicksFulfilmentForItems(
      nextDate,
      fulfilmentMethod,
      physicalItemContexts,
      fulfilmentContext,
    );
    setFulfilmentMethod(nextMethod);
    const nextSlots = freshPicksMethodAvailabilityForItems(
      nextMethod,
      nextDate,
      physicalItemContexts,
      fulfilmentContext,
    ).slots;
    if (nextMethod !== "dine_in") {
      setReservationTime("");
      setDineInVenue("");
      setSelectedTime((current) =>
        nextSlots.some((slot) => slot.value === current) ? current : "",
      );
      return;
    }
    const nextReservations = freshPicksDineInReservationSlots(
      nextDate,
      nextSlots,
      hoursSnapshot,
    );
    const nextReservation = nextReservations.some(
      (slot) => slot.value === reservationTime,
    )
      ? reservationTime
      : "";
    const nextServingSlots = nextReservation
      ? freshPicksDineInServingSlotsForReservation(
          nextDate,
          nextReservation,
          nextSlots,
          hoursSnapshot,
        )
      : [];
    const nextServing = nextServingSlots.some(
      (slot) => slot.value === selectedTime,
    )
      ? selectedTime
      : "";
    const nextVenues = nextServing
      ? freshPicksDineInVenuesForPair(
          nextDate,
          nextReservation,
          nextServing,
          hoursSnapshot,
        )
      : [];
    setReservationTime(nextReservation);
    setSelectedTime(nextServing);
    setDineInVenue(
      nextVenues.includes(dineInVenue as "hyphen" | "whitebird")
        ? dineInVenue
        : "",
    );
  }

  function changeReservationTime(nextReservation: string) {
    setReservationTime(nextReservation);
    const servingSlots = freshPicksDineInServingSlotsForReservation(
      selectedDate,
      nextReservation,
      methodSlots,
      hoursSnapshot,
    );
    const nextServing = servingSlots.some(
      (slot) => slot.value === selectedTime,
    )
      ? selectedTime
      : "";
    const nextVenues = nextServing
      ? freshPicksDineInVenuesForPair(
          selectedDate,
          nextReservation,
          nextServing,
          hoursSnapshot,
        )
      : [];
    setSelectedTime(nextServing);
    setDineInVenue(
      nextVenues.includes(dineInVenue as "hyphen" | "whitebird")
        ? dineInVenue
        : "",
    );
  }

  function changeCakeServingTime(nextServing: string) {
    setSelectedTime(nextServing);
    const nextVenues = reservationTime
      ? freshPicksDineInVenuesForPair(
          selectedDate,
          reservationTime,
          nextServing,
          hoursSnapshot,
        )
      : [];
    setDineInVenue(
      nextVenues.includes(dineInVenue as "hyphen" | "whitebird")
        ? dineInVenue
        : "",
    );
  }

  function extraConfirmDetails(): string[] {
    if (resolvedMethod === "dine_in") {
      const details: string[] = [];
      const venue = parseDineInVenue(resolvedVenue);
      if (venue) details.push(dineInVenueLabel(venue));
      if (reservationTime) {
        details.push(`Reservation ${formatPickupTime(reservationTime)}`);
      }
      if (timeStillValid && selectedTime) {
        details.push(`Cake served ${formatPickupTime(selectedTime)}`);
      }
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
        reservationTime:
          resolvedMethod === "dine_in" ? reservationTime : "",
        fulfilmentMethod: resolvedMethod,
        dineInVenue: resolvedMethod === "dine_in" ? resolvedVenue : "",
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
    if (!pricingReady || pricedItems.some((item) => item.unitPrice == null)) {
      setClientError(pricingError || "Fresh Pick pricing is still loading.");
      return;
    }
    const errors = collectInvalidFieldMessages(form);
    const customerNameError = customerNameValidationError(
      String(new FormData(form).get("customer_name") ?? ""),
    );
    const validationErrors = customerNameError
      ? { ...errors, customer_name: customerNameError }
      : errors;
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
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
        items: pricedItems,
        cakeName: pricedItems[0]?.cakeName ?? "",
        sizeLabel: pricedItems[0]?.sizeLabel ?? "",
        unitPrice: pricedItems[0]?.unitPrice ?? null,
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
        eligibleWholeCakeQuantity: cart?.items.length ?? 0,
        total: displayedTotal,
        catalogueVoucher,
      }),
    );
    setConfirmOpen(true);
  }

  async function confirmOrder() {
    if (submitPending || viewState.orderId || navigatedRef.current) return;
    if (!pricingReady || pricedItems.some((item) => item.unitPrice == null)) {
      setConfirmOpen(false);
      setClientError(pricingError || "Fresh Pick pricing is still loading.");
      return;
    }
    if (deliveryAckRequired && !deliveryProcessingFeeAcknowledged) {
      setConfirmOpen(false);
      setClientError(DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE);
      return;
    }
    const formData = pendingSubmitRef.current;
    if (!formData) return;
    setActionPending(true);
    const result = await submitGuestOrderAndNavigate({
      formData,
      flow: "extra",
      action: submitGuestExtraOrderAction,
      hrefForOrderId: (orderId) =>
        `/order/success?order=${orderId}&flow=${FRESH_PICKS_SUCCESS_FLOW}`,
      replace: (href) => router.replace(href),
      markNavigated: () => {
        navigatedRef.current = true;
      },
      onCommitted: () => {
        setReceivedShell(true);
      },
    });
    if (result.error) {
      setActionState(result);
      setActionPending(false);
    }
  }

  function goBackFromConfirm() {
    if (submitPending || viewState.orderId) return;
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

  if (receivedShell) {
    return (
      <>
        <CheckoutReceivedShellProbe flow="extra" />
        <StorefrontSuccessLoading />
      </>
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
        {pricedItems.map((item) => (
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
        <input
          name="reservation_time"
          type="hidden"
          value={resolvedMethod === "dine_in" ? reservationTime : ""}
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
            {pricedItems.map((item) => (
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
          {pricingError ? (
            <p className="text-signal text-sm" role="alert">
              {pricingError}
            </p>
          ) : null}
          {!pricingReady && !pricingError ? (
            <p className="text-skyline text-sm" role="status">
              Updating prices for your selected pickup date…
            </p>
          ) : null}
          <p className="text-skyline text-sm">
            {workspaceFulfilmentSectionTitle(resolvedMethod)} ·{" "}
            {formatShortBusinessDate(selectedDate) || selectedDate} ·{" "}
              {resolvedMethod === "dine_in"
                ? `Reservation ${formatPickupTime(reservationTime)} · cake served ${formatPickupTime(timeStillValid ? selectedTime : "")}`
                : formatPickupTime(timeStillValid ? selectedTime : "")}
          </p>
          {deliveryCharges ? (
            <div className="space-y-1.5">
              <p className="text-ink text-sm">
                {ITEMS_SUBTOTAL_LABEL} ·{" "}
                {pricingReady ? formatRm(deliveryCharges.itemsSubtotal) : "—"}
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
                {pricingReady ? formatRm(
                  catalogueVoucherPreviewPayable(
                    deliveryCharges.totalBeforeDeliveryFee,
                    catalogueVoucher,
                  ),
                ) : "—"}
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
              Total · {displayedTotalLabel}
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
              onChange={(event) => changeSelectedDate(event.target.value)}
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
              onChange={(value) =>
                applyFulfilment(parseCustomerWebsiteFulfilmentMethod(value))
              }
              value={resolvedMethod}
            />
          ) : null}
          {resolvedMethod === "dine_in" ? (
            <>
              <PickupSlotFields
                defaultDate={selectedDate}
                defaultTime={reservationTime}
                hoursSnapshot={hoursSnapshot}
                key={`fresh-pick-checkout-reservation-${selectedDate}`}
                markRequired
                onTimeChange={changeReservationTime}
                includeFieldNames={false}
                showDate={false}
                slotsForDate={() => reservationSlots}
                timeError={fieldErrors.reservation_time}
                timeHelp="Choose when you would like your table reservation to start."
                timeId="checkout_reservation_time"
                timeLabel="Dine-in reservation time"
                timeName="reservation_time"
              />
              <PickupSlotFields
                defaultDate={selectedDate}
                defaultTime={timeStillValid ? selectedTime : ""}
                hoursSnapshot={hoursSnapshot}
                key={`fresh-pick-checkout-serving-${selectedDate}-${reservationTime}`}
                markRequired
                onTimeChange={changeCakeServingTime}
                includeFieldNames={false}
                showDate={false}
                slotsForDate={() => usableSlots}
                timeError={fieldErrors.pickup_time}
                timeHelp="Choose when you would like your cake served. It must be within 1 hour of your reservation time."
                timeId="checkout_pickup_time"
                timeLabel="Cake serving time"
                timeName="pickup_time"
              />
              {reservationTime && timeStillValid ? (
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
                        venue: resolvedVenue,
                        adultCount,
                        kidCount,
                        toddlerCount,
                        whitebirdSplitSeatingAcknowledged,
                      }}
                      venues={dineInVenues}
                    />
                  ) : (
                    <p className="text-ink text-sm" role="status">
                      No dine-in venue is available for this date and the items in your order.
                    </p>
                  )}
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
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label
                className="text-ink text-sm font-medium"
                htmlFor="checkout_pickup_time"
              >
                <span data-field-label="">
                  {workspaceScheduleTimeLabel(resolvedMethod)}
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
          )}
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

        <FormError message={clientError ?? viewState.error} />

        <FormActions>
          <FormSubmitButton
            disabled={
              confirmOpen ||
              (deliveryAckRequired && !deliveryProcessingFeeAcknowledged)
            }
            pending={submitPending || Boolean(viewState.orderId)}
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
          pending={submitPending || Boolean(viewState.orderId)}
          snapshot={confirmSnapshot}
        />
      ) : null}
    </>
  );
}
