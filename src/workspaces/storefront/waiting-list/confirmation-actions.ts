"use server";

import { isValidDeliverySlot } from "@/engines/business-calendar/delivery-hours";
import {
  isValidDineInReservationPair,
  isValidDineInSlot,
} from "@/engines/business-calendar/dine-in-hours";
import {
  buildDineInReservationRpcPayload,
  validateDineInPartyFromForm,
  type DineInReservationRpcPayload,
} from "@/engines/orders/dine-in-party";
import { isValidPickupSlot } from "@/engines/business-calendar/pickup-slots";
import {
  OWNER_DELIVERY_CITY,
  OWNER_DELIVERY_STATE,
  buildCreateStaffFulfilmentRpcParams,
  normalizeRecipientNotifyPreference,
  parseCustomerWebsiteFulfilmentMethod,
  validateOwnerCreateFulfilment,
  type DeliveryCreateDraft,
} from "@/engines/orders/fulfilment";
import { customerNameValidationError } from "@/engines/orders/customer-name";
import {
  customerComplimentaryMutationPayload,
  customerPaidAddonMutationPayload,
  emptyCustomerPreorderSelections,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
  type CustomerPreorderSelections,
} from "@/engines/orders/customer-preorder-options";
import {
  hashWaitingListConfirmationToken,
  isWaitingListConfirmationTokenHash,
} from "@/engines/waiting-list/confirmation-link";
import {
  WAITING_LIST_CONFIRMATION_UNAVAILABLE_TITLE,
  type WaitingListConfirmationDisplayItem,
  type WaitingListConfirmationOutcome,
} from "@/engines/waiting-list/confirmation-page";
import {
  isValidWaitingListWhatsApp,
  waitingListWhatsAppDigits,
} from "@/engines/waiting-list/phone";
import { parseRequiredPhysicalReceipt } from "@/workspaces/storefront/checkout/preorder-draft";
import {
  loadCheckoutCalendarContext,
  loadCheckoutPickupOffer,
} from "@/workspaces/storefront/checkout/actions";
import { createClient } from "@/lib/supabase/server";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import type { CustomerWebsiteFulfilmentMethod } from "@/engines/orders/fulfilment";

export type WaitingListConfirmationState = {
  error: string | null;
  submitted?: boolean;
};

export type WaitingListConfirmationPageModel =
  | {
      kind: "form";
      token: string;
      expiresAt: string;
      guestName: string;
      guestPhone: string;
      pickupDate: string;
      items: WaitingListConfirmationDisplayItem[];
      hoursSnapshot: OperatingHoursSnapshot;
      complimentaryOptions: CustomerComplimentaryOption[];
      paidAddonOptions: CustomerPaidAddonOption[];
      optionsReady: boolean;
    }
  | {
      kind: "submitted" | "expired" | "unavailable";
      expiresAt: string | null;
    };

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonObject<T>(raw: string): T | null {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseDisplayItems(
  value: unknown,
): WaitingListConfirmationDisplayItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const entry = row as Record<string, unknown>;
    const cakeName = asTrimmed(entry.cake_name ?? entry.cakeName);
    const sizeLabel = asTrimmed(entry.size_label ?? entry.sizeLabel);
    const quantity = Number(entry.quantity ?? entry.offered_quantity ?? 0);
    const unitPrice = Number(entry.unit_price ?? entry.unitPrice ?? 0);
    if (!cakeName || !sizeLabel || !Number.isFinite(quantity) || quantity < 1) {
      return [];
    }
    return [
      {
        cakeName,
        sizeLabel,
        quantity: Math.floor(quantity),
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      },
    ];
  });
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

function parseOutcome(value: unknown): WaitingListConfirmationOutcome {
  if (
    value === "usable" ||
    value === "submitted" ||
    value === "expired" ||
    value === "unavailable"
  ) {
    return value;
  }
  return "unavailable";
}

