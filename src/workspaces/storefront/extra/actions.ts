"use server";

import { redirect } from "next/navigation";
import {
  extraSubmitCustomerError,
  FRESH_PICKS_SUCCESS_FLOW,
} from "@/engines/extra/customer-fresh-picks";
import { isValidExtraCustomerPickup } from "@/engines/extra/extra-pickup";
import {
  customerComplimentaryMutationPayload,
  selectCustomerComplimentaryOptions,
  type CustomerComplimentaryOption,
} from "@/engines/orders/customer-preorder-options";
import { createClient } from "@/lib/supabase/server";
import { scheduleStaffNotificationDispatch } from "@/foundation/staff/schedule-staff-notification-dispatch";
import { getStorefrontCollectionForPickupDate } from "@/workspaces/storefront/catalog/queries";
import { parseRequiredPhysicalReceipt } from "@/workspaces/storefront/checkout/preorder-draft";
import { getStorefrontExtraById } from "@/workspaces/storefront/extra/queries";
import { setGuestPreorderReceiptCookie } from "@/workspaces/storefront/checkout/receipt";

export type ExtraOrderState = {
  error: string | null;
};

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

export async function loadExtraComplimentaryOptions(
  pickupDate: string,
): Promise<{ complimentaryOptions: CustomerComplimentaryOption[] }> {
  const empty = { complimentaryOptions: [] as CustomerComplimentaryOption[] };
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
    };
  } catch {
    return empty;
  }
}

export async function submitGuestExtraOrderAction(
  _prev: ExtraOrderState,
  formData: FormData,
): Promise<ExtraOrderState> {
  const extraStockId = String(formData.get("extra_stock_id") ?? "").trim();
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
  const notes = String(formData.get("notes") ?? "").trim();
  const submittedComplimentaryCodes = formData
    .getAll("complimentary_code")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!extraStockId) {
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
  if (receiptRequested && !email) {
    return {
      error: "Please enter your email to receive a copy of your order.",
    };
  }
  if (email && !isPlausibleEmail(email)) {
    return { error: "Please enter a valid email address." };
  }

  const extra = await getStorefrontExtraById(extraStockId);
  if (!extra || !extra.pickupAvailableFromAt || !extra.pickupThroughAt) {
    return { error: extraSubmitCustomerError("Extra is not available") };
  }
  if (
    !pickupDate ||
    !pickupTime ||
    !isValidExtraCustomerPickup({
      pickupDate,
      pickupTime,
      pickupAvailableFromAt: extra.pickupAvailableFromAt,
      orderCutoffAt: extra.pickupThroughAt,
    })
  ) {
    return { error: "Please choose a valid pickup time for that date." };
  }

  const { complimentaryOptions } =
    await loadExtraComplimentaryOptions(pickupDate);
  const allowed = new Set(complimentaryOptions.map((option) => option.code));
  if (submittedComplimentaryCodes.some((code) => !allowed.has(code))) {
    return { error: "Complimentary item is not available" };
  }
  const complimentary = customerComplimentaryMutationPayload({
    options: complimentaryOptions,
    selectedCodes: submittedComplimentaryCodes,
  });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_guest_extra_order", {
    p_customer_name: customerName,
    p_phone: phone,
    p_email: email || null,
    p_pickup_date: pickupDate,
    p_pickup_time: pickupTime,
    p_notes: notes || null,
    p_extra_stock_id: extraStockId,
    p_email_submission_receipt_requested: receiptRequested,
    p_include_receipt: includeReceipt,
    p_complimentary: complimentary,
  });

  if (error) {
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
  scheduleStaffNotificationDispatch();
  redirect(
    `/order/success?order=${orderId}&flow=${FRESH_PICKS_SUCCESS_FLOW}`,
  );
}
