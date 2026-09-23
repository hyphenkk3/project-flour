"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  FormSubmitButton,
  FormTextarea,
  collectInvalidFieldMessages,
  focusElementById,
  focusFirstInvalidField,
} from "@/components/ui/form";
import { OPTIONAL_NOTES_CUSTOMER_WARNING } from "@/engines/orders/order-guide";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import { DineInVenuePartyFields } from "@/components/ui/DineInVenuePartyFields";
import { derivedGuestCountDraft } from "@/engines/orders/dine-in-party";
import {
  EMPTY_DINE_IN_VENUE_PHOTOS,
  type DineInVenuePhotoMap,
} from "@/engines/orders/dine-in-venue-photos";
import {
  ORDERS_CLOSED_CUSTOMER_LABEL,
  ORDERS_CLOSED_RPC_MESSAGE,
  customerPickupSlotsForDate,
  isPickupOrdersClosed,
} from "@/engines/business-calendar/order-availability";
import { getDeliverySlotsForDate } from "@/engines/business-calendar/delivery-hours";
import {
  cakeServingSlotsForReservation,
  getDineInSlotsForDate,
  resolveDineInVenueForPair,
  venuesForReservationAndServing,
} from "@/engines/business-calendar/dine-in-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import { getPickupSlotsForDate } from "@/engines/business-calendar/pickup-slots";
import { malaysiaPreorderBusinessDate } from "@/engines/preorder/business-date";
import {
  emptyCartEarliestCollectionDate,
  lineEarliestCollectionDate,
  preorderCartLineId,
  readPreorderDays,
} from "@/engines/preorder/lead";
import type { PreorderCartLine } from "@/engines/preorder/types";
import {
  cakePickupAvailabilityNotesById,
  evaluateCartPickupCompatibility,
} from "@/engines/preorder/cart-pickup-compatibility";
import {
  customerCollectionDateMessage,
  customerFullyBookedDateMessage,
  customerSelectedDateInvalidatedMessage,
  evaluateCollectionDate,
  findNextValidCollectionDate,
} from "@/engines/preorder/validate";
import type { CakePickupMembership } from "@/workspaces/storefront/catalog/queries";
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
import {
  CUSTOMER_NAME_HELP,
  CUSTOMER_NAME_SPACE_HINT,
  customerNameValidationError,
} from "@/engines/orders/customer-name";
import {
  WAITING_LIST_AVAILABLE_LABEL,
  WAITING_LIST_CLOSED_NONE,
  WAITING_LIST_CLOSED_REGULAR_ORDERS,
  WAITING_LIST_SEE_AVAILABLE_CTA,
  WAITING_LIST_SEE_AVAILABLE_HELP,
  WAITING_LIST_WHATSAPP_NOTE,
} from "@/engines/waiting-list/phone";
import {
  buildCheckoutConfirmSnapshot,
  CheckoutConfirmPrompt,
} from "@/workspaces/storefront/checkout/CheckoutConfirmPrompt";
import { CheckoutOrderSummary } from "@/workspaces/storefront/checkout/CheckoutOrderSummary";
import { CheckoutSection } from "@/workspaces/storefront/checkout/CheckoutSection";
import { DineInReservationNotesNotice } from "@/workspaces/storefront/checkout/DineInReservationNotesNotice";
import { FulfilmentMethodChooser } from "@/workspaces/storefront/checkout/FulfilmentMethodChooser";
import type { StorefrontCake } from "@/types/storefront";
import { formatCollectionAvailabilityLabel, formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  draftEarliestCollectionYmd,
  draftItemSizeChoices,
  draftStrongestPreorder,
} from "@/workspaces/storefront/cart/cart-order-summary";
import {
  checkoutCartCapacityKey,
  checkoutDraftItemsInCatalogue,
  isCheckoutCalendarPending,
  isCheckoutLiveOfferPending,
} from "@/workspaces/storefront/checkout/checkout-draft-availability";
import {
  customerPaidAddonMessageRequired,
  customerPaidAddonMessageVisible,
  customerPreorderCommercialTotal,
  formatCustomerPreorderOptionLabel,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
} from "@/engines/orders/customer-preorder-options";
import {
  applyApplicableUnitPrices,
  buildCakePriceAckPayload,
  CAKE_PRICE_ACK_REQUIRED_MESSAGE,
  cakePriceAckRequired,
  cakePriceAckSatisfied,
  cakePriceAckSnapshot,
  cakePriceChangeLines,
  chargedDraftItemUnitPrice,
  isCakePriceAckStaleError,
} from "@/engines/orders/cake-size-price-ack";
import {
  buildDeliveryProcessingFeeAckPayload,
  checkoutDeliveryChargesBreakdown,
  DELIVERY_FEE_PENDING_EXPLANATION,
  DELIVERY_PROCESSING_FEE_ACK_LABEL,
  DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
  DELIVERY_PROCESSING_FEE_EXPLANATION,
  DELIVERY_PROCESSING_FEE_SECTION_TITLE,
  deliveryProcessingFeeAckRequired,
  deliveryProcessingFeeAckSatisfied,
  deliveryProcessingFeeAckSnapshot,
} from "@/engines/orders/delivery-processing-fee-ack";
import {
  loadCartDateCapacityAvailability,
  loadCheckoutCalendarContext,
  loadCheckoutPickupOffer,
  resolveCheckoutCakeSizePrices,
  submitGuestPreorderAction,
  type CheckoutPickupOffer,
  type CheckoutState,
} from "@/workspaces/storefront/checkout/actions";
import { clampCustomerPickupWindow } from "@/engines/menu/customer-browse";
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
import { CustomerWaitingListAvailability } from "@/workspaces/storefront/waiting-list/CustomerWaitingListAvailability";
import { JoinWaitingListForm } from "@/workspaces/storefront/waiting-list/JoinWaitingListForm";
import { loadCustomerWaitingListAvailability } from "@/workspaces/storefront/waiting-list/actions";
import type { CustomerWaitingListAvailability as CustomerWaitingListAvailabilityData } from "@/workspaces/storefront/waiting-list/availability-types";

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
  pickupScopeFrom?: string | null;
  pickupScopeTo?: string | null;
  pickupScopeConstrainsBounds?: boolean;
  /** Special-menu dates unavailable while browsing a monthly collection with an empty cart. */
  entrySpecialUnavailableDates?: readonly string[];
  hoursSnapshot?: OperatingHoursSnapshot;
};

function combinePickupBounds(
  baseMin: string,
  baseMax: string | null,
  cartBounds: { min: string; max: string } | null,
  scopeConstrainsBounds: boolean,
  scopeFrom: string | null,
  scopeTo: string | null,
  earliest: string,
): { min: string; max: string | null } {
  let min = baseMin;
  let max = baseMax;

  if (cartBounds) {
    min = cartBounds.min > min ? cartBounds.min : min;
    if (max) {
      max = cartBounds.max < max ? cartBounds.max : max;
    } else {
      max = cartBounds.max;
    }
  }

  if (scopeConstrainsBounds && scopeFrom && scopeTo) {
    const scoped = clampCustomerPickupWindow(earliest, scopeFrom, scopeTo);
    if (scoped) {
      min = scoped.min > min ? scoped.min : min;
      max = max ? (scoped.max < max ? scoped.max : max) : scoped.max;
    }
  }

  if (max && min > max) {
    min = max;
  }
  return { min, max };
}

