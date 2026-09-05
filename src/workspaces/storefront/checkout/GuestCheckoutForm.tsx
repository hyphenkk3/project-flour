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
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import { OPTIONAL_NOTES_CUSTOMER_WARNING } from "@/engines/orders/order-guide";
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
  customerCollectionDateMessage,
  customerFullyBookedDateMessage,
  customerSelectedDateInvalidatedMessage,
  evaluateCollectionDate,
  findNextValidCollectionDate,
} from "@/engines/preorder/validate";
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
  WAITING_LIST_NAME_HELP,
  WAITING_LIST_WHATSAPP_NOTE,
} from "@/engines/waiting-list/phone";
import { CheckoutOrderSummary } from "@/workspaces/storefront/checkout/CheckoutOrderSummary";
import { CheckoutSection } from "@/workspaces/storefront/checkout/CheckoutSection";
import { FulfilmentMethodChooser } from "@/workspaces/storefront/checkout/FulfilmentMethodChooser";
import type { StorefrontCake } from "@/types/storefront";
import { formatCollectionAvailabilityLabel } from "@/workspaces/storefront/catalog/pricing";
import {
  draftEarliestCollectionYmd,
  draftStrongestPreorder,
} from "@/workspaces/storefront/cart/cart-order-summary";
import {
  customerPaidAddonMessageRequired,
  customerPaidAddonMessageVisible,
  customerPreorderCommercialTotal,
  formatCustomerPreorderOptionLabel,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
} from "@/engines/orders/customer-preorder-options";
import {
  loadCartDateCapacityAvailability,
  loadCheckoutPickupOffer,
  resolveCartPickupDateBounds,
  submitGuestPreorderAction,
  type CheckoutState,
} from "@/workspaces/storefront/checkout/actions";
import {
  clampCustomerPickupWindow,
} from "@/engines/menu/customer-browse";
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
import { JoinWaitingListForm } from "@/workspaces/storefront/waiting-list/JoinWaitingListForm";

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
      preorderDays: readPreorderDays(
        size?.preorderDays ?? item.preorderDays,
      ),
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
    items,
  };
  writePreorderDraft(draft);
}

