"use server";

import { isDineInVenueAvailable } from "@/engines/business-calendar/dine-in-hours";
import {
  buildDineInReservationRpcPayload,
  validateDineInPartyFromForm,
} from "@/engines/orders/dine-in-party";
import {
  extraCartItemUnavailableMessage,
  extraSubmitCustomerError,
} from "@/engines/extra/customer-fresh-picks";
import { isValidExtraCustomerFulfilment } from "@/engines/extra/fresh-picks-fulfilment";
import {
  DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
  deliveryProcessingFeeAckMatchesAuthority,
  isDeliveryProcessingFeeAckError,
  parseDeliveryProcessingFeeAckPayload,
} from "@/engines/orders/delivery-processing-fee-ack";
import {
  buildCreateStaffFulfilmentRpcParams,
  OWNER_DELIVERY_CITY,
  OWNER_DELIVERY_STATE,
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
} from "@/engines/orders/customer-preorder-options";
import { createClient } from "@/lib/supabase/server";
import { scheduleStaffNotificationDispatch } from "@/foundation/staff/schedule-staff-notification-dispatch";
import { getStorefrontCollectionForPickupDate } from "@/workspaces/storefront/catalog/queries";
import { parseRequiredPhysicalReceipt } from "@/workspaces/storefront/checkout/preorder-draft";
import { loadFreshPicksPreparationConfig } from "@/workspaces/storefront/extra/config";
import { getStorefrontExtraById } from "@/workspaces/storefront/extra/queries";
import { setGuestPreorderReceiptCookie } from "@/workspaces/storefront/checkout/receipt";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import {
  acceptPerfCorrelationId,
  logPerf,
  logPerfSkipped,
  runWithPerfContext,
} from "@/lib/perf/dev-only-server";

export type ExtraOrderState = {
  error: string | null;
  orderId?: string;
};

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

export async function loadExtraCustomerOptions(pickupDate: string): Promise<{
  complimentaryOptions: CustomerComplimentaryOption[];
  paidAddonOptions: CustomerPaidAddonOption[];
}> {
  const empty = {
    complimentaryOptions: [] as CustomerComplimentaryOption[],
    paidAddonOptions: [] as CustomerPaidAddonOption[],
  };
  const key = pickupDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return empty;
  try {
    const collection = await getStorefrontCollectionForPickupDate(key);
    if (!collection) return empty;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "storefront_customer_preorder_options",
      { p_collection_id: collection.id },
    );
    if (error || data == null) return empty;
    const payload = data as Record<string, unknown>;
    return {
      complimentaryOptions: parseComplimentaryOptions(payload.complimentary),
      paidAddonOptions: parsePaidAddonOptions(payload.paidAddons),
    };
  } catch {
    return empty;
  }
}

export async function submitGuestExtraOrderAction(
  _prev: ExtraOrderState,
  formData: FormData,
): Promise<ExtraOrderState> {
  const correlationId = acceptPerfCorrelationId(
    String(formData.get("perf_correlation_id") ?? ""),
  );
  return runWithPerfContext(
    { correlationId, source: "extra_submit" },
    () => submitGuestExtraOrderActionTimed(formData, correlationId),
  );
}

async function submitGuestExtraOrderActionTimed(
  formData: FormData,
  correlationId: string,
): Promise<ExtraOrderState> {
  const totalStarted = performance.now();
  logPerf("EXTRA_SUBMIT", "action_start", 0);
  try {
    return await submitGuestExtraOrderActionBody(formData);
  } finally {
    logPerf("EXTRA_SUBMIT", "TOTAL", performance.now() - totalStarted, {
      correlationId,
    });
  }
}