function toPreorderLines(
  items: PreorderDraftItem[],
  cakes: StorefrontCake[],
): PreorderCartLine[] {
  return items.map((item) => {
    const cake = cakes.find((entry) => entry.id === item.cakeId);
    const size = cake?.sizes.find((entry) => entry.id === item.sizeId);
    return {
      lineId: preorderCartLineId(item.cakeId, item.sizeId),
      cakeId: item.cakeId,
      cakeSizeId: item.sizeId,
      cakeName: item.cakeName,
      sizeLabel: item.sizeLabel,
      quantity: item.quantity,
      preorderDays: readPreorderDays(size?.preorderDays ?? item.preorderDays),
    };
  });
}

function pickerMinForCart(
  items: PreorderDraftItem[],
  cakes: StorefrontCake[],
  selectedYmd: string,
): string {
  const emptyFloor = emptyCartEarliestCollectionDate();
  const businessDate = malaysiaPreorderBusinessDate(new Date());
  const lines = toPreorderLines(items, cakes);
  const candidates = [
    emptyFloor,
    ...lines.map((line) => lineEarliestCollectionDate(line, businessDate)),
  ];
  if (/^\d{4}-\d{2}-\d{2}$/.test(selectedYmd)) {
    candidates.push(selectedYmd);
  }
  return candidates.reduce((min, value) => (value < min ? value : min));
}

function persistDraft(
  items: PreorderDraftItem[],
  fields: PreorderDraftFields,
): void {
  const draft: PreorderDraft = {
    ...fields,
    email: "",
    emailSubmissionReceiptRequested: false,
    items: items.map((item) => ({
      cakeId: item.cakeId,
      sizeId: item.sizeId,
      quantity: item.quantity,
      cakeName: item.cakeName,
      sizeLabel: item.sizeLabel,
      unitPrice: item.unitPrice,
      preorderDays: item.preorderDays,
      imageUrl: item.imageUrl,
      sizeChoices: item.sizeChoices,
    })),
  };
  writePreorderDraft(draft);
}

const checkoutPickupOfferCache = new Map<string, CheckoutPickupOffer>();
const checkoutCakeSizePriceCache = new Map<string, Record<string, number>>();