function tokenHashOrNull(rawToken: string): string | null {
  const token = rawToken.trim();
  if (!token) return null;
  try {
    const hash = hashWaitingListConfirmationToken(token);
    return isWaitingListConfirmationTokenHash(hash) ? hash : null;
  } catch {
    return null;
  }
}

export async function loadWaitingListConfirmationPage(
  rawToken: string,
): Promise<WaitingListConfirmationPageModel> {
  const token = rawToken.trim();
  const tokenHash = tokenHashOrNull(token);
  if (!tokenHash) {
    return { kind: "unavailable", expiresAt: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "lookup_waiting_list_confirmation_link",
    { p_token_hash: tokenHash },
  );
  if (error) {
    return { kind: "unavailable", expiresAt: null };
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  const outcome = parseOutcome(payload.outcome);
  const expiresAt = asTrimmed(payload.expires_at) || null;

  if (outcome === "submitted") {
    return { kind: "submitted", expiresAt };
  }
  if (outcome === "expired") {
    return { kind: "expired", expiresAt };
  }
  if (outcome !== "usable") {
    return { kind: "unavailable", expiresAt };
  }

  const pickupDate = asTrimmed(payload.pickup_date).slice(0, 10);
  const items = parseDisplayItems(payload.items);
  if (!pickupDate || items.length === 0) {
    return { kind: "unavailable", expiresAt };
  }

  const [calendar, offer] = await Promise.all([
    loadCheckoutCalendarContext({ pickupQuery: pickupDate }),
    loadCheckoutPickupOffer(pickupDate),
  ]);

  return {
    kind: "form",
    token,
    expiresAt: expiresAt ?? "",
    guestName: asTrimmed(payload.guest_name),
    guestPhone: asTrimmed(payload.guest_phone),
    pickupDate,
    items,
    hoursSnapshot: calendar.hoursSnapshot,
    complimentaryOptions: offer.complimentaryOptions,
    paidAddonOptions: offer.paidAddonOptions,
    optionsReady: offer.optionsReady,
  };
}

export async function submitWaitingListConfirmationAction(
  _prev: WaitingListConfirmationState,
  formData: FormData,
): Promise<WaitingListConfirmationState> {
  const tokenHash = tokenHashOrNull(String(formData.get("token") ?? ""));
  if (!tokenHash) {
    return { error: WAITING_LIST_CONFIRMATION_UNAVAILABLE_TITLE };
  }

  const customerName = String(formData.get("customer_name") ?? "").trim();
  const phone = waitingListWhatsAppDigits(String(formData.get("phone") ?? ""));
  const includeReceipt = parseRequiredPhysicalReceipt(
    String(formData.get("include_receipt") ?? "").trim(),
  );
  const pickupDate = String(formData.get("pickup_date") ?? "")
    .trim()
    .slice(0, 10);
  const pickupTime = String(formData.get("pickup_time") ?? "").trim();
  const requestedDate = String(formData.get("requested_date") ?? "")
    .trim()
    .slice(0, 10);
  const fulfilmentMethod = parseCustomerWebsiteFulfilmentMethod(
    String(formData.get("fulfilment_method") ?? ""),
  );
  const notes = String(formData.get("notes") ?? "").trim();
  const persistOptions =
    String(formData.get("preorder_options_ready") ?? "") === "1";
  const selections = parseCustomerSelections(formData);

  if (!customerName || !phone) {
    return { error: "Please fill in your name and WhatsApp phone number." };
  }
  const nameError = customerNameValidationError(customerName);
  if (nameError) {
    return { error: nameError };
  }
  if (!isValidWaitingListWhatsApp(phone)) {
    return { error: "Please enter a valid WhatsApp number." };
  }
  if (includeReceipt === null) {
    return {
      error: "Please choose whether you would like a copy of the receipt.",
    };
  }
  if (!pickupDate || pickupDate !== requestedDate) {
    return { error: "Please keep the requested collection date." };
  }

  let dineInPayload: DineInReservationRpcPayload | null = null;
  let reservationTime = "";
  let deliveryDraft: DeliveryCreateDraft | null = null;
  const calendar = await loadCheckoutCalendarContext({
    pickupQuery: pickupDate,
  });
  const hoursSnapshot = calendar.hoursSnapshot;

  if (fulfilmentMethod === "pickup") {
    if (
      !pickupTime ||
      !isValidPickupSlot(pickupDate, pickupTime, hoursSnapshot)
    ) {
      return { error: "Please choose a valid pickup time for that date." };
    }
  } else if (fulfilmentMethod === "dine_in") {
    reservationTime = String(formData.get("reservation_time") ?? "").trim();
    if (
      !reservationTime ||
      !isValidDineInSlot(pickupDate, reservationTime, hoursSnapshot)
    ) {
      return {
        error: "Please choose a valid dine-in reservation time for that date.",
      };
    }
    if (
      !pickupTime ||
      !isValidDineInSlot(pickupDate, pickupTime, hoursSnapshot)
    ) {
      return {
        error: "Please choose a valid cake serving time for that date.",
      };
    }
    const partyResult = validateDineInPartyFromForm(formData, true);
    if (!partyResult.ok) {
      return { error: partyResult.error };
    }
    if (
      !isValidDineInReservationPair({
        dateYmd: pickupDate,
        reservationTime,
        servingTime: pickupTime,
        venue: partyResult.party.venue,
        snapshot: hoursSnapshot,
      })
    ) {
      return {
        error:
          "Cake serving time must be within 1 hour of the reservation time, and the venue must be available for both times.",
      };
    }
    dineInPayload = buildDineInReservationRpcPayload({
      party: partyResult.party,
      reservationTime,
      reservationNote:
        String(formData.get("reservation_note") ?? "").trim() || null,
    });
  } else {
    if (
      !pickupTime ||
      !isValidDeliverySlot(pickupDate, pickupTime, hoursSnapshot)
    ) {
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

  let deliveryPayload: ReturnType<
    typeof buildCreateStaffFulfilmentRpcParams
  >["p_delivery"] = null;
  if (fulfilmentMethod === "delivery" && deliveryDraft) {
    try {
      deliveryPayload = buildCreateStaffFulfilmentRpcParams({
        method: "delivery",
        delivery: deliveryDraft,
      }).p_delivery;
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Please enter the delivery details.",
      };
    }
  }

  const offer = persistOptions
    ? await loadCheckoutPickupOffer(pickupDate)
    : {
        complimentaryOptions: [] as CustomerComplimentaryOption[],
        paidAddonOptions: [] as CustomerPaidAddonOption[],
        optionsReady: false,
      };

  const complimentary = persistOptions
    ? customerComplimentaryMutationPayload({
        options: offer.complimentaryOptions,
        selectedCodes: selections.complimentaryCodes,
      })
    : [];
  const paidAddons = persistOptions
    ? customerPaidAddonMutationPayload({
        options: offer.paidAddonOptions,
        selections,
      })
    : [];

  const method: CustomerWebsiteFulfilmentMethod = fulfilmentMethod;
  const rpcPayload = {
    customer_name: customerName,
    phone,
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    fulfilment_method: method,
    include_receipt: includeReceipt,
    notes: notes || null,
    delivery: method === "delivery" ? deliveryPayload : null,
    dine_in: method === "dine_in" ? dineInPayload : null,
    complimentary,
    paid_addons: paidAddons,
  };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "submit_waiting_list_confirmation",
    {
      p_token_hash: tokenHash,
      p_payload: rpcPayload,
    },
  );
  if (error) {
    return { error: error.message };
  }
  const result = data as Record<string, unknown> | null;
  if (result?.ok === true) {
    return { error: null, submitted: true };
  }
  return { error: WAITING_LIST_CONFIRMATION_UNAVAILABLE_TITLE };
}
