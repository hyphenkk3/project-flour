"use server";

import { redirect } from "next/navigation";
import { ORDERS_CLOSED_RPC_MESSAGE } from "@/engines/business-calendar/order-availability";
import { isValidDeliverySlot } from "@/engines/business-calendar/delivery-hours";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import {
  isValidDineInReservationPair,
  isValidDineInSlot,
  parseDineInVenue,
  parseGuestCount,
} from "@/engines/business-calendar/dine-in-hours";
import {
  earliestPickupDateYmd,
  isValidPickupSlot,
} from "@/engines/business-calendar/pickup-slots";
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
  selectCustomerComplimentaryOptions,
  selectCustomerPaidAddonOptions,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
  type CustomerPreorderSelections,
} from "@/engines/orders/customer-preorder-options";
import type { StorefrontCake, StorefrontCollection } from "@/types/storefront";
import { createClient } from "@/lib/supabase/server";
import {
  cakePickupDateBounds,
  cartExcludedPickupDates,
  cartPickupDateBounds,
  latestOrderableCataloguePickupEnd,
} from "@/engines/menu/customer-browse";
import {
  getStorefrontCollectionForPickupDate,
  getCustomerCakePickupMemberships,
  listAvailableCakes,
  listCustomerSpecialCatalogues,
  listOrderableMonthlyCatalogues,
  unpublishedCataloguePreorderMessage,
} from "@/workspaces/storefront/catalog/queries";
import { isPickupOrdersClosed } from "@/workspaces/storefront/checkout/order-availability";
import { parseRequiredPhysicalReceipt } from "@/workspaces/storefront/checkout/preorder-draft";
import { setGuestPreorderReceiptCookie } from "@/workspaces/storefront/checkout/receipt";