export function GuestCheckoutForm({
  suggestedPickupDate = null,
  minPickupDate = null,
  maxPickupDate = null,
  pickupScopeFrom = null,
  pickupScopeTo = null,
  pickupScopeConstrainsBounds = false,
}: GuestCheckoutFormProps) {
  const [state, formAction, pending] = useActionState(
    submitGuestPreorderAction,
    initialState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingSubmitRef = useRef<FormData | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [resolvedPriceKey, setResolvedPriceKey] = useState<string | null>(null);
  const [priceRefreshKey, setPriceRefreshKey] = useState(0);
  const [acknowledgedSnapshot, setAcknowledgedSnapshot] = useState("");
  const [deliveryProcessingAckSnapshot, setDeliveryProcessingAckSnapshot] =
    useState("");

  useEffect(() => {
    if (state.error) {
      setConfirmOpen(false);
      if (isCakePriceAckStaleError(state.error)) {
        checkoutCakeSizePriceCache.clear();
        setAcknowledgedSnapshot("");
        setPriceRefreshKey((key) => key + 1);
      }
    }
  }, [state.error]);

  useEffect(() => {
    const orderId = state.orderId;
    if (!orderId || state.error) return;
    window.location.assign(`/order/success?order=${orderId}`);
  }, [state.error, state.orderId]);

  const [items, setItems] = useState<PreorderDraftItem[]>([]);
  const [fields, setFields] = useState<PreorderDraftFields>(() =>
    emptyPreorderFields(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
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
  const [resolvedOfferDate, setResolvedOfferDate] = useState<string | null>(
    null,
  );
  const [addSizeByCake, setAddSizeByCake] = useState<Record<string, string>>(
    {},
  );
  const [addingCake, setAddingCake] = useState(false);
  const [changingDate, setChangingDate] = useState(true);
  const [cartPickupBounds, setCartPickupBounds] = useState<{
    min: string;
    max: string;
    excludedDates: string[];
  } | null>(null);
  const [cakePickupMemberships, setCakePickupMemberships] = useState<
    CakePickupMembership[]
  >([]);
  const [activeSpecialWindows, setActiveSpecialWindows] = useState<
    ReadonlyArray<{ from: string; to: string }>
  >([]);
  const [calendarEarliestYmd, setCalendarEarliestYmd] = useState(
    emptyCartEarliestCollectionDate(),
  );
  const [loadedCakeIdsKey, setLoadedCakeIdsKey] = useState("");
  const [closedDates, setClosedDates] = useState<readonly string[]>([]);
  const [entrySpecialUnavailableDates, setEntrySpecialUnavailableDates] =
    useState<readonly string[]>([]);
  const [hoursSnapshot, setHoursSnapshot] =
    useState<OperatingHoursSnapshot>(OPERATING_HOURS_SEED);
  const [venuePhotos, setVenuePhotos] = useState<DineInVenuePhotoMap>(
    EMPTY_DINE_IN_VENUE_PHOTOS,
  );
  const [liveMinPickupDate, setLiveMinPickupDate] = useState<string | null>(
    null,
  );
  const [liveMaxPickupDate, setLiveMaxPickupDate] = useState<string | null>(
    null,
  );
  const [liveScopeConstrainsBounds, setLiveScopeConstrainsBounds] = useState<
    boolean | null
  >(null);
  const [calendarReady, setCalendarReady] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [cartCapacity, setCartCapacity] = useState<{
    fullyBookedDates: string[];
    waitingListDates: string[];
    blockingCakeNamesByDate: Record<string, string[]>;
    waitingListLineKeysByDate: Record<string, string[]>;
  }>({
    fullyBookedDates: [],
    waitingListDates: [],
    blockingCakeNamesByDate: {},
    waitingListLineKeysByDate: {},
  });
  const [closedWaitingList, setClosedWaitingList] =
    useState<CustomerWaitingListAvailabilityData | null>(null);
  const [waitingListAvailabilityOpen, setWaitingListAvailabilityOpen] =
    useState(false);

  const effectivePickupBounds = useMemo(() => {
    const pickerMin = pickerMinForCart(items, cakes, fields.pickupDate);
    const combined = combinePickupBounds(
      (liveMinPickupDate ?? minPickupDate)?.trim().slice(0, 10) ||
        emptyCartEarliestCollectionDate(),
      (liveMaxPickupDate ?? maxPickupDate)?.trim().slice(0, 10) ?? null,
      cartPickupBounds,
      liveScopeConstrainsBounds ?? pickupScopeConstrainsBounds,
      pickupScopeFrom?.trim().slice(0, 10) ?? null,
      pickupScopeTo?.trim().slice(0, 10) ?? null,
      emptyCartEarliestCollectionDate(),
    );
    return {
      min: pickerMin,
      max: combined.max,
    };
  }, [
    cartPickupBounds,
    cakes,
    fields.pickupDate,
    items,
    liveMaxPickupDate,
    liveMinPickupDate,
    liveScopeConstrainsBounds,
    maxPickupDate,
    minPickupDate,
    pickupScopeConstrainsBounds,
    pickupScopeFrom,
    pickupScopeTo,
  ]);

  const effectiveExcludedDates = useMemo(() => {
    const scopeConstrains =
      liveScopeConstrainsBounds ?? pickupScopeConstrainsBounds;
    if (scopeConstrains) return [];
    if (cartPickupBounds && items.length > 0) {
      return cartPickupBounds.excludedDates;
    }
    return [...entrySpecialUnavailableDates];
  }, [
    cartPickupBounds,
    entrySpecialUnavailableDates,
    items.length,
    liveScopeConstrainsBounds,
    pickupScopeConstrainsBounds,
  ]);

  const rejectExcludedDates = items.length === 0;

  const cartCapacityKey = checkoutCartCapacityKey(items);

  useEffect(() => {
    if (!hydrated || !calendarReady || items.length === 0) {
      return;
    }
    const fromYmd = effectivePickupBounds.min;
    const toYmd = effectivePickupBounds.max ?? fromYmd;
    let cancelled = false;
    void loadCartDateCapacityAvailability({
      fromYmd,
      toYmd,
      collectionId,
      cart: items.map((item) => ({
        cakeId: item.cakeId,
        cakeSizeId: item.sizeId,
        cakeName: item.cakeName,
        quantity: item.quantity,
      })),
    }).then((snapshot) => {
      if (!cancelled) setCartCapacity(snapshot);
    });
    return () => {
      cancelled = true;
    };
  // Price/name-only item updates must not refetch capacity.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cartCapacityKey encodes cake+size+qty
  }, [
    calendarReady,
    cartCapacityKey,
    collectionId,
    effectivePickupBounds.max,
    effectivePickupBounds.min,
    hydrated,
  ]);
  useEffect(() => {
    const selectedYmd = fields.pickupDate.trim().slice(0, 10);
    if (
      !hydrated ||
      !calendarReady ||
      !/^\d{4}-\d{2}-\d{2}$/.test(selectedYmd)
    ) {
      return;
    }
    if (!isPickupOrdersClosed(selectedYmd, closedDates)) {
      return;
    }
    let cancelled = false;
    void loadCustomerWaitingListAvailability(selectedYmd).then(
      (availability) => {
        if (!cancelled) setClosedWaitingList(availability);
      },
      () => {
        if (!cancelled) {
          setClosedWaitingList({
            pickupDate: selectedYmd,
            collectionId,
            options: [],
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [calendarReady, closedDates, collectionId, fields.pickupDate, hydrated]);
  const emptyCapacity = {
    fullyBookedDates: [] as string[],
    waitingListDates: [] as string[],
    blockingCakeNamesByDate: {} as Record<string, string[]>,
    waitingListLineKeysByDate: {} as Record<string, string[]>,
  };
  const activeCartCapacity = items.length === 0 ? emptyCapacity : cartCapacity;
  const waitingListPickerDates = activeCartCapacity.waitingListDates;
  const fullyBookedWithoutWaitingList =
    activeCartCapacity.fullyBookedDates.filter(
      (ymd) => !waitingListPickerDates.includes(ymd),
    );

  const cakeIdsKey = items.map((item) => item.cakeId).join(",");

  useEffect(() => {
    if (!hydrated) return;
    const cakeIds = cakeIdsKey.split(",").filter(Boolean);
    let cancelled = false;
    void loadCheckoutCalendarContext({
      cakeIds,
      fromQuery: pickupScopeFrom,
      pickupQuery: suggestedPickupDate,
      toQuery: pickupScopeTo,
    }).then(
      (context) => {
        if (cancelled) return;
        setClosedDates(context.closedDates);
        setEntrySpecialUnavailableDates(context.entrySpecialUnavailableDates);
        setHoursSnapshot(context.hoursSnapshot);
        setVenuePhotos(context.venuePhotos);
        setLiveMinPickupDate(context.minPickupDate);
        setLiveMaxPickupDate(context.maxPickupDate);
        setLiveScopeConstrainsBounds(context.pickupScopeConstrainsBounds);
        setCartPickupBounds(context.cartPickupBounds);
        setCakePickupMemberships(context.cakePickupMemberships);
        setActiveSpecialWindows(context.activeSpecialWindows);
        setCalendarEarliestYmd(context.earliestPickupYmd);
        setLoadedCakeIdsKey(cakeIds.join(","));
        setCalendarError(null);
        setCalendarReady(true);
      },
      () => {
        if (cancelled) return;
        setCalendarError(
          "We couldn't confirm collection dates and opening hours. Please try again.",
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    cakeIdsKey,
    hydrated,
    pickupScopeFrom,
    pickupScopeTo,
    suggestedPickupDate,
  ]);

  useLayoutEffect(() => {
    const draft = readPreorderDraft();
    const draftItems = draft?.items ?? [];
    const suggested = suggestedPickupDate?.trim().slice(0, 10) ?? "";
    const scopeFrom = pickupScopeFrom?.trim().slice(0, 10) ?? "";
    const scopeTo = pickupScopeTo?.trim().slice(0, 10) ?? "";
    const hasEntryScope =
      /^\d{4}-\d{2}-\d{2}$/.test(scopeFrom) &&
      /^\d{4}-\d{2}-\d{2}$/.test(scopeTo);
    const min = minPickupDate?.trim().slice(0, 10) ?? "";
    const max = maxPickupDate?.trim().slice(0, 10) ?? "";
    let pickupDate = /^\d{4}-\d{2}-\d{2}$/.test(suggested)
      ? suggested
      : hasEntryScope
        ? ""
        : (draft?.pickupDate ?? "");
    if (
      draftItems.length > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(draft?.pickupDate ?? "")
    ) {
      pickupDate = String(draft?.pickupDate);
    }
    if (max && pickupDate > max && draftItems.length === 0) {
      pickupDate = "";
    }
    if (min && pickupDate && pickupDate < min && draftItems.length === 0) {
      pickupDate =
        /^\d{4}-\d{2}-\d{2}$/.test(suggested) &&
        suggested >= min &&
        (!max || suggested <= max)
          ? suggested
          : min;
    }
    if (!pickupDate && draftItems.length === 0) {
      pickupDate =
        (/^\d{4}-\d{2}-\d{2}$/.test(suggested) ? suggested : "") ||
        min ||
        emptyCartEarliestCollectionDate();
    }
    setItems(draft?.items ?? []);
    setFields({
      ...emptyPreorderFields(),
      customerName: draft?.customerName ?? "",
      phone: draft?.phone ?? "",
      email: "",
      emailSubmissionReceiptRequested: false,
      includeReceiptChoice: draft?.includeReceiptChoice ?? "",
      pickupDate,
      pickupScopeFrom: hasEntryScope
        ? scopeFrom
        : (draft?.pickupScopeFrom ?? ""),
      pickupScopeTo: hasEntryScope ? scopeTo : (draft?.pickupScopeTo ?? ""),
      pickupScopeConstrainsBounds: hasEntryScope
        ? pickupScopeConstrainsBounds
        : (draft?.pickupScopeConstrainsBounds ?? false),
      pickupTime: draft?.pickupTime ?? "",
      reservationTime: draft?.reservationTime ?? "",
      fulfilmentMethod: parseCustomerWebsiteFulfilmentMethod(
        draft?.fulfilmentMethod,
      ),
      dineInVenue: draft?.dineInVenue ?? "",
      adultCount: draft?.adultCount ?? "",
      kidCount: draft?.kidCount ?? "",
      toddlerCount: draft?.toddlerCount ?? "",
      guestCount: draft?.guestCount ?? "",
      whitebirdSplitSeatingAcknowledged:
        draft?.whitebirdSplitSeatingAcknowledged ?? false,
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
  }, [
    suggestedPickupDate,
    minPickupDate,
    maxPickupDate,
    pickupScopeFrom,
    pickupScopeTo,
    pickupScopeConstrainsBounds,
  ]);

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
      setCollectionId(null);
      setComplimentaryOptions([]);
      setPaidAddonOptions([]);
      setOptionsReady(false);
      setResolvedOfferDate(null);
      return;
    }

    let cancelled = false;
    const applyOffer = (offer: CheckoutPickupOffer) => {
      if (cancelled) return;
      setCakes(offer.cakes);
      setUnavailableMessage(offer.unavailableMessage);
      setCollectionId(offer.collection?.id ?? null);
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
        let changed = false;
        const next = current.map((item) => {
          const cake = offer.cakes.find((entry) => entry.id === item.cakeId);
          const size = cake?.sizes.find((entry) => entry.id === item.sizeId);
          if (!cake || !size) return item;
          if (
            item.cakeName === cake.name &&
            item.sizeLabel === size.size &&
            item.preorderDays === size.preorderDays
          ) {
            return item;
          }
          changed = true;
          return {
            ...item,
            cakeName: cake.name,
            sizeLabel: size.size,
            preorderDays: size.preorderDays,
            imageUrl: item.imageUrl,
          };
        });
        return changed ? next : current;
      });
      setResolvedOfferDate(pickupDate);
      setFields((current) => {
        const complimentaryCodes = current.complimentaryCodes.filter((code) =>
          offer.complimentaryOptions.some((option) => option.code === code),
        );
        const paidAddonCodes = current.paidAddonCodes.filter((code) =>
          offer.paidAddonOptions.some((option) => option.code === code),
        );
        const paidAddonUnitPriceByCode = Object.fromEntries(
          offer.paidAddonOptions.map((option) => [
            option.code,
            option.unitPrice,
          ]),
        );
        return {
          ...current,
          complimentaryCodes,
          paidAddonCodes,
          paidAddonUnitPriceByCode,
        };
      });
    };

    const cached = checkoutPickupOfferCache.get(pickupDate);
    if (cached) {
      applyOffer(cached);
    } else {
      void loadCheckoutPickupOffer(pickupDate).then((offer) => {
        checkoutPickupOfferCache.set(pickupDate, offer);
        applyOffer(offer);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [fields.pickupDate, hydrated]);

  const sizeIdsKey = [...new Set(items.map((item) => item.sizeId).filter(Boolean))]
    .sort()
    .join(",");
  const priceResolutionKey = fields.pickupDate
    ? `${fields.pickupDate}|${sizeIdsKey}`
    : "";

  useEffect(() => {
    if (!hydrated) return;
    const pickupDate = fields.pickupDate.trim().slice(0, 10);
    const sizeIds = sizeIdsKey.split(",").filter(Boolean);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || sizeIds.length === 0) {
      return;
    }
    let cancelled = false;
    const applyPrices = (prices: Record<string, number>) => {
      if (cancelled) return;
      const missing = sizeIds.some((id) => prices[id] == null);
      setItems((current) => applyApplicableUnitPrices(current, prices));
      if (!missing) {
        setResolvedPriceKey(`${pickupDate}|${sizeIds.slice().sort().join(",")}`);
      }
    };
    const cached = checkoutCakeSizePriceCache.get(
      `${pickupDate}|${sizeIdsKey}`,
    );
    if (cached) {
      applyPrices(cached);
    } else {
      void resolveCheckoutCakeSizePrices(pickupDate, sizeIds).then((prices) => {
        checkoutCakeSizePriceCache.set(`${pickupDate}|${sizeIdsKey}`, prices);
        applyPrices(prices);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [fields.pickupDate, hydrated, priceRefreshKey, sizeIdsKey]);

  const pricesReady =
    items.length === 0 ||
    !fields.pickupDate ||
    resolvedPriceKey === priceResolutionKey;
  const pricedItems = pricesReady
    ? items
    : items.map((item) => ({ ...item, applicableUnitPrice: undefined }));

  const total = useMemo(
    () =>
      customerPreorderCommercialTotal({
        items: pricedItems.map((item) => ({
          unitPrice: chargedDraftItemUnitPrice(item),
          quantity: item.quantity,
        })),
        options: paidAddonOptions,
        selectedCodes: fields.paidAddonCodes,
      }),
    [pricedItems, paidAddonOptions, fields.paidAddonCodes],
  );
  const priceChangeLines = useMemo(
    () => cakePriceChangeLines(pricedItems),
    [pricedItems],
  );
  const ackSnapshot = useMemo(
    () =>
      cakePriceAckSnapshot({
        pickupDate: fields.pickupDate,
        items: pricedItems,
      }),
    [fields.pickupDate, pricedItems],
  );
  const ackRequired = cakePriceAckRequired(pricedItems);
  const pricesAcknowledged = cakePriceAckSatisfied({
    pickupDate: fields.pickupDate,
    items: pricedItems,
    acknowledgedSnapshot,
  });
  const priceAckJson = useMemo(
    () =>
      JSON.stringify(
        buildCakePriceAckPayload({
          pickupDate: fields.pickupDate,
          items: pricedItems,
        }),
      ),
    [fields.pickupDate, pricedItems],
  );
  const deliveryAckRequired = deliveryProcessingFeeAckRequired(
    fields.fulfilmentMethod,
  );
  const deliveryProcessingFeeAcknowledged = deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: fields.fulfilmentMethod,
    acknowledgedSnapshot: deliveryProcessingAckSnapshot,
  });
  const deliveryProcessingFeeAckJson = useMemo(
    () =>
      deliveryAckRequired && deliveryProcessingFeeAcknowledged
        ? JSON.stringify(buildDeliveryProcessingFeeAckPayload())
        : "",
    [deliveryAckRequired, deliveryProcessingFeeAcknowledged],
  );
  const deliveryCharges = checkoutDeliveryChargesBreakdown({
    fulfilmentMethod: fields.fulfilmentMethod,
    itemsSubtotal: total,
  });
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

  const liveOfferPending = isCheckoutLiveOfferPending(
    fields.pickupDate,
    resolvedOfferDate,
  );
  const sizePricesPending =
    items.length > 0 &&
    Boolean(fields.pickupDate) &&
    resolvedPriceKey !== priceResolutionKey;
  const calendarPending = isCheckoutCalendarPending(calendarReady);
  const preorderLines = useMemo(
    () => toPreorderLines(items, cakes),
    [cakes, items],
  );
  const pickupMembershipsPending =
    items.length > 0 && cakeIdsKey !== loadedCakeIdsKey;
  const pickupCompatibility = useMemo(() => {
    if (pickupMembershipsPending) return null;
    const uniqueIds = [...new Set(items.map((item) => item.cakeId))];
    const membershipById = new Map(
      cakePickupMemberships.map((membership) => [
        membership.cakeId,
        membership,
      ]),
    );
    if (uniqueIds.some((cakeId) => !membershipById.has(cakeId))) {
      return null;
    }
    const memberships = uniqueIds.flatMap((cakeId) => {
      const membership = membershipById.get(cakeId);
      return membership ? [membership] : [];
    });
    return evaluateCartPickupCompatibility({
      cakes: memberships,
      selectedYmd: fields.pickupDate,
      earliestYmd: calendarEarliestYmd,
      activeSpecialWindows,
      globalMax:
        (liveMaxPickupDate ?? maxPickupDate)?.trim().slice(0, 10) ?? null,
    });
  }, [
    activeSpecialWindows,
    cakePickupMemberships,
    calendarEarliestYmd,
    fields.pickupDate,
    items,
    liveMaxPickupDate,
    maxPickupDate,
    pickupMembershipsPending,
  ]);
  const cakePickupAvailabilityNotes = pickupCompatibility
    ? cakePickupAvailabilityNotesById(pickupCompatibility)
    : {};
  const collectionDateEvaluation = useMemo(() => {
    const selectedYmd = fields.pickupDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedYmd) || calendarPending) {
      return null;
    }
    const businessDate = malaysiaPreorderBusinessDate(new Date());
    const closed = isPickupOrdersClosed(selectedYmd, closedDates);
    const slots =
      fields.fulfilmentMethod === "dine_in"
        ? getDineInSlotsForDate(selectedYmd, hoursSnapshot)
        : fields.fulfilmentMethod === "delivery"
          ? getDeliverySlotsForDate(selectedYmd, hoursSnapshot)
          : getPickupSlotsForDate(selectedYmd, hoursSnapshot);
    const cakesAllowedForDate =
      pickupCompatibility?.hasCommonPickupDate === true &&
      (pickupCompatibility?.cakes.every((cake) => cake.allowed) ?? false);
    const inCatalogue =
      pickupMembershipsPending ||
      (cakesAllowedForDate &&
        checkoutDraftItemsInCatalogue(items, cakes, liveOfferPending));
    const selectedCapacity = activeCartCapacity.fullyBookedDates.includes(
      selectedYmd,
    )
      ? {
          fullyBooked: true as const,
          waitingListEnabled: waitingListPickerDates.includes(selectedYmd),
          blockingCakeNames:
            activeCartCapacity.blockingCakeNamesByDate[selectedYmd] ?? [],
          selectedYmd,
          nextAvailableYmd: findNextValidCollectionDate({
            fromYmdExclusive: selectedYmd,
            businessDate,
            lines: preorderLines,
            closedDates,
            operatingOpen: (ymd) =>
              getPickupSlotsForDate(ymd, hoursSnapshot).length > 0,
            capacityForDate: (ymd) =>
              activeCartCapacity.fullyBookedDates.includes(ymd)
                ? {
                    fullyBooked: true,
                    waitingListEnabled: waitingListPickerDates.includes(ymd),
                    blockingCakeNames:
                      activeCartCapacity.blockingCakeNamesByDate[ymd] ?? [],
                  }
                : null,
            maxYmd: effectivePickupBounds.max,
          }),
        }
      : null;
    return evaluateCollectionDate({
      selectedYmd,
      businessDate,
      lines: preorderLines,
      operatingOpen: slots.length > 0,
      closed,
      inCatalogue,
      capacity: selectedCapacity,
    });
  }, [
    activeCartCapacity.blockingCakeNamesByDate,
    activeCartCapacity.fullyBookedDates,
    calendarPending,
    cakes,
    closedDates,
    effectivePickupBounds.max,
    fields.fulfilmentMethod,
    fields.pickupDate,
    hoursSnapshot,
    items,
    liveOfferPending,
    pickupCompatibility,
    pickupMembershipsPending,
    preorderLines,
    waitingListPickerDates,
  ]);
  const selectedDateInvalidated = Boolean(
    collectionDateEvaluation &&
    !collectionDateEvaluation.valid &&
    items.length > 0 &&
    (collectionDateEvaluation.reason.code === "fully_booked" ||
      collectionDateEvaluation.reason.code === "before_preorder"),
  );
  const collectionDateMessageRaw = collectionDateEvaluation
    ? customerCollectionDateMessage(collectionDateEvaluation, preorderLines)
    : null;
  const collectionDateMessage =
    pickupCompatibility?.dateLevelMessage ??
    (selectedDateInvalidated
      ? customerSelectedDateInvalidatedMessage(collectionDateMessageRaw)
      : collectionDateMessageRaw);
  const dateValidationMessage =
    pickupCompatibility?.dateLevelMessage ??
    (collectionDateEvaluation && !collectionDateEvaluation.valid
      ? collectionDateMessage
      : null);

  function patchFields(patch: Partial<PreorderDraftFields>) {
    setFields((current) => ({ ...current, ...patch }));
  }

  function changeFulfilment(value: string) {
    const method = parseCustomerWebsiteFulfilmentMethod(value);
    setDeliveryProcessingAckSnapshot("");
    setFields((current) => fieldsAfterFulfilmentChange(current, method));
  }

  function changeDate(nextDate: string) {
    const currentMethod = fields.fulfilmentMethod;
    const nextMethod = firstAvailableCustomerFulfilment(
      nextDate,
      closedDates,
      currentMethod,
      hoursSnapshot,
    );
    if (nextMethod !== currentMethod) {
      setDeliveryProcessingAckSnapshot("");
    }
    setFields((current) => {
      const withDate = {
        ...current,
        pickupDate: nextDate,
        pickupTime: "",
        reservationTime: "",
        dineInVenue: "",
      };
      if (nextMethod === withDate.fulfilmentMethod) return withDate;
      return fieldsAfterFulfilmentChange(withDate, nextMethod);
    });
  }

  const updateItem = useCallback(
    (index: number, patch: Partial<PreorderDraftItem>) => {
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
    },
    [],
  );

  const handleChangeQuantity = useCallback(
    (index: number, quantity: number) => {
      updateItem(index, { quantity });
    },
    [updateItem],
  );

  const changeSize = useCallback(
    (index: number, sizeId: string) => {
      setItems((current) => {
        const item = current[index];
        if (!item) return current;
        const cake = cakes.find((entry) => entry.id === item.cakeId);
        const liveSize = cake?.sizes.find((entry) => entry.id === sizeId);
        const nextSize = liveSize
          ? {
              sizeId: liveSize.id,
              sizeLabel: liveSize.size,
              unitPrice: liveSize.price,
              preorderDays: liveSize.preorderDays,
              applicableUnitPrice: undefined,
            }
          : draftItemSizeChoices(item, cake).find(
              (choice) => choice.id === sizeId,
            );
        if (!nextSize) return current;
        const patch =
          "id" in nextSize
            ? {
                sizeId: nextSize.id,
                sizeLabel: nextSize.size,
                unitPrice: nextSize.price,
                preorderDays: nextSize.preorderDays,
                applicableUnitPrice: undefined,
              }
            : nextSize;
        const mapped = current.map((entry, i) =>
          i === index ? { ...entry, ...patch } : entry,
        );
        const map = new Map<string, PreorderDraftItem>();
        for (const entry of mapped) {
          const key = `${entry.cakeId}::${entry.sizeId}`;
          const existing = map.get(key);
          if (existing) {
            map.set(key, {
              ...existing,
              quantity: existing.quantity + entry.quantity,
            });
          } else {
            map.set(key, entry);
          }
        }
        return Array.from(map.values());
      });
      setItemError(null);
    },
    [cakes],
  );

  const removeItem = useCallback((index: number) => {
    setItemError(null);
    setItems((current) => current.filter((_, i) => index !== i));
  }, []);

  const addOfferedCake = useCallback(
    (cake: StorefrontCake) => {
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
              preorderDays: size.preorderDays,
            },
          ],
          cakes,
        );
        if (filtered.dropped) {
          setItemError(
            "Some cakes are not available for this pickup date and were removed.",
          );
        }
        return filtered.items;
      });
    },
    [addSizeByCake, cakes],
  );

  const addOfferedCakeAndClosePicker = useCallback(
    (cake: StorefrontCake) => {
      addOfferedCake(cake);
      setAddingCake(false);
    },
    [addOfferedCake],
  );

  const handleAddSize = useCallback((cakeId: string, sizeId: string) => {
    setAddSizeByCake((current) => ({
      ...current,
      [cakeId]: sizeId,
    }));
  }, []);

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

  function handleSubmit(formData: FormData) {
    if (calendarPending || liveOfferPending || sizePricesPending) {
      return;
    }
    if (unavailableMessage) {
      setItemError(unavailableMessage);
      return;
    }
    if (items.length === 0) {
      setItemError("Please add at least one cake to your preorder.");
      return;
    }
    if (
      collectionDateEvaluation &&
      !collectionDateEvaluation.valid &&
      collectionDateMessage
    ) {
      setItemError(collectionDateMessage);
      return;
    }
    const pickupDate = String(formData.get("pickup_date") ?? "").trim();
    if (isPickupOrdersClosed(pickupDate, closedDates)) {
      setItemError(ORDERS_CLOSED_RPC_MESSAGE);
      return;
    }
    const nameErrorMessage = customerNameValidationError(
      String(formData.get("customer_name") ?? ""),
    );
    if (nameErrorMessage) {
      setNameError(nameErrorMessage);
      setFieldErrors((current) => ({
        ...current,
        customer_name: nameErrorMessage,
      }));
      setItemError(CUSTOMER_FORM_HIGHLIGHT_SUMMARY);
      focusElementById("customer_name");
      return;
    }
    if (ackRequired && !pricesAcknowledged) {
      setFieldErrors((current) => ({
        ...current,
        price_ack_accepted: CAKE_PRICE_ACK_REQUIRED_MESSAGE,
      }));
      setItemError(CUSTOMER_FORM_HIGHLIGHT_SUMMARY);
      focusElementById("price_ack_accepted");
      return;
    }
    if (deliveryAckRequired && !deliveryProcessingFeeAcknowledged) {
      setFieldErrors((current) => ({
        ...current,
        delivery_processing_fee_ack_accepted:
          DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
      }));
      setItemError(CUSTOMER_FORM_HIGHLIGHT_SUMMARY);
      focusElementById("delivery_processing_fee_ack_accepted");
      return;
    }
    setNameError(null);
    setFieldErrors({});
    setItemError(null);
    persistDraft(items, fields);
    pendingSubmitRef.current = formData;
    setConfirmOpen(true);
  }

  function confirmOrder() {
    if (pending || state.orderId) return;
    if (ackRequired && !pricesAcknowledged) {
      setConfirmOpen(false);
      setItemError(CAKE_PRICE_ACK_REQUIRED_MESSAGE);
      return;
    }
    if (deliveryAckRequired && !deliveryProcessingFeeAcknowledged) {
      setConfirmOpen(false);
      setItemError(DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE);
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

  const upcomingClosed = calendarReady
    ? closedDates
        .filter((date) => date >= emptyCartEarliestCollectionDate())
        .slice(0, 8)
    : [];
  const catalogueReady =
    Boolean(fields.pickupDate) &&
    !unavailableMessage &&
    !liveOfferPending &&
    !calendarPending;

  if (!hydrated) {
    return (
      <p className="text-skyline text-sm" aria-live="polite">
        Preparing your preorder…
      </p>
    );
  }

  const waitingListLines = items
    .filter((item) =>
      (
        activeCartCapacity.waitingListLineKeysByDate[fields.pickupDate] ?? []
      ).includes(`${item.cakeId}|${item.sizeId}`),
    )
    .map((item) => ({
      cakeId: item.cakeId,
      sizeId: item.sizeId,
      cakeName: item.cakeName,
      sizeLabel: item.sizeLabel,
      quantity: item.quantity,
    }));
  const showJoinWaitingList =
    collectionDateEvaluation?.reason.code === "fully_booked" &&
    collectionDateEvaluation.reason.waitingListOffered &&
    waitingListLines.length > 0;
  const ordersClosedSelected = Boolean(
    calendarReady &&
    fields.pickupDate &&
    isPickupOrdersClosed(fields.pickupDate, closedDates),
  );
  const closedWaitingListForDate =
    closedWaitingList?.pickupDate === fields.pickupDate
      ? closedWaitingList
      : null;
  const closedWaitingListPending =
    ordersClosedSelected && closedWaitingListForDate == null;
  const closedWaitingListOptions = closedWaitingListForDate?.options ?? [];
  const showClosedWaitingListCta =
    ordersClosedSelected &&
    !closedWaitingListPending &&
    closedWaitingListOptions.length > 0;
  const pickupDateLabel = fields.pickupDate
    ? formatCheckoutCakeDate(fields.pickupDate)
    : null;
  const earliestYmd =
    collectionDateEvaluation?.earliestYmd ?? draftEarliestCollectionYmd(items);
  const earliestLabel = earliestYmd
    ? formatCheckoutCakeDate(earliestYmd)
    : null;
  const preorderLabel = draftStrongestPreorder(items).label;
  const collectionDateInvalid = Boolean(
    (collectionDateEvaluation && !collectionDateEvaluation.valid) ||
    pickupCompatibility?.dateLevelMessage,
  );
  const submitBlocked =
    calendarPending ||
    pickupMembershipsPending ||
    Boolean(calendarError) ||
    liveOfferPending ||
    sizePricesPending ||
    !catalogueReady ||
    Boolean(unavailableMessage) ||
    (items.length > 0 && collectionDateInvalid) ||
    (ackRequired && !pricesAcknowledged) ||
    (deliveryAckRequired && !deliveryProcessingFeeAcknowledged);
  const confirmSnapshot = buildCheckoutConfirmSnapshot({
    fields,
    items: pricedItems,
    paidAddonOptions,
    pickupDateLabel,
    total,
  });

  return (
    <div className="flex flex-col gap-10">
      <form
        action={handleSubmit}
        className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_20.5rem] lg:items-start lg:gap-x-16 lg:gap-y-0"
        noValidate
        onSubmit={(event) => {
          const errors = collectInvalidFieldMessages(event.currentTarget);
          if (Object.keys(errors).length === 0) {
            setFieldErrors({});
            return;
          }
          event.preventDefault();
          setFieldErrors(errors);
          setItemError(CUSTOMER_FORM_HIGHLIGHT_SUMMARY);
          focusFirstInvalidField(event.currentTarget);
        }}
        ref={formRef}
      >
        <input name="items_json" type="hidden" value={itemsJson} />
        <input name="price_ack_json" type="hidden" value={priceAckJson} />
        <input
          name="delivery_processing_fee_ack_json"
          type="hidden"
          value={deliveryProcessingFeeAckJson}
        />
        <input name="preorder_options_json" type="hidden" value={optionsJson} />
        <input
          name="preorder_options_ready"
          type="hidden"
          value={optionsReady ? "1" : "0"}
        />

        <div className="order-2 flex min-w-0 flex-col gap-12 lg:order-1">
          <FormRequiredLegend />
          <CheckoutSection title="Collection Date">
            <p className="font-display text-ink text-4xl tracking-tight sm:text-[2.75rem]">
              {pickupDateLabel ?? "Select a date"}
            </p>
            {earliestLabel ? (
              <p className="text-skyline mt-3 text-sm leading-relaxed">
                Earliest collection {earliestLabel}
                {preorderLabel ? ` · ${preorderLabel}` : ""}
              </p>
            ) : preorderLabel ? (
              <p className="text-skyline mt-3 text-sm leading-relaxed">
                {preorderLabel}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
                Selected date
              </p>
              <button
                className="text-signal text-sm font-medium disabled:opacity-40"
                disabled={calendarPending}
                onClick={() => setChangingDate((open) => !open)}
                type="button"
              >
                {changingDate ? "Done" : "Change date"}
              </button>
            </div>
            {calendarPending ? (
              <p className="text-skyline mt-3 text-sm leading-relaxed">
                Confirming collection dates…
              </p>
            ) : changingDate ? (
              <div className="mt-3 max-w-sm">
                <PickupSlotFields
                  closedDates={closedDates}
                  dateLabel="Date"
                  defaultDate={fields.pickupDate}
                  defaultTime={fields.pickupTime}
                  excludedDateMessage="This date is reserved for the Special Menu."
                  excludedDates={effectiveExcludedDates}
                  includeFieldNames={false}
                  key="checkout-cake-date"
                  maxDate={effectivePickupBounds.max ?? undefined}
                  minDate={effectivePickupBounds.min}
                  onDateChange={changeDate}
                  rejectExcludedDates={rejectExcludedDates}
                  unavailableDateMessageFor={(ymd) =>
                    customerFullyBookedDateMessage({
                      selectedYmd: ymd,
                      blockingCakeNames:
                        activeCartCapacity.blockingCakeNamesByDate[ymd] ?? [],
                    })
                  }
                  unavailableDates={fullyBookedWithoutWaitingList}
                  showTime={false}
                />
              </div>
            ) : null}
            {pickupMembershipsPending && !calendarPending ? (
              <p className="text-skyline mt-3 text-sm leading-relaxed">
                Confirming cake availability for this order…
              </p>
            ) : null}
            {calendarError ? (
              <p
                className="text-status-danger mt-4 text-sm leading-relaxed"
                role="status"
              >
                {calendarError}
              </p>
            ) : null}
            {unavailableMessage ? (
              <div className="mt-4" role="status">
                <p className="text-ink text-sm leading-relaxed">
                  {unavailableMessage}
                </p>
                <p className="text-skyline mt-2 text-sm leading-relaxed">
                  Please choose a date in a published catalogue.
                </p>
              </div>
            ) : null}
            {upcomingClosed.length > 0 ? (
              <p className="text-skyline mt-4 text-sm leading-relaxed">
                {upcomingClosed.length === 1
                  ? `${formatShortBusinessDate(upcomingClosed[0] ?? "")} — ${ORDERS_CLOSED_CUSTOMER_LABEL}.`
                  : `Pickup dates with ${ORDERS_CLOSED_CUSTOMER_LABEL.toLowerCase()}: ${upcomingClosed
                      .map((date) => formatShortBusinessDate(date))
                      .join(", ")}.`}
              </p>
            ) : null}
            {ordersClosedSelected ? (
              <div className="mt-4 space-y-2" role="status">
                <p className="text-ink text-sm font-medium">
                  {`Orders closed for ${formatShortBusinessDate(fields.pickupDate)}`}
                </p>
                <p className="text-skyline text-sm leading-relaxed">
                  {WAITING_LIST_CLOSED_REGULAR_ORDERS}
                </p>
                {closedWaitingListPending ? (
                  <p className="text-skyline text-sm leading-relaxed">
                    Checking waiting list…
                  </p>
                ) : showClosedWaitingListCta ? (
                  <>
                    <p className="text-ink text-sm font-medium">
                      {WAITING_LIST_AVAILABLE_LABEL}
                    </p>
                    <p className="text-skyline text-sm leading-relaxed">
                      {WAITING_LIST_SEE_AVAILABLE_HELP}
                    </p>
                    <button
                      className="border-ink text-ink mt-1 inline-flex min-h-11 items-center justify-center border px-4 text-sm font-medium"
                      onClick={() => setWaitingListAvailabilityOpen(true)}
                      type="button"
                    >
                      {WAITING_LIST_SEE_AVAILABLE_CTA}
                    </button>
                  </>
                ) : (
                  <p className="text-skyline text-sm leading-relaxed">
                    {WAITING_LIST_CLOSED_NONE}
                  </p>
                )}
              </div>
            ) : dateValidationMessage ? (
              <div className="mt-4">
                <FormError message={dateValidationMessage} />
              </div>
            ) : null}
            {showJoinWaitingList ? (
              <p className="text-ink mt-4 text-sm leading-relaxed">
                Join Waiting List is below. This is a waiting-list request, not
                a confirmed order.
              </p>
            ) : null}
          </CheckoutSection>

          <CheckoutSection
            className="border-fog border-t pt-10"
            description={customerFulfilmentHoursNotice(hoursSnapshot)}
            title="Fulfilment"
          >
            {calendarPending ? (
              <p className="text-skyline text-sm leading-relaxed">
                Confirming opening hours…
              </p>
            ) : (
              <>
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
                      dateError={fieldErrors.pickup_date}
                      dateLabel="Dine-in date"
                      defaultDate={fields.pickupDate}
                      defaultTime={fields.reservationTime}
                      excludedDates={effectiveExcludedDates}
                      key="checkout-dine-in-reservation"
                      maxDate={effectivePickupBounds.max ?? undefined}
                      minDate={effectivePickupBounds.min}
                      onDateChange={changeDate}
                      rejectExcludedDates={rejectExcludedDates}
                      unavailableDateMessageFor={(ymd) =>
                        customerFullyBookedDateMessage({
                          selectedYmd: ymd,
                          blockingCakeNames:
                            activeCartCapacity.blockingCakeNamesByDate[ymd] ??
                            [],
                        })
                      }
                      unavailableDates={fullyBookedWithoutWaitingList}
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
                      markRequired
                      timeError={fieldErrors.reservation_time}
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
                        key={`checkout-dine-in-serving-${fields.reservationTime}`}
                        markRequired
                        timeError={fieldErrors.pickup_time}
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
                        <DineInVenuePartyFields
                          fieldErrors={fieldErrors}
                          markRequired
                          onChange={(next) =>
                            patchFields({
                              dineInVenue: next.venue,
                              adultCount: next.adultCount,
                              kidCount: next.kidCount,
                              toddlerCount: next.toddlerCount,
                              guestCount: derivedGuestCountDraft(next),
                              whitebirdSplitSeatingAcknowledged:
                                next.whitebirdSplitSeatingAcknowledged,
                            })
                          }
                          photos={venuePhotos}
                          value={{
                            venue: fields.dineInVenue,
                            adultCount: fields.adultCount,
                            kidCount: fields.kidCount,
                            toddlerCount: fields.toddlerCount,
                            whitebirdSplitSeatingAcknowledged:
                              fields.whitebirdSplitSeatingAcknowledged,
                          }}
                          venues={venuesForReservationAndServing(
                            fields.pickupDate,
                            fields.reservationTime,
                            fields.pickupTime,
                            hoursSnapshot,
                          )}
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
                    dateError={fieldErrors.pickup_date}
                    dateLabel={workspaceScheduleDateLabel(
                      fields.fulfilmentMethod,
                    )}
                    defaultDate={fields.pickupDate}
                    defaultTime={fields.pickupTime}
                    excludedDates={effectiveExcludedDates}
                    key={`checkout-${fields.fulfilmentMethod}-schedule`}
                    maxDate={effectivePickupBounds.max ?? undefined}
                    minDate={effectivePickupBounds.min}
                    onDateChange={changeDate}
                    onTimeChange={(pickupTime) => patchFields({ pickupTime })}
                    rejectExcludedDates={rejectExcludedDates}
                    unavailableDateMessageFor={(ymd) =>
                      customerFullyBookedDateMessage({
                        selectedYmd: ymd,
                        blockingCakeNames:
                          activeCartCapacity.blockingCakeNamesByDate[ymd] ?? [],
                      })
                    }
                    unavailableDates={fullyBookedWithoutWaitingList}
                    slotsForDate={
                      fields.fulfilmentMethod === "delivery"
                        ? (date, closed) =>
                            deliveryCheckoutSlots(date, closed, hoursSnapshot)
                        : (date, closed) =>
                            customerPickupSlotsForDate(
                              date,
                              closed,
                              hoursSnapshot,
                            )
                    }
                    markRequired
                    timeError={fieldErrors.pickup_time}
                    timeLabel={workspaceScheduleTimeLabel(
                      fields.fulfilmentMethod,
                    )}
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
                          recipientName: sameAsCustomer
                            ? fields.customerName
                            : "",
                          recipientPhone: sameAsCustomer ? fields.phone : "",
                          recipientNotifyPreference: sameAsCustomer
                            ? ""
                            : fields.recipientNotifyPreference,
                        });
                      }}
                    />
                    {!fields.sameAsCustomer ? (
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
                            onChange={(event) =>
                              patchFields({ recipientName: event.target.value })
                            }
                            required
                            value={fields.recipientName}
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
                              patchFields({
                                recipientPhone: event.target.value,
                              })
                            }
                            required
                            type="tel"
                            value={fields.recipientPhone}
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
                      <FormField
                        error={fieldErrors.postcode}
                        htmlFor="postcode"
                        label="Postcode"
                        required
                      >
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
                      <FormField
                        error={fieldErrors.city}
                        htmlFor="city"
                        label="City"
                        required
                      >
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
                      <FormField
                        error={fieldErrors.state}
                        htmlFor="state"
                        label="State"
                        required
                      >
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
                        error={fieldErrors.recipient_notify_preference}
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
                        error={
                          fieldErrors.delivery_processing_fee_ack_accepted
                        }
                        id="delivery_processing_fee_ack_accepted"
                        label={DELIVERY_PROCESSING_FEE_ACK_LABEL}
                        markRequired
                        name="delivery_processing_fee_ack_accepted"
                        required
                        onChange={(event) =>
                          setDeliveryProcessingAckSnapshot(
                            event.target.checked
                              ? deliveryProcessingFeeAckSnapshot()
                              : "",
                          )
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </CheckoutSection>

          {optionsReady &&
          (complimentaryOptions.length > 0 || paidAddonOptions.length > 0) ? (
            <CheckoutSection
              className="border-fog border-t pt-10"
              title="Options"
            >
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
                    const selected = fields.paidAddonCodes.includes(
                      option.code,
                    );
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
                            help={messageRequired ? undefined : "Optional."}
                            htmlFor={`${option.code}_message`}
                            label={`Written message on ${option.name}`}
                            required={messageRequired}
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
            </CheckoutSection>
          ) : null}

          <CheckoutSection
            className="border-fog border-t pt-10"
            title="Customer Details"
          >
            <FormField
              error={fieldErrors.customer_name ?? nameError}
              help={
                <>
                  {CUSTOMER_NAME_HELP}
                  <span className="mt-0.5 block">
                    {CUSTOMER_NAME_SPACE_HINT}
                  </span>
                </>
              }
              htmlFor="customer_name"
              label="Name"
              required
            >
              <FormInput
                id="customer_name"
                name="customer_name"
                onChange={(event) => {
                  setNameError(null);
                  setFieldErrors((current) => {
                    if (!current.customer_name) return current;
                    const next = { ...current };
                    delete next.customer_name;
                    return next;
                  });
                  patchFields({ customerName: event.target.value });
                }}
                required
                value={fields.customerName}
              />
            </FormField>
            <FormField
              error={fieldErrors.phone}
              help={WAITING_LIST_WHATSAPP_NOTE}
              htmlFor="phone"
              label="WhatsApp phone"
              required
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
            <FormRadioGroup
              error={fieldErrors.include_receipt}
              legend="Would you like a copy of the receipt? (will be attached during pickup)"
              name="include_receipt"
              onChange={(value) =>
                patchFields({
                  includeReceiptChoice:
                    value === "yes" || value === "no" ? value : "",
                })
              }
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
              required
              value={fields.includeReceiptChoice}
            />
          </CheckoutSection>

          <CheckoutSection
            className="border-fog border-t pt-10"
            title="Order Notes"
          >
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
              id="notes"
              name="notes"
              onChange={(event) => patchFields({ notes: event.target.value })}
              rows={3}
              value={fields.notes}
            />
          </CheckoutSection>

          {ackRequired ? (
            <CheckoutSection
              className="border-fog border-t pt-10"
              title="Price updated for your selected pickup date"
            >
              <div className="space-y-4" role="status">
                <p className="text-ink text-sm leading-relaxed">
                  The following prices differ from the price shown when you
                  added the item:
                </p>
                <ul className="space-y-2">
                  {priceChangeLines.map((line) => (
                    <li
                      className="text-ink text-sm leading-relaxed"
                      key={line.sizeId}
                    >
                      <span className="font-medium">
                        {line.cakeName}
                        {line.sizeLabel ? ` ${line.sizeLabel}` : ""}
                      </span>
                      <span className="mt-1 block tabular-nums">
                        {formatRm(line.quotedUnitPrice)} →{" "}
                        {formatRm(line.applicableUnitPrice)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-ink text-sm leading-relaxed">
                  Your order total has been updated based on the price for your
                  selected pickup date.
                </p>
                <FormCheckbox
                  checked={pricesAcknowledged}
                  error={fieldErrors.price_ack_accepted}
                  id="price_ack_accepted"
                  label="I understand and accept the updated prices for my selected pickup date."
                  markRequired
                  name="price_ack_accepted"
                  required
                  onChange={(event) =>
                    setAcknowledgedSnapshot(
                      event.target.checked ? ackSnapshot : "",
                    )
                  }
                />
              </div>
            </CheckoutSection>
          ) : null}

          {itemError && itemError !== collectionDateMessage ? (
            <p
              className="text-status-danger text-sm leading-relaxed"
              role="alert"
            >
              {itemError}
            </p>
          ) : null}
          <FormError message={state.error} />

          <FormActions className="border-fog border-t pt-8 sm:items-center">
            <FormSubmitButton
              className="w-full rounded-md sm:w-auto"
              disabled={submitBlocked || confirmOpen}
              pending={pending}
              pendingLabel="Submitting…"
            >
              Submit Order
            </FormSubmitButton>
            <Link
              className="text-ink hover:text-skyline inline-flex min-h-11 items-center justify-center px-2 text-sm font-medium"
              href="/browse"
            >
              Continue Ordering
            </Link>
          </FormActions>
        </div>

        <div className="order-1 min-w-0 lg:order-2">
          <CheckoutOrderSummary
            addSizeByCake={addSizeByCake}
            addingCake={addingCake}
            cakePickupAvailabilityNotes={cakePickupAvailabilityNotes}
            cakes={cakes}
            catalogueReady={catalogueReady}
            earliestLabel={earliestLabel}
            items={pricedItems}
            loadingOffer={liveOfferPending}
            offerLabel={offerLabel}
            onAddCake={addOfferedCakeAndClosePicker}
            onAddSize={handleAddSize}
            onChangeQuantity={handleChangeQuantity}
            onChangeSize={changeSize}
            onRemove={removeItem}
            onToggleAdding={setAddingCake}
            pickupDateLabel={pickupDateLabel}
            preorderLabel={preorderLabel}
            total={total}
            deliveryCharges={deliveryCharges}
            unavailableMessage={unavailableMessage}
          />
        </div>
      </form>
      {showJoinWaitingList ? (
        <JoinWaitingListForm
          collectionId={collectionId}
          lines={waitingListLines}
          pickupDate={fields.pickupDate}
        />
      ) : null}
      <CustomerWaitingListAvailability
        collectionId={closedWaitingListForDate?.collectionId ?? collectionId}
        onClose={() => setWaitingListAvailabilityOpen(false)}
        open={waitingListAvailabilityOpen && showClosedWaitingListCta}
        options={closedWaitingListOptions}
        pickupDate={fields.pickupDate}
      />
      <CheckoutConfirmPrompt
        onConfirm={confirmOrder}
        onGoBack={goBackFromConfirm}
        open={confirmOpen}
        pending={pending || Boolean(state.orderId)}
        snapshot={confirmSnapshot}
      />
    </div>
  );
}