export function GuestCheckoutForm({
  closedDates = [],
  suggestedPickupDate = null,
  minPickupDate = null,
  maxPickupDate = null,
  pickupScopeFrom = null,
  pickupScopeTo = null,
  pickupScopeConstrainsBounds = false,
  entrySpecialUnavailableDates = [],
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
  const [changingDate, setChangingDate] = useState(true);
  const [cartPickupBounds, setCartPickupBounds] = useState<{
    min: string;
    max: string;
    excludedDates: string[];
  } | null>(null);
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

  const effectivePickupBounds = useMemo(
    () => {
      const pickerMin = pickerMinForCart(
        items,
        cakes,
        fields.pickupDate,
      );
      const combined = combinePickupBounds(
        minPickupDate?.trim().slice(0, 10) || emptyCartEarliestCollectionDate(),
        maxPickupDate?.trim().slice(0, 10) ?? null,
        cartPickupBounds,
        pickupScopeConstrainsBounds,
        pickupScopeFrom?.trim().slice(0, 10) ?? null,
        pickupScopeTo?.trim().slice(0, 10) ?? null,
        emptyCartEarliestCollectionDate(),
      );
      return {
        min: pickerMin,
        max: combined.max,
      };
    },
    [
      cartPickupBounds,
      cakes,
      fields.pickupDate,
      items,
      maxPickupDate,
      minPickupDate,
      pickupScopeConstrainsBounds,
      pickupScopeFrom,
      pickupScopeTo,
    ],
  );

  const effectiveExcludedDates = useMemo(() => {
    if (pickupScopeConstrainsBounds) return [];
    if (cartPickupBounds && items.length > 0) {
      return cartPickupBounds.excludedDates;
    }
    return [...entrySpecialUnavailableDates];
  }, [
    cartPickupBounds,
    entrySpecialUnavailableDates,
    items.length,
    pickupScopeConstrainsBounds,
  ]);

  const rejectExcludedDates = items.length === 0;

  useEffect(() => {
    if (!hydrated || items.length === 0) {
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
  }, [
    collectionId,
    effectivePickupBounds.max,
    effectivePickupBounds.min,
    hydrated,
    items,
  ]);
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

  useEffect(() => {
    const cakeIds = [...new Set(items.map((item) => item.cakeId))];
    if (cakeIds.length === 0) {
      setCartPickupBounds(null);
      return;
    }
    let cancelled = false;
    void resolveCartPickupDateBounds(cakeIds).then((bounds) => {
      if (!cancelled) {
        setCartPickupBounds(bounds);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
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
    if (draftItems.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft?.pickupDate ?? "")) {
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
      email: draft?.email ?? "",
      emailSubmissionReceiptRequested:
        draft?.emailSubmissionReceiptRequested ?? false,
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
  }, [
    suggestedPickupDate,
    minPickupDate,
    maxPickupDate,
    pickupScopeFrom,
    pickupScopeTo,
    pickupScopeConstrainsBounds,
    hoursSnapshot,
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
      setLoadingOffer(false);
      return;
    }

    let cancelled = false;
    setLoadingOffer(true);
    void loadCheckoutPickupOffer(pickupDate).then((offer) => {
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
      setItems((current) =>
        current.map((item) => {
          const cake = offer.cakes.find((entry) => entry.id === item.cakeId);
          const size = cake?.sizes.find((entry) => entry.id === item.sizeId);
          if (!cake || !size) return item;
          return {
            ...item,
            cakeName: cake.name,
            sizeLabel: size.size,
            unitPrice: size.price,
            preorderDays: size.preorderDays,
          };
        }),
      );
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

  const preorderLines = useMemo(
    () => toPreorderLines(items, cakes),
    [cakes, items],
  );
  const collectionDateEvaluation = useMemo(() => {
    const selectedYmd = fields.pickupDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedYmd)) {
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
    const inCatalogue =
      items.length === 0 ||
      items.every((item) => {
        const cake = cakes.find((entry) => entry.id === item.cakeId);
        return Boolean(cake?.sizes.some((size) => size.id === item.sizeId));
      });
    const selectedCapacity = activeCartCapacity.fullyBookedDates.includes(selectedYmd)
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
    cartCapacity,
    cakes,
    closedDates,
    effectivePickupBounds.max,
    fields.fulfilmentMethod,
    fields.pickupDate,
    hoursSnapshot,
    items,
    preorderLines,
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
  const collectionDateMessage = selectedDateInvalidated
    ? customerSelectedDateInvalidatedMessage(collectionDateMessageRaw)
    : collectionDateMessageRaw;

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
      preorderDays: size.preorderDays,
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
    setItemError(null);
    persistDraft(items, fields);
    formAction(formData);
  }

  const upcomingClosed = closedDates
    .filter((date) => date >= emptyCartEarliestCollectionDate())
    .slice(0, 8);
  const catalogueReady = Boolean(fields.pickupDate) && !unavailableMessage;

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
  const pickupDateLabel = fields.pickupDate
    ? formatCheckoutCakeDate(fields.pickupDate)
    : null;
  const earliestYmd =
    collectionDateEvaluation?.earliestYmd ??
    draftEarliestCollectionYmd(items);
  const earliestLabel = earliestYmd
    ? formatCheckoutCakeDate(earliestYmd)
    : null;
  const preorderLabel = draftStrongestPreorder(items).label;
  const collectionDateInvalid = Boolean(
    collectionDateEvaluation && !collectionDateEvaluation.valid,
  );
  const submitBlocked =
    !catalogueReady ||
    Boolean(unavailableMessage) ||
    (items.length > 0 && collectionDateInvalid);

  return (
    <div className="flex flex-col gap-10">
    <form
      action={handleSubmit}
      className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_20.5rem] lg:items-start lg:gap-x-16 lg:gap-y-0"
    >
      <input name="items_json" type="hidden" value={itemsJson} />
      <input name="preorder_options_json" type="hidden" value={optionsJson} />
      <input
        name="preorder_options_ready"
        type="hidden"
        value={optionsReady ? "1" : "0"}
      />

      <div className="order-2 flex min-w-0 flex-col gap-12 lg:order-1">
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
          <p className="text-signal text-[11px] font-semibold tracking-[0.18em] uppercase">
            Selected date
          </p>
          <button
            className="text-signal text-sm font-medium"
            onClick={() => setChangingDate((open) => !open)}
            type="button"
          >
            {changingDate ? "Done" : "Change date"}
          </button>
        </div>
        {changingDate ? (
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
        {collectionDateMessage &&
        collectionDateEvaluation &&
        !collectionDateEvaluation.valid ? (
          <p className="text-status-danger mt-4 text-sm leading-relaxed" role="status">
            {collectionDateMessage}
          </p>
        ) : null}
        {showJoinWaitingList ? (
          <p className="text-ink mt-4 text-sm leading-relaxed">
            Join Waiting List is below. This is a waiting-list request, not a
            confirmed order.
          </p>
        ) : null}
      </CheckoutSection>

      <CheckoutSection
        className="border-fog border-t pt-10"
        description={customerFulfilmentHoursNotice(hoursSnapshot)}
        title="Fulfilment"
      >
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
                    activeCartCapacity.blockingCakeNamesByDate[ymd] ?? [],
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
      </CheckoutSection>

      {optionsReady &&
      (complimentaryOptions.length > 0 || paidAddonOptions.length > 0) ? (
        <CheckoutSection className="border-fog border-t pt-10" title="Options">
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
        </CheckoutSection>
      ) : null}

      <CheckoutSection
        className="border-fog border-t pt-10"
        title="Customer Details"
      >
        <FormField
          help={WAITING_LIST_NAME_HELP}
          htmlFor="customer_name"
          label="Name"
        >
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
            help={WAITING_LIST_WHATSAPP_NOTE}
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
      </CheckoutSection>

      <CheckoutSection className="border-fog border-t pt-10" title="Order Notes">
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

      {itemError && itemError !== collectionDateMessage ? (
        <p className="text-status-danger text-sm leading-relaxed" role="alert">
          {itemError}
        </p>
      ) : null}
      <FormError message={state.error} />

      <FormActions className="border-fog border-t pt-8 sm:items-center">
        <FormSubmitButton
          className="w-full rounded-full sm:w-auto"
          disabled={submitBlocked}
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
          cakes={cakes}
          catalogueReady={catalogueReady}
          earliestLabel={earliestLabel}
          items={items}
          loadingOffer={loadingOffer}
          offerLabel={offerLabel}
          onAddCake={addOfferedCakeAndClosePicker}
          onAddSize={(cakeId, sizeId) =>
            setAddSizeByCake((current) => ({
              ...current,
              [cakeId]: sizeId,
            }))
          }
          onChangeQuantity={(index, quantity) =>
            updateItem(index, { quantity })
          }
          onChangeSize={changeSize}
          onRemove={removeItem}
          onToggleAdding={setAddingCake}
          pickupDateLabel={pickupDateLabel}
          preorderLabel={preorderLabel}
          total={total}
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
    </div>
  );
}