export type CheckoutState = {
  error: string | null;
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

function isPlausibleEmail(value: string): boolean {
  // Lightweight client/server guard — not a full RFC validator.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function submitGuestPreorderAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const receiptRequested =
    String(formData.get("email_submission_receipt_requested") ?? "") === "on" ||
    String(formData.get("email_submission_receipt_requested") ?? "") === "true";
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

  if (!customerName || !phone) {
    return { error: "Please fill in your name and WhatsApp phone number." };
  }
  if (includeReceipt === null) {
    return {
      error: "Please choose whether you would like a copy of the receipt.",
    };
  }
  if (receiptRequested && !email) {
    return {
      error:
        "Please enter your email to receive a copy of your preorder submission.",
    };
  }
  if (email && !isPlausibleEmail(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (!pickupDate) {
    return {
      error:
        fulfilmentMethod === "pickup"
          ? "Please choose a pickup date and time."
          : "Please choose a date and time.",
    };
  }
  if (pickupDate < earliestPickupDateYmd()) {
    return {
      error:
        fulfilmentMethod === "pickup"
          ? "Please choose a valid pickup time for that date."
          : "Please choose a valid time for that date.",
    };
  }
  if (await isPickupOrdersClosed(pickupDate)) {
    return { error: ORDERS_CLOSED_RPC_MESSAGE };
  }

  let guestCount: number | null = null;
  let dineInVenue: ReturnType<typeof parseDineInVenue> = null;
  let reservationTime = "";
  let deliveryDraft: DeliveryCreateDraft | null = null;
  const hoursSnapshot = await loadOperatingHoursSnapshot();

  if (fulfilmentMethod === "pickup") {
    if (!pickupTime || !isValidPickupSlot(pickupDate, pickupTime, hoursSnapshot)) {
      return {
        error: "Please choose a valid pickup time for that date.",
      };
    }
  } else if (fulfilmentMethod === "dine_in") {
    reservationTime = String(formData.get("reservation_time") ?? "").trim();
    if (!reservationTime || !isValidDineInSlot(pickupDate, reservationTime, hoursSnapshot)) {
      return {
        error: "Please choose a valid dine-in reservation time for that date.",
      };
    }
    if (!pickupTime || !isValidDineInSlot(pickupDate, pickupTime, hoursSnapshot)) {
      return {
        error: "Please choose a valid cake serving time for that date.",
      };
    }
    guestCount = parseGuestCount(formData.get("guest_count"));
    if (guestCount == null) {
      return { error: "Please enter how many guests are dining in." };
    }
    dineInVenue = parseDineInVenue(formData.get("dine_in_venue"));
    if (dineInVenue == null) {
      return { error: "Please choose where you would like to sit." };
    }
    if (
      !isValidDineInReservationPair({
        dateYmd: pickupDate,
        reservationTime,
        servingTime: pickupTime,
        venue: dineInVenue,
        snapshot: hoursSnapshot,
      })
    ) {
      return {
        error:
          "Cake serving time must be within 1 hour of the reservation time, and the venue must be available for both times.",
      };
    }
  } else {
    if (!pickupTime || !isValidDeliverySlot(pickupDate, pickupTime, hoursSnapshot)) {
      return {
        error: "Please choose a valid delivery time for that date.",
      };
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

  const collection = await getStorefrontCollectionForPickupDate(pickupDate);
  if (!collection) {
    return { error: unpublishedCataloguePreorderMessage(pickupDate) };
  }
  const offered = await listAvailableCakes(collection.id);
  for (const item of items) {
    const cake = offered.find((entry) => entry.id === item.cake_id);
    const size = cake?.sizes.find((entry) => entry.id === item.cake_size_id);
    if (!cake || !size) {
      return {
        error: "Please add at least one cake from the catalogue for that pickup date.",
      };
    }
  }

  const supabase = await createClient();
  const optionCatalog = persistOptions
    ? await loadCustomerPreorderOptions(supabase, collection.id)
    : { complimentary: [], paidAddons: [], ready: false };
  const complimentary = customerComplimentaryMutationPayload({
    options: optionCatalog.complimentary,
    selectedCodes: selections.complimentaryCodes,
  });
  const paidAddons = customerPaidAddonMutationPayload({
    options: optionCatalog.paidAddons,
    selections,
  });

  const rpcArgs: Record<string, unknown> = {
    p_customer_name: customerName,
    p_phone: phone,
    p_email: email || null,
    p_pickup_date: pickupDate,
    p_pickup_time: pickupTime,
    p_notes: notes || null,
    p_items: items,
    p_email_submission_receipt_requested: receiptRequested,
    p_include_receipt: includeReceipt,
    p_fulfilment_method: fulfilmentMethod,
    p_delivery:
      fulfilmentMethod === "delivery" && deliveryDraft
        ? buildCreateStaffFulfilmentRpcParams({
            method: "delivery",
            delivery: deliveryDraft,
          }).p_delivery
        : null,
    p_dine_in:
      fulfilmentMethod === "dine_in" && guestCount != null && dineInVenue
        ? {
            venue: dineInVenue,
            guest_count: guestCount,
            reservation_time: reservationTime,
            reservation_note:
              String(formData.get("reservation_note") ?? "").trim() || null,
          }
        : null,
  };
  if (optionCatalog.ready) {
    rpcArgs.p_complimentary = complimentary;
    rpcArgs.p_paid_addons = paidAddons;
  }

  const { data, error } = await supabase.rpc("submit_guest_preorder", rpcArgs);

  if (error) {
    return { error: error.message };
  }

  const orderId =
    data && typeof data === "object" && "id" in data
      ? String((data as { id: string }).id)
      : "";

  if (!orderId) {
    return { error: "Order was created but could not be confirmed." };
  }

  await setGuestPreorderReceiptCookie(orderId);
  redirect(`/order/success?order=${orderId}`);
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
    if (error || data == null) return empty;
    const payload = data as Record<string, unknown>;
    return {
      complimentary: parseComplimentaryOptions(payload.complimentary),
      paidAddons: parsePaidAddonOptions(payload.paidAddons),
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
  const collection = await getStorefrontCollectionForPickupDate(key);
  if (!collection) {
    return {
      collection: null,
      cakes: [],
      unavailableMessage: unpublishedCataloguePreorderMessage(key),
      ...emptyOffer,
    };
  }
  const cakes = await listAvailableCakes(collection.id);
  const supabase = await createClient();
  const options = await loadCustomerPreorderOptions(supabase, collection.id);
  return {
    collection,
    cakes,
    unavailableMessage: null,
    complimentaryOptions: options.complimentary,
    paidAddonOptions: options.paidAddons,
    optionsReady: options.ready,
  };
}

export async function resolveCartPickupDateBounds(
  cakeIds: readonly string[],
): Promise<{ min: string; max: string; excludedDates: string[] } | null> {
  const earliest = earliestPickupDateYmd();
  const [catalogues, specials] = await Promise.all([
    listOrderableMonthlyCatalogues(),
    listCustomerSpecialCatalogues(),
  ]);
  const globalMax = latestOrderableCataloguePickupEnd(
    catalogues.map((catalogue) => catalogue.month ?? ""),
  );
  const activeSpecialWindows = specials.map((special) => ({
    from: special.startDate,
    to: special.endDate,
  }));
  const memberships = await getCustomerCakePickupMemberships(cakeIds);
  const perCake = memberships.map((membership) =>
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
      memberships,
      activeSpecialWindows,
      bounds.min,
      bounds.max,
      earliest,
    ),
  };
}
