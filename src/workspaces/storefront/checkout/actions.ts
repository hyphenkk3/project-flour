"use server";

import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import { loadDineInVenuePhotos } from "@/workspaces/storefront/dine-in/queries";
import type { DineInVenuePhotoMap } from "@/engines/orders/dine-in-venue-photos";
import {
  buildDineInReservationRpcPayload,
  validateDineInPartyFromForm,
  type DineInReservationRpcPayload,
} from "@/engines/orders/dine-in-party";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import { loadCustomerCartDateCapacity } from "@/workspaces/storefront/checkout/capacity-availability";
import { customerSelectedDateInvalidatedMessage } from "@/engines/preorder/validate";
import {
  OWNER_DELIVERY_CITY,
  OWNER_DELIVERY_STATE,
  buildCreateStaffFulfilmentRpcParams,
  normalizeRecipientNotifyPreference,
  parseCustomerWebsiteFulfilmentMethod,
  validateOwnerCreateFulfilment,
  type DeliveryCreateDraft,
} from "@/engines/orders/fulfilment";
import {
  customerComplimentaryMutationPayload,
  customerPaidAddonMutationPayload,
  emptyCustomerPreorderSelections,
  isCustomerPaidAddonCode,
  selectCustomerComplimentaryOptions,
  selectCustomerPaidAddonOptions,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
  type CustomerPreorderSelections,
} from "@/engines/orders/customer-preorder-options";
import type { StorefrontCake, StorefrontCollection } from "@/types/storefront";
import { createClient } from "@/lib/supabase/server";
import { scheduleStaffNotificationDispatch } from "@/foundation/staff/schedule-staff-notification-dispatch";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  cakePickupDateBounds,
  cartExcludedPickupDates,
  cartPickupDateBounds,
  enumerateYmdInclusive,
  isFullMonthPickupScope,
  latestOrderableCataloguePickupEnd,
  monthOverlapsDateRange,
  resolveCheckoutPickupScope,
} from "@/engines/menu/customer-browse";
import {
  getStorefrontCollectionForPickupDate,
  getCustomerCakePickupMemberships,
  listAvailableCheckoutCakes,
  listCustomerSpecialCatalogues,
  listOrderableMonthlyCatalogues,
  unpublishedCataloguePreorderMessage,
  type CakePickupMembership,
} from "@/workspaces/storefront/catalog/queries";
import { listClosedPickupOrderDates } from "@/workspaces/storefront/checkout/order-availability";
import { parseRequiredPhysicalReceipt } from "@/workspaces/storefront/checkout/preorder-draft";
import {
  CAKE_PRICE_ACK_STALE_MESSAGE,
  isCakePriceAckStaleError,
} from "@/engines/orders/cake-size-price-ack";
import {
  DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
  deliveryProcessingFeeAckMatchesAuthority,
  isDeliveryProcessingFeeAckError,
  parseDeliveryProcessingFeeAckPayload,
} from "@/engines/orders/delivery-processing-fee-ack";
import { setGuestPreorderReceiptCookie } from "@/workspaces/storefront/checkout/receipt";
import { customerNameValidationError } from "@/engines/orders/customer-name";
import {
  acceptPerfCorrelationId,
  logPerf,
  logPerfSkipped,
  runWithPerfContext,
  withDevCheckoutPerf,
  type CheckoutServerPerf,
} from "@/lib/perf/dev-only-server";

export type CheckoutState = {
  error: string | null;
  orderId?: string;
  perf?: CheckoutServerPerf;
};

type SubmitItem = {
  cake_id: string;
  cake_size_id: string;
  quantity: number;
};

function parseItems(formData: FormData): SubmitItem[] {
  const raw = String(formData.get("items_json") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      cakeId?: string;
      sizeId?: string;
      quantity?: number;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        cake_id: String(item.cakeId ?? "").trim(),
        cake_size_id: String(item.sizeId ?? "").trim(),
        quantity: Number(item.quantity ?? 0),
      }))
      .filter(
        (item) =>
          item.cake_id &&
          item.cake_size_id &&
          Number.isInteger(item.quantity) &&
          item.quantity >= 1,
      );
  } catch {
    return [];
  }
}

