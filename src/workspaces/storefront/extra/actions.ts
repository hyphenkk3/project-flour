"use server";

import { extraCartItemUnavailableMessage, extraSubmitCustomerError } from "@/engines/extra/customer-fresh-picks";
import { isValidExtraCustomerPickup } from "@/engines/extra/extra-pickup";
import {
  customerComplimentaryMutationPayload,
  customerPaidAddonMutationPayload,
  emptyCustomerPreorderSelections,
  parseCustomerComplimentaryOptions,
  parseCustomerPaidAddonOptions,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
} from "@/engines/orders/customer-preorder-options";
import { createClient } from "@/lib/supabase/server";
import { scheduleStaffNotificationDispatch } from "@/foundation/staff/schedule-staff-notification-dispatch";
import { getStorefrontCollectionForPickupDate } from "@/workspaces/storefront/catalog/queries";
import { parseRequiredPhysicalReceipt } from "@/workspaces/storefront/checkout/preorder-draft";
import { getStorefrontExtraById } from "@/workspaces/storefront/extra/queries";
import { setGuestPreorderReceiptCookie } from "@/workspaces/storefront/checkout/receipt";

export type ExtraOrderState = {
  error: string | null;
  orderId?: string;
};

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
      complimentaryOptions: parseCustomerComplimentaryOptions(
        payload.complimentary,
      ),
      paidAddonOptions: parseCustomerPaidAddonOptions(payload.paidAddons),
    };
  } catch {
    return empty;
  }
}

export async function submitGuestExtraOrderAction(
  _prev: ExtraOrderState,
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

  const extras = [];
  for (const [index, extraStockId] of extraStockIds.entries()) {
    const extra = await getStorefrontExtraById(extraStockId);
    if (!extra || !extra.pickupAvailableFromAt || !extra.pickupThroughAt) {
      return {
        error: extraCartItemUnavailableMessage(
          extra?.cakeName || extraCakeNames[index] || "",
        ),
      };
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
    extras.push(extra);
  }

  const { complimentaryOptions, paidAddonOptions } =
    await loadExtraCustomerOptions(pickupDate);
  const allowedComplimentary = new Set(
    complimentaryOptions.map((option) => option.code),
  );
  if (submittedComplimentaryCodes.some((code) => !allowedComplimentary.has(code))) {
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
  });

  if (error) {
    for (const extra of extras) {
      const stillAvailable = await getStorefrontExtraById(extra.id);
      if (!stillAvailable) {
        return { error: extraCartItemUnavailableMessage(extra.cakeName) };
      }
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
  scheduleStaffNotificationDispatch();
  return { error: null, orderId };
}