async function submitGuestExtraOrderActionBody(
  formData: FormData,
): Promise<ExtraOrderState> {
  const extraStockIds = formData
    .getAll("extra_stock_id")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const extraCakeNames = formData
    .getAll("extra_cake_name")
    .map((value) => String(value).trim());
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
  const submittedComplimentaryCodes = formData
    .getAll("complimentary_code")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const submittedPaidAddonCodes = formData
    .getAll("paid_addon_code")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (extraStockIds.length === 0) {
    return { error: "Extra is required" };
  }
  if (new Set(extraStockIds).size !== extraStockIds.length) {
    return { error: "Extra is required" };
  }
  if (!customerName || !phone) {
    return { error: "Please fill in your name and WhatsApp phone number." };
  }
  if (includeReceipt === null) {
    return {
      error: "Please choose whether you would like a copy of the receipt.",
    };
  }

  const hoursSnapshot = await loadOperatingHoursSnapshot();
  const preparationConfig = await loadFreshPicksPreparationConfig();
  const extras = [];
  for (const [index, extraStockId] of extraStockIds.entries()) {
    const extra = await getStorefrontExtraById(extraStockId);
    if (
      !extra ||
      extra.walkInHeld ||
      !extra.pickupAvailableFromAt ||
      !extra.pickupThroughAt
    ) {
      return {
        error: extraCartItemUnavailableMessage(
          extra?.cakeName || extraCakeNames[index] || "",
        ),
      };
    }
    if (
      !pickupDate ||
      !pickupTime ||
      !isValidExtraCustomerFulfilment({
        method: fulfilmentMethod,
        fulfilmentDate: pickupDate,
        fulfilmentTime: pickupTime,
        pickupAvailableFromAt: extra.pickupAvailableFromAt,
        orderCutoffAt: extra.pickupThroughAt,
        snapshot: hoursSnapshot,
        config: preparationConfig,
      })
    ) {
      return { error: "Please choose a valid fulfilment time for that date." };
    }
    extras.push(extra);
  }

  let dineInPayload: Record<string, unknown> | null = null;
  let deliveryPayload: Record<string, unknown> | null = null;
  if (fulfilmentMethod === "dine_in") {
    const reservationTime = pickupTime;
    const partyResult = validateDineInPartyFromForm(formData, true);
    if (!partyResult.ok) {
      return { error: partyResult.error };
    }
    if (
      !isDineInVenueAvailable(
        pickupDate,
        reservationTime,
        partyResult.party.venue,
        hoursSnapshot,
      )
    ) {
      return {
        error: "Please choose a valid dine-in venue for that date and time.",
      };
    }
    dineInPayload = buildDineInReservationRpcPayload({
      party: partyResult.party,
      reservationTime,
      reservationNote:
        String(formData.get("reservation_note") ?? "").trim() || null,
    });
  } else if (fulfilmentMethod === "delivery") {
    const sameAsCustomer =
      String(formData.get("same_as_customer") ?? "") === "on" ||
      String(formData.get("same_as_customer") ?? "") === "true";
    const deliveryDraft: DeliveryCreateDraft = {
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
    deliveryPayload = buildCreateStaffFulfilmentRpcParams({
      method: "delivery",
      delivery: deliveryDraft,
    }).p_delivery;
  }

  const deliveryProcessingAck = parseDeliveryProcessingFeeAck(formData);
  const deliveryAckCheck = deliveryProcessingFeeAckMatchesAuthority({
    payload: deliveryProcessingAck,
    fulfilmentMethod,
  });
  if (!deliveryAckCheck.ok) {
    return { error: DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE };
  }

  const { complimentaryOptions, paidAddonOptions } =
    await loadExtraCustomerOptions(pickupDate);
  const allowedComplimentary = new Set(
    complimentaryOptions.map((option) => option.code),
  );
  if (
    submittedComplimentaryCodes.some((code) => !allowedComplimentary.has(code))
  ) {
    return { error: "Complimentary item is not available" };
  }
  const allowedPaid = new Set(paidAddonOptions.map((option) => option.code));
  if (submittedPaidAddonCodes.some((code) => !allowedPaid.has(code))) {
    return { error: "Paid add-on is not available" };
  }
  const complimentary = customerComplimentaryMutationPayload({
    options: complimentaryOptions,
    selectedCodes: submittedComplimentaryCodes,
  });
  const paidAddons = customerPaidAddonMutationPayload({
    options: paidAddonOptions,
    selections: {
      ...emptyCustomerPreorderSelections(),
      complimentaryCodes: submittedComplimentaryCodes,
      paidAddonCodes: submittedPaidAddonCodes,
      birthdayCardMessage: String(formData.get("birthday_card_message") ?? ""),
      wishingCardMessage: String(formData.get("wishing_card_message") ?? ""),
    },
  });

  const supabase = await createClient();
  const rpcStarted = performance.now();
  const { data, error } = await supabase.rpc("submit_guest_extra_order", {
    p_customer_name: customerName,
    p_phone: phone,
    p_email: null,
    p_pickup_date: pickupDate,
    p_pickup_time: pickupTime,
    p_notes: notes || null,
    p_extra_stock_id: extraStockIds[0],
    p_extra_stock_ids: extraStockIds,
    p_email_submission_receipt_requested: false,
    p_include_receipt: includeReceipt,
    p_complimentary: complimentary,
    p_paid_addons: paidAddons,
    p_fulfilment_method: fulfilmentMethod,
    p_delivery: deliveryPayload,
    p_dine_in: dineInPayload,
    ...(fulfilmentMethod === "delivery"
      ? { p_delivery_processing_fee_ack: deliveryProcessingAck }
      : {}),
  });
  logPerf(
    "EXTRA_SUBMIT",
    "submit_guest_extra_order",
    performance.now() - rpcStarted,
  );

  if (error) {
    for (const extra of extras) {
      const stillAvailable = await getStorefrontExtraById(extra.id);
      if (!stillAvailable || stillAvailable.walkInHeld) {
        return { error: extraCartItemUnavailableMessage(extra.cakeName) };
      }
    }
    if (isDeliveryProcessingFeeAckError(error.message)) {
      return { error: DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE };
    }
    return { error: extraSubmitCustomerError(error.message) };
  }

  const orderId =
    data && typeof data === "object" && "id" in data
      ? String((data as { id: string }).id)
      : "";
  if (!orderId) {
    return { error: "Order was created but could not be confirmed." };
  }

  await setGuestPreorderReceiptCookie(orderId);
  const catalogueVoucherId = String(
    formData.get("catalogue_voucher_id") ?? "",
  ).trim();
  if (catalogueVoucherId) {
    const voucherStarted = performance.now();
    const { applyGuestCatalogueVoucherAction } = await import(
      "@/workspaces/vouchers/catalogue-actions"
    );
    const applied = await applyGuestCatalogueVoucherAction(
      orderId,
      catalogueVoucherId,
    );
    logPerf(
      "EXTRA_SUBMIT",
      "applyGuestCatalogueVoucherAction",
      performance.now() - voucherStarted,
      { voucherApply: "executed" },
    );
    if (applied.error) {
      return { error: applied.error };
    }
  } else {
    logPerfSkipped("EXTRA_SUBMIT", "applyGuestCatalogueVoucherAction", {
      voucherApply: "skipped",
    });
  }
  scheduleStaffNotificationDispatch();
  logPerf("EXTRA_SUBMIT", "action_return", 0);
  return { error: null, orderId };
}