function parsePriceAck(formData: FormData): Record<string, unknown> | null {
  const raw = String(formData.get("price_ack_json") ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseDeliveryProcessingFeeAck(formData: FormData) {
  const raw = String(
    formData.get("delivery_processing_fee_ack_json") ?? "",
  ).trim();
  if (!raw) return null;
  try {
    return parseDeliveryProcessingFeeAckPayload(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function parseJsonObject<T>(raw: string): T | null {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseCustomerSelections(
  formData: FormData,
): CustomerPreorderSelections {
  const parsed = parseJsonObject<Partial<CustomerPreorderSelections>>(
    String(formData.get("preorder_options_json") ?? ""),
  );
  return {
    ...emptyCustomerPreorderSelections(),
    complimentaryCodes: Array.isArray(parsed?.complimentaryCodes)
      ? parsed.complimentaryCodes.map((code) => String(code))
      : [],
    paidAddonCodes: Array.isArray(parsed?.paidAddonCodes)
      ? parsed.paidAddonCodes.map((code) => String(code))
      : [],
    birthdayCardMessage: String(parsed?.birthdayCardMessage ?? ""),
    wishingCardMessage: String(parsed?.wishingCardMessage ?? ""),
  };
}

function parseComplimentaryOptions(
  rows: unknown,
): CustomerComplimentaryOption[] {
  if (!Array.isArray(rows)) return [];
  return selectCustomerComplimentaryOptions(
    rows.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        typeId: String(item.typeId ?? ""),
        code: String(item.code ?? ""),
        name: String(item.name ?? ""),
        sortOrder: Number(item.sortOrder ?? 0),
      };
    }),
  );
}

function parsePaidAddonOptions(rows: unknown): CustomerPaidAddonOption[] {
  if (!Array.isArray(rows)) return [];
  return selectCustomerPaidAddonOptions(
    rows.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        code: String(item.code ?? ""),
        name: String(item.name ?? ""),
        unitPrice: Number(item.unitPrice ?? 0),
        financialShorthand: String(item.financialShorthand ?? ""),
        sortOrder: Number(item.sortOrder ?? 0),
      };
    }),
  );
}

function complimentaryPayloadFromForm(
  selections: CustomerPreorderSelections,
) {
  const options = selections.complimentaryCodes
    .map((code, index) => ({
      typeId: "form",
      code: String(code).trim(),
      name: String(code).trim(),
      sortOrder: index,
    }))
    .filter((option) => option.code);
  return customerComplimentaryMutationPayload({
    options,
    selectedCodes: selections.complimentaryCodes,
  });
}

function paidAddonPayloadFromForm(selections: CustomerPreorderSelections) {
  const options = selections.paidAddonCodes
    .filter((code) => isCustomerPaidAddonCode(code))
    .map((code, index) => ({
      code,
      name: code,
      unitPrice: 0,
      financialShorthand: "",
      sortOrder: index,
    }));
  return customerPaidAddonMutationPayload({ options, selections });
}

function isMissingCombinedSubmitRpc(message: string): boolean {
  return /Could not find the function|schema cache|does not exist|submit_guest_preorder_with_catalogue_voucher/i.test(
    message,
  );
}

function consolidateItems(items: SubmitItem[]): SubmitItem[] {
  const map = new Map<string, SubmitItem>();
  for (const item of items) {
    const key = `${item.cake_id}::${item.cake_size_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

export async function submitGuestPreorderAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const correlationId = acceptPerfCorrelationId(
    String(formData.get("perf_correlation_id") ?? ""),
  );
  return runWithPerfContext(
    { correlationId, source: "preorder_submit" },
    () => submitGuestPreorderActionTimed(formData, correlationId),
  );
}

async function submitGuestPreorderActionTimed(
  formData: FormData,
  correlationId: string,
): Promise<CheckoutState> {
  const totalStarted = performance.now();
  logPerf("CHECKOUT_SUBMIT", "action_start", 0);
  try {
    const state = await submitGuestPreorderActionBody(formData);
    return withDevCheckoutPerf(state, performance.now() - totalStarted);
  } finally {
    logPerf("CHECKOUT_SUBMIT", "TOTAL", performance.now() - totalStarted, {
      correlationId,
    });
  }
}

async function submitGuestPreorderActionBody(
  formData: FormData,
): Promise<CheckoutState> {
  const parseStarted = performance.now();
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const includeReceipt = parseRequiredPhysicalReceipt(
    String(formData.get("include_receipt") ?? "").trim(),
  );
  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  const pickupTime = String(formData.get("pickup_time") ?? "").trim();
  const fulfilmentMethod = parseCustomerWebsiteFulfilmentMethod(
    String(formData.get("fulfilment_method") ?? ""),
  );
  const notes = String(formData.get("notes") ?? "").trim();
  const items = consolidateItems(parseItems(formData));
  const persistOptions =
    String(formData.get("preorder_options_ready") ?? "") === "1";
  const selections = parseCustomerSelections(formData);
  logPerf("CHECKOUT_SUBMIT", "parse_validation", performance.now() - parseStarted);

  if (!customerName || !phone) {
    return { error: "Please fill in your name and WhatsApp phone number." };
  }
  const nameError = customerNameValidationError(customerName);
  if (nameError) {
    return { error: nameError };
  }
  if (includeReceipt === null) {
    return {
      error: "Please choose whether you would like a copy of the receipt.",
    };
  }
  if (!pickupDate) {
    return {
      error:
        fulfilmentMethod === "pickup"
          ? "Please choose a pickup date and time."
          : "Please choose a date and time.",
    };
  }
  // Closed dates, slots, collection, cakes, lead time, capacity, and
  // add-on codes are revalidated inside submit_guest_preorder.
  logPerfSkipped("CHECKOUT_SUBMIT", "isPickupOrdersClosed");
  logPerfSkipped("CHECKOUT_SUBMIT", "loadOperatingHoursSnapshot");
  logPerfSkipped("CHECKOUT_SUBMIT", "getStorefrontCollectionForPickupDate");
  logPerfSkipped("CHECKOUT_SUBMIT", "listAvailableCakes");
  logPerfSkipped("CHECKOUT_SUBMIT", "loadLivePreorderDaysBySizeId");
  logPerfSkipped("CHECKOUT_SUBMIT", "loadMalaysiaPreorderBusinessDate");
  logPerfSkipped("CHECKOUT_SUBMIT", "loadCustomerCartDateCapacity");
  logPerfSkipped("CHECKOUT_SUBMIT", "loadCustomerPreorderOptions");

  let dineInPayload: DineInReservationRpcPayload | null = null;
  let deliveryDraft: DeliveryCreateDraft | null = null;

  if (fulfilmentMethod === "pickup") {
    if (!pickupTime) {
      return { error: "Please choose a pickup date and time." };
    }
  } else if (fulfilmentMethod === "dine_in") {
    const reservationTime = String(
      formData.get("reservation_time") ?? "",
    ).trim();
    if (!reservationTime) {
      return {
        error: "Please choose a valid dine-in reservation time for that date.",
      };
    }
    if (!pickupTime) {
      return {
        error: "Please choose a valid cake serving time for that date.",
      };
    }
    const partyResult = validateDineInPartyFromForm(formData, true);
    if (!partyResult.ok) {
      return { error: partyResult.error };
    }
    dineInPayload = buildDineInReservationRpcPayload({
      party: partyResult.party,
      reservationTime,
      reservationNote:
        String(formData.get("reservation_note") ?? "").trim() || null,
    });
  } else {
    if (!pickupTime) {
      return { error: "Please choose a valid delivery time for that date." };
    }
    const sameAsCustomer =
      String(formData.get("same_as_customer") ?? "") === "on" ||
      String(formData.get("same_as_customer") ?? "") === "true";
    deliveryDraft = {
      recipientName: sameAsCustomer
        ? customerName
        : String(formData.get("recipient_name") ?? ""),
      recipientPhone: sameAsCustomer
        ? phone
        : String(formData.get("recipient_phone") ?? ""),
      addressLine1: String(formData.get("address_line_1") ?? ""),
      addressLine2: String(formData.get("address_line_2") ?? ""),
      postcode: String(formData.get("postcode") ?? ""),
      city: String(formData.get("city") ?? "") || OWNER_DELIVERY_CITY,
      state: String(formData.get("state") ?? "") || OWNER_DELIVERY_STATE,
      recipientNotifyPreference: sameAsCustomer
        ? "inform_recipient"
        : normalizeRecipientNotifyPreference(
            String(formData.get("recipient_notify_preference") ?? ""),
          ),
      sameAsCustomer,
    };
    const deliveryError = validateOwnerCreateFulfilment({
      method: "delivery",
      pickupDate,
      pickupTime,
      delivery: deliveryDraft,
    });
    if (deliveryError) {
      return { error: deliveryError };
    }
  }
  if (items.length === 0) {
    return { error: "Please add at least one cake to your preorder." };
  }

  const rpcArgs: Record<string, unknown> = {
    p_customer_name: customerName,
    p_phone: phone,
    p_email: null,
    p_pickup_date: pickupDate,
    p_pickup_time: pickupTime,
    p_notes: notes || null,
    p_items: items,
    p_email_submission_receipt_requested: false,
    p_include_receipt: includeReceipt,
    p_fulfilment_method: fulfilmentMethod,
    p_delivery:
      fulfilmentMethod === "delivery" && deliveryDraft
        ? buildCreateStaffFulfilmentRpcParams({
            method: "delivery",
            delivery: deliveryDraft,
          }).p_delivery
        : null,
    p_dine_in: fulfilmentMethod === "dine_in" ? dineInPayload : null,
  };
  if (persistOptions) {
    rpcArgs.p_complimentary = complimentaryPayloadFromForm(selections);
    rpcArgs.p_paid_addons = paidAddonPayloadFromForm(selections);
  }

  const priceAck = parsePriceAck(formData);
  if (priceAck == null) {
    return { error: CAKE_PRICE_ACK_STALE_MESSAGE };
  }
  rpcArgs.p_price_ack = priceAck;

  const deliveryProcessingAck = parseDeliveryProcessingFeeAck(formData);
  const deliveryAckCheck = deliveryProcessingFeeAckMatchesAuthority({
    payload: deliveryProcessingAck,
    fulfilmentMethod,
  });
  if (!deliveryAckCheck.ok) {
    return { error: DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE };
  }
  if (fulfilmentMethod === "delivery") {
    rpcArgs.p_delivery_processing_fee_ack = deliveryProcessingAck;
  }

  const catalogueVoucherId = String(
    formData.get("catalogue_voucher_id") ?? "",
  ).trim();
  const clientStarted = performance.now();
  const supabase = await createClient();
  logPerf("CHECKOUT_SUBMIT", "createClient", performance.now() - clientStarted);
  let usedCombinedSubmit = false;
  const rpcStarted = performance.now();
  let data: unknown;
  let error: { message: string } | null = null;
  if (catalogueVoucherId) {
    const combined = await supabase.rpc(
      "submit_guest_preorder_with_catalogue_voucher",
      {
        ...rpcArgs,
        p_catalogue_voucher_id: catalogueVoucherId,
      },
    );
    data = combined.data;
    error = combined.error;
    if (error && isMissingCombinedSubmitRpc(error.message)) {
      logPerf(
        "CHECKOUT_SUBMIT",
        "submit_guest_preorder_with_catalogue_voucher",
        performance.now() - rpcStarted,
        { voucherApply: "missing_combined_rpc" },
      );
      const fallbackStarted = performance.now();
      const fallback = await supabase.rpc("submit_guest_preorder", rpcArgs);
      data = fallback.data;
      error = fallback.error;
      logPerf(
        "CHECKOUT_SUBMIT",
        "submit_guest_preorder",
        performance.now() - fallbackStarted,
        { voucherApply: "fallback" },
      );
    } else {
      usedCombinedSubmit = !combined.error;
      logPerf(
        "CHECKOUT_SUBMIT",
        "submit_guest_preorder_with_catalogue_voucher",
        performance.now() - rpcStarted,
        { voucherApply: usedCombinedSubmit ? "combined" : "combined_failed" },
      );
    }
  } else {
    const submitted = await supabase.rpc("submit_guest_preorder", rpcArgs);
    data = submitted.data;
    error = submitted.error;
    logPerf(
      "CHECKOUT_SUBMIT",
      "submit_guest_preorder",
      performance.now() - rpcStarted,
      { voucherApply: "skipped" },
    );
  }

  if (error) {
    if (/fully booked/i.test(error.message)) {
      return {
        error: customerSelectedDateInvalidatedMessage(
          "Fully Booked for your current order.",
        ),
      };
    }
    if (isCakePriceAckStaleError(error.message)) {
      return { error: CAKE_PRICE_ACK_STALE_MESSAGE };
    }
    if (isDeliveryProcessingFeeAckError(error.message)) {
      return { error: DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE };
    }
    return { error: error.message };
  }

  const orderId =
    data && typeof data === "object" && "id" in data
      ? String((data as { id: string }).id)
      : "";

  if (!orderId) {
    return { error: "Order was created but could not be confirmed." };
  }

  const cookieStarted = performance.now();
  await setGuestPreorderReceiptCookie(orderId);
  logPerf(
    "CHECKOUT_SUBMIT",
    "setGuestPreorderReceiptCookie",
    performance.now() - cookieStarted,
  );
  if (catalogueVoucherId && !usedCombinedSubmit) {
    logPerf("CHECKOUT_SUBMIT", "voucherApply", 0, {
      voucherApply: "executed",
    });
    const voucherStarted = performance.now();
    const { applyGuestCatalogueVoucherAction } = await import(
      "@/workspaces/vouchers/catalogue-actions"
    );
    const applied = await applyGuestCatalogueVoucherAction(
      orderId,
      catalogueVoucherId,
    );
    logPerf(
      "CHECKOUT_SUBMIT",
      "applyGuestCatalogueVoucherAction",
      performance.now() - voucherStarted,
      { voucherApply: "executed" },
    );
    if (applied.error) {
      return { error: applied.error };
    }
  } else if (catalogueVoucherId) {
    logPerfSkipped("CHECKOUT_SUBMIT", "applyGuestCatalogueVoucherAction", {
      voucherApply: "combined",
    });
  } else {
    logPerfSkipped("CHECKOUT_SUBMIT", "applyGuestCatalogueVoucherAction", {
      voucherApply: "skipped",
    });
  }
  scheduleStaffNotificationDispatch();
  logPerf("CHECKOUT_SUBMIT", "action_return", 0);
  return { error: null, orderId };
}

export type CheckoutPickupOffer = {
  collection: StorefrontCollection | null;
  cakes: StorefrontCake[];
  unavailableMessage: string | null;
  complimentaryOptions: CustomerComplimentaryOption[];
  paidAddonOptions: CustomerPaidAddonOption[];
  optionsReady: boolean;
};

type StorefrontClient = Awaited<ReturnType<typeof createClient>>;

async function loadCustomerPreorderOptions(
  supabase: StorefrontClient,
  collectionId: string,
): Promise<{
  complimentary: CustomerComplimentaryOption[];
  paidAddons: CustomerPaidAddonOption[];
  ready: boolean;
}> {
  const empty = {
    complimentary: [] as CustomerComplimentaryOption[],
    paidAddons: [] as CustomerPaidAddonOption[],
    ready: false,
  };
  try {
    const { data, error } = await supabase.rpc(
      "storefront_customer_preorder_options",
      { p_collection_id: collectionId },
    );

    console.error("[CHECKOUT OPTION DEBUG] RPC result", {
      collectionId,
      error: error
        ? {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          }
        : null,
      data,
      dataType: typeof data,
      isArray: Array.isArray(data),
    });

    if (error || data == null) return empty;

    const payload = data as Record<string, unknown>;
    const complimentary = parseComplimentaryOptions(payload.complimentary);
    const paidAddons = parsePaidAddonOptions(payload.paidAddons);

    console.error("[CHECKOUT OPTION DEBUG] Parsed result", {
      collectionId,
      complimentaryCount: complimentary.length,
      complimentary,
      paidAddonCount: paidAddons.length,
      paidAddons,
      ready: true,
    });

    return {
      complimentary,
      paidAddons,
      ready: true,
    };
  } catch {
    return empty;
  }
}

export async function loadCheckoutPickupOffer(
  pickupDate: string,
): Promise<CheckoutPickupOffer> {
  const emptyOffer = {
    complimentaryOptions: [] as CustomerComplimentaryOption[],
    paidAddonOptions: [] as CustomerPaidAddonOption[],
    optionsReady: false,
  };
  const key = pickupDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return {
      collection: null,
      cakes: [],
      unavailableMessage: null,
      ...emptyOffer,
    };
  }
  const offerStarted = performance.now();
  const [collection, supabase] = await Promise.all([
    getStorefrontCollectionForPickupDate(key),
    createClient(),
  ]);
  if (!collection) {
    logPerf("CHECKOUT_DATE", "pickup_offer_unpublished", performance.now() - offerStarted);
    return {
      collection: null,
      cakes: [],
      unavailableMessage: unpublishedCataloguePreorderMessage(key),
      ...emptyOffer,
    };
  }
  const [cakes, options] = await Promise.all([
    listAvailableCheckoutCakes(collection.id),
    loadCustomerPreorderOptions(supabase, collection.id),
  ]);
  logPerf("CHECKOUT_DATE", "pickup_offer", performance.now() - offerStarted, {
    cakeCount: cakes.length,
  });
  return {
    collection,
    cakes,
    unavailableMessage: null,
    complimentaryOptions: options.complimentary,
    paidAddonOptions: options.paidAddons,
    optionsReady: options.ready,
  };
}

export async function loadCheckoutDateConfirmation(input: {
  cakeIds?: readonly string[];
  pickupDate: string;
  fromQuery?: string | null;
  pickupQuery?: string | null;
  toQuery?: string | null;
}): Promise<{
  calendar: CheckoutCalendarContext;
  offer: CheckoutPickupOffer;
}> {
  const started = performance.now();
  const [calendar, offer] = await Promise.all([
    loadCheckoutCalendarContext(input),
    loadCheckoutPickupOffer(input.pickupDate),
  ]);
  logPerf("CHECKOUT_DATE", "date_confirmation", performance.now() - started, {
    pickupDate: input.pickupDate,
    cakeCount: input.cakeIds?.length ?? 0,
  });
  return { calendar, offer };
}

export async function resolveCheckoutCakeSizePrices(
  pickupDate: string,
  sizeIds: readonly string[],
): Promise<Record<string, number>> {
  const key = pickupDate.trim().slice(0, 10);
  const ids = [
    ...new Set(sizeIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || ids.length === 0) {
    return {};
  }
  const supabase = await createClient();
  const resolved = await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await supabase.rpc("library_cake_size_price_on", {
        p_cake_size_id: id,
        p_pickup_date: key,
      });
      if (error || data == null) return null;
      const price = Number(data);
      if (!Number.isFinite(price)) return null;
      return [id, price] as const;
    }),
  );
  const prices: Record<string, number> = {};
  for (const row of resolved) {
    if (!row) continue;
    prices[row[0]] = row[1];
  }
  return prices;
}

export async function loadCartDateCapacityAvailability(input: {
  fromYmd: string;
  toYmd: string;
  collectionId: string | null;
  cart: Array<{
    cakeId: string;
    cakeSizeId: string;
    cakeName: string;
    quantity: number;
  }>;
}): Promise<{
  fullyBookedDates: string[];
  waitingListDates: string[];
  blockingCakeNamesByDate: Record<string, string[]>;
  waitingListLineKeysByDate: Record<string, string[]>;
}> {
  try {
    return await loadCustomerCartDateCapacity(input);
  } catch {
    return {
      fullyBookedDates: [],
      waitingListDates: [],
      blockingCakeNamesByDate: {},
      waitingListLineKeysByDate: {},
    };
  }
}

function ymdQuery(value: string | null | undefined): string | null {
  const key = value?.trim().slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

type CartPickupBounds = {
  min: string;
  max: string;
  excludedDates: string[];
};

function cartPickupBoundsFromSources(input: {
  cakeIds: readonly string[];
  catalogues: ReadonlyArray<{ month: string | null }>;
  specials: ReadonlyArray<{ startDate: string; endDate: string }>;
  memberships: Awaited<ReturnType<typeof getCustomerCakePickupMemberships>>;
}): CartPickupBounds | null {
  if (input.cakeIds.length === 0) return null;
  const earliest = earliestPickupDateYmd();
  const globalMax = latestOrderableCataloguePickupEnd(
    input.catalogues.map((catalogue) => catalogue.month ?? ""),
  );
  const activeSpecialWindows = input.specials.map((special) => ({
    from: special.startDate,
    to: special.endDate,
  }));
  const perCake = input.memberships.map((membership) =>
    cakePickupDateBounds(
      membership.monthlyMonths,
      membership.specialWindows,
      earliest,
    ),
  );
  const bounds = cartPickupDateBounds(perCake, earliest, globalMax);
  if (!bounds) return null;
  return {
    ...bounds,
    excludedDates: cartExcludedPickupDates(
      input.memberships,
      activeSpecialWindows,
      bounds.min,
      bounds.max,
      earliest,
    ),
  };
}

export type CheckoutCalendarContext = {
  cartPickupBounds: CartPickupBounds | null;
  cakePickupMemberships: CakePickupMembership[];
  activeSpecialWindows: Array<{ from: string; to: string }>;
  earliestPickupYmd: string;
  closedDates: string[];
  entrySpecialUnavailableDates: string[];
  hoursSnapshot: OperatingHoursSnapshot;
  venuePhotos: DineInVenuePhotoMap;
  maxPickupDate: string | null;
  minPickupDate: string;
  pickupScopeConstrainsBounds: boolean;
  suggestedPickupDate: string;
};

/**
 * Hours, closed dates, catalogue bounds, and cart date window in one round-trip.
 * Catalogues, specials, hours, and cake memberships load in parallel.
 * Closed dates wait only for the resolved pickup range.
 */
export async function loadCheckoutCalendarContext(input: {
  cakeIds?: readonly string[];
  fromQuery?: string | null;
  pickupQuery?: string | null;
  toQuery?: string | null;
}): Promise<CheckoutCalendarContext> {
  const cakeIds = [
    ...new Set((input.cakeIds ?? []).map((id) => id.trim()).filter(Boolean)),
  ];
  const calendarStarted = performance.now();
  const earliest = earliestPickupDateYmd();
  const [catalogues, specials, hoursSnapshot, memberships, venuePhotos] =
    await Promise.all([
      listOrderableMonthlyCatalogues(),
      listCustomerSpecialCatalogues(),
      loadOperatingHoursSnapshot(),
      cakeIds.length > 0
        ? getCustomerCakePickupMemberships(cakeIds)
        : Promise.resolve([]),
      loadDineInVenuePhotos(),
    ]);
  const globalMax = latestOrderableCataloguePickupEnd(
    catalogues.map((catalogue) => catalogue.month ?? ""),
  );
  const scopeFrom = ymdQuery(input.fromQuery);
  const scopeTo = ymdQuery(input.toQuery);
  const scope = resolveCheckoutPickupScope({
    earliest,
    globalMax,
    scopeFrom,
    scopeTo,
  });
  const pickupFromQuery = ymdQuery(input.pickupQuery);
  const suggestedPickupDate =
    pickupFromQuery &&
    pickupFromQuery >= scope.minPickupDate &&
    (!scope.maxPickupDate || pickupFromQuery <= scope.maxPickupDate)
      ? pickupFromQuery
      : scope.suggestedPickupDate;
  const cartPickupBounds = cartPickupBoundsFromSources({
    cakeIds,
    catalogues,
    memberships,
    specials,
  });
  let rangeMin = scope.minPickupDate;
  let rangeMax = scope.maxPickupDate ?? scope.minPickupDate;
  if (cartPickupBounds) {
    if (cartPickupBounds.min < rangeMin) rangeMin = cartPickupBounds.min;
    if (cartPickupBounds.max > rangeMax) rangeMax = cartPickupBounds.max;
  }
  const closedDates = await listClosedPickupOrderDates(rangeMin, rangeMax);
  const entrySpecialUnavailableDates =
    scopeFrom && scopeTo && isFullMonthPickupScope(scopeFrom, scopeTo)
      ? [
          ...new Set(
            specials
              .filter((special) =>
                monthOverlapsDateRange(
                  scopeFrom,
                  special.startDate,
                  special.endDate,
                ),
              )
              .flatMap((special) =>
                enumerateYmdInclusive(special.startDate, special.endDate),
              ),
          ),
        ].sort()
      : [];

  logPerf("CHECKOUT_DATE", "calendar_context", performance.now() - calendarStarted, {
    cakeCount: cakeIds.length,
    closedDateCount: closedDates.length,
  });
  return {
    cartPickupBounds,
    cakePickupMemberships: memberships,
    activeSpecialWindows: specials.map((special) => ({
      from: special.startDate,
      to: special.endDate,
    })),
    earliestPickupYmd: earliest,
    closedDates,
    entrySpecialUnavailableDates,
    hoursSnapshot,
    venuePhotos,
    maxPickupDate: scope.maxPickupDate,
    minPickupDate: scope.minPickupDate,
    pickupScopeConstrainsBounds: scope.scopeConstrainsBounds,
    suggestedPickupDate: suggestedPickupDate ?? earliest,
  };
}

export async function resolveCartPickupDateBounds(
  cakeIds: readonly string[],
): Promise<CartPickupBounds | null> {
  const ids = [...new Set(cakeIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return null;
  const [catalogues, specials, memberships] = await Promise.all([
    listOrderableMonthlyCatalogues(),
    listCustomerSpecialCatalogues(),
    getCustomerCakePickupMemberships(ids),
  ]);
  return cartPickupBoundsFromSources({
    cakeIds: ids,
    catalogues,
    memberships,
    specials,
  });
}
