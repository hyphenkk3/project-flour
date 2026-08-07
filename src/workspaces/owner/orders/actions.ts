"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildConfirmationPayload,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import { orderMateriallyAffectsConfirmation } from "@/engines/orders/confirmation-validity";
import { isValidPickupSlot } from "@/engines/business-calendar/pickup-slots";
import { requireStaff } from "@/foundation/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { StorefrontOrderListItem } from "@/types/storefront";
import {
  fromDatetimeLocalValue,
} from "@/workspaces/owner/orders/labels";
import {
  getGuestOrderById,
  getGuestOrderListItem,
  listGuestOrders,
} from "@/workspaces/owner/orders/queries";
import {
  getAvailableCakeById,
  getCurrentCollection,
  listAvailableCakes,
} from "@/workspaces/storefront/catalog/queries";

export type OrderWorkspaceSaveState = {
  error: string | null;
  success: boolean;
};

async function requireOwner() {
  const staff = await requireStaff();
  if (staff.role.code !== "owner") {
    redirect("/home");
  }
  return staff;
}

async function insertTimelineEvent(input: {
  orderId: string;
  eventType: string;
  actorStaffId: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("order_timeline_events").insert({
    order_id: input.orderId,
    event_type: input.eventType,
    actor_staff_id: input.actorStaffId,
    metadata: input.metadata ?? {},
  });
  if (error) {
    throw new Error(error.message);
  }
}

function parseItemsFromForm(formData: FormData): Array<{
  cakeId: string;
  cakeSizeId: string;
  quantity: number;
}> {
  const raw = String(formData.get("items_json") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      cakeId?: string;
      cakeSizeId?: string;
      quantity?: number;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        cakeId: String(item.cakeId ?? "").trim(),
        cakeSizeId: String(item.cakeSizeId ?? "").trim(),
        quantity: Number(item.quantity ?? 0),
      }))
      .filter(
        (item) =>
          item.cakeId &&
          item.cakeSizeId &&
          Number.isInteger(item.quantity) &&
          item.quantity >= 1,
      );
  } catch {
    return [];
  }
}

function parseComplimentaryFromForm(formData: FormData): Array<{
  typeId: string | null;
  name: string;
  quantity: number;
  sortOrder: number;
}> {
  const raw = String(formData.get("complimentary_json") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      typeId?: string | null;
      name?: string;
      quantity?: number;
      sortOrder?: number;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => ({
        typeId: item.typeId ? String(item.typeId) : null,
        name: String(item.name ?? "").trim(),
        quantity: Number(item.quantity ?? 0),
        sortOrder: Number(item.sortOrder ?? index),
      }))
      .filter((item) => item.name.length > 0 && item.quantity >= 0);
  } catch {
    return [];
  }
}

export async function saveOrderWorkspaceAction(
  orderId: string,
  _prev: OrderWorkspaceSaveState,
  formData: FormData,
): Promise<OrderWorkspaceSaveState> {
  const staff = await requireOwner();

  const guestName = String(formData.get("guest_name") ?? "").trim();
  const guestPhone = String(formData.get("guest_phone") ?? "").trim();
  const guestEmail = String(formData.get("guest_email") ?? "").trim();
  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  const pickupTime = String(formData.get("pickup_time") ?? "").trim();
  const customerNotes = String(formData.get("customer_notes") ?? "").trim();
  const internalNotes = String(formData.get("internal_notes") ?? "").trim();
  const draftItems = parseItemsFromForm(formData);
  const draftComplimentary = parseComplimentaryFromForm(formData);

  if (!guestName || !guestPhone) {
    return {
      error: "Please fill in the customer name and WhatsApp phone.",
      success: false,
    };
  }
  if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return {
      error: "Please enter a valid email address, or leave email blank.",
      success: false,
    };
  }
  if (!pickupDate || !pickupTime) {
    return { error: "Please choose a pickup date and time.", success: false };
  }
  if (!isValidPickupSlot(pickupDate, pickupTime)) {
    return {
      error: "Please choose a valid pickup time for that date.",
      success: false,
    };
  }
  if (draftItems.length === 0) {
    return { error: "Please keep at least one cake on the order.", success: false };
  }

  const before = await getGuestOrderById(orderId);
  if (!before) {
    return { error: "Order not found.", success: false };
  }
  if (
    before.status !== "submitted" &&
    before.status !== "pending_confirmation"
  ) {
    return {
      error: "This order can no longer be edited.",
      success: false,
    };
  }

  const collection = await getCurrentCollection();
  const cakes = collection
    ? await listAvailableCakes(collection.id)
    : [];

  const resolvedItems: Array<{
    cakeId: string;
    cakeSizeId: string;
    quantity: number;
    unitPrice: number;
    cakeName: string;
    sizeLabel: string;
  }> = [];

  for (const draft of draftItems) {
    let cake = cakes.find((entry) => entry.id === draft.cakeId) ?? null;
    if (!cake) {
      cake = await getAvailableCakeById(draft.cakeId);
    }
    if (!cake) {
      return {
        error: "One of the cakes is not available in the current collection.",
        success: false,
      };
    }
    const size = cake.sizes.find((entry) => entry.id === draft.cakeSizeId);
    if (!size) {
      return {
        error: `Please choose a valid size for ${cake.name}.`,
        success: false,
      };
    }
    const prior = before.items.find(
      (item) =>
        item.cakeId === draft.cakeId && item.cakeSizeId === draft.cakeSizeId,
    );
    resolvedItems.push({
      cakeId: cake.id,
      cakeSizeId: size.id,
      quantity: draft.quantity,
      unitPrice: prior ? prior.unitPrice : size.price,
      cakeName: prior?.cakeName ?? cake.name,
      sizeLabel: prior?.sizeLabel ?? size.size,
    });
  }

  // Consolidate identical cake+size
  const consolidated = new Map<string, (typeof resolvedItems)[number]>();
  for (const item of resolvedItems) {
    const key = `${item.cakeId}::${item.cakeSizeId}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      consolidated.set(key, { ...item });
    }
  }
  const finalItems = Array.from(consolidated.values());

  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail || null,
      pickup_date: pickupDate,
      pickup_time: pickupTime,
      customer_notes: customerNotes || null,
      internal_notes: internalNotes || null,
      updated_by: staff.id,
    })
    .eq("id", orderId)
    .is("customer_id", null);

  if (updateError) {
    return { error: updateError.message, success: false };
  }

  // Transactional replace of the full item set (delete + insert in one RPC).
  const { error: syncItemsError } = await supabase.rpc("sync_guest_order_items", {
    p_order_id: orderId,
    p_items: finalItems.map((item) => ({
      cake_id: item.cakeId,
      cake_size_id: item.cakeSizeId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      cake_name: item.cakeName,
      size_label: item.sizeLabel,
    })),
  });

  if (syncItemsError) {
    return { error: syncItemsError.message, success: false };
  }

  const { error: deleteCompError } = await supabase
    .from("order_complimentary_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteCompError) {
    return { error: deleteCompError.message, success: false };
  }

  const complimentaryToSave = draftComplimentary.filter(
    (item) => item.quantity > 0,
  );
  if (complimentaryToSave.length > 0) {
    const { error: insertCompError } = await supabase
      .from("order_complimentary_items")
      .insert(
        complimentaryToSave.map((item) => ({
          order_id: orderId,
          complimentary_item_type_id: item.typeId,
          name: item.name,
          quantity: item.quantity,
          sort_order: item.sortOrder,
        })),
      );
    if (insertCompError) {
      return { error: insertCompError.message, success: false };
    }
  }

  const materialChange = orderMateriallyAffectsConfirmation(before, {
    customerName: guestName,
    phone: guestPhone,
    pickupDate,
    pickupTime,
    items: finalItems,
    complimentaryItems: complimentaryToSave.map((item) => ({
      name: item.name,
      quantity: item.quantity,
    })),
  });

  const hadSentConfirmation = before.status === "pending_confirmation";

  if (materialChange) {
    await insertTimelineEvent({
      orderId,
      eventType: "order_updated",
      actorStaffId: staff.id,
    });
  }

  if (materialChange && hadSentConfirmation) {
    const { data: latestSent } = await supabase
      .from("order_confirmation_snapshots")
      .select("id")
      .eq("order_id", orderId)
      .eq("lifecycle_status", "sent")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSent?.id) {
      await supabase
        .from("order_confirmation_snapshots")
        .update({
          lifecycle_status: "outdated",
          outdated_at: new Date().toISOString(),
        })
        .eq("id", latestSent.id)
        .eq("lifecycle_status", "sent");

      await insertTimelineEvent({
        orderId,
        eventType: "confirmation_outdated",
        actorStaffId: staff.id,
        metadata: { snapshot_id: latestSent.id },
      });
    }

    await supabase
      .from("orders")
      .update({ confirmation_needs_resend: true })
      .eq("id", orderId);
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  revalidatePath(`/owner/orders/${orderId}/confirmation`);

  return { error: null, success: true };
}

export async function markConfirmationSentAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found." };
  }
  if (order.status !== "submitted" && order.status !== "pending_confirmation") {
    return { error: "This order cannot receive a confirmation send right now." };
  }

  const payload = buildConfirmationPayload({
    staffCustomerFacingName: staff.displayName,
    customerName: order.customerName,
    customerPhone: order.phone,
    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
    items: order.items.map((item) => ({
      cakeName: item.cakeName,
      sizeLabel: item.sizeLabel,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    complimentaryItems: order.complimentaryItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
    })),
    total: order.total,
  });
  const messageBody = generateConfirmationMessage(payload);
  const isUpdated = order.status === "pending_confirmation";

  const supabase = await createClient();

  // Outdate any still-sent snapshots before inserting the new version
  await supabase
    .from("order_confirmation_snapshots")
    .update({
      lifecycle_status: "outdated",
      outdated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("lifecycle_status", "sent");

  const { data: latest } = await supabase
    .from("order_confirmation_snapshots")
    .select("version")
    .eq("order_id", orderId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;
  const now = new Date().toISOString();

  const { error: snapError } = await supabase
    .from("order_confirmation_snapshots")
    .insert({
      order_id: orderId,
      version: nextVersion,
      lifecycle_status: "sent",
      message_body: messageBody,
      snapshot_payload: payload,
      prepared_by: staff.id,
      prepared_at: now,
      sent_by: staff.id,
      sent_at: now,
    });

  if (snapError) {
    return { error: snapError.message };
  }

  const { error: statusError } = await supabase
    .from("orders")
    .update({
      status: "pending_confirmation",
      confirmation_needs_resend: false,
      updated_by: staff.id,
    })
    .eq("id", orderId)
    .is("customer_id", null);

  if (statusError) {
    return { error: statusError.message };
  }

  await insertTimelineEvent({
    orderId,
    eventType: isUpdated
      ? "updated_confirmation_marked_sent"
      : "confirmation_marked_sent",
    actorStaffId: staff.id,
    metadata: { version: nextVersion },
  });

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  revalidatePath(`/owner/orders/${orderId}/confirmation`);
  return { error: null };
}

export async function recordConfirmationPreparedAction(
  orderId: string,
  isUpdated: boolean,
): Promise<void> {
  const staff = await requireOwner();
  await insertTimelineEvent({
    orderId,
    eventType: isUpdated
      ? "updated_confirmation_prepared"
      : "confirmation_prepared",
    actorStaffId: staff.id,
  });
  revalidatePath(`/owner/orders/${orderId}`);
}

export async function customerConfirmedAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found." };
  }
  if (order.status !== "pending_confirmation") {
    return { error: "Only orders waiting for customer confirmation can be marked confirmed." };
  }
  if (order.confirmationNeedsResend) {
    return {
      error: "Confirmation needs to be resent before marking customer confirmed.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "awaiting_payment",
      updated_by: staff.id,
    })
    .eq("id", orderId)
    .eq("status", "pending_confirmation")
    .is("customer_id", null);

  if (error) {
    return { error: error.message };
  }

  await insertTimelineEvent({
    orderId,
    eventType: "customer_confirmed",
    actorStaffId: staff.id,
  });

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  return { error: null };
}

export async function listGuestOrdersAction(): Promise<StorefrontOrderListItem[]> {
  await requireOwner();
  return listGuestOrders();
}

export async function getGuestOrderListItemAction(
  id: string,
): Promise<StorefrontOrderListItem | null> {
  await requireOwner();
  return getGuestOrderListItem(id);
}

/** @deprecated Milestone 1 Confirm Order — use markConfirmationSentAction */
export async function confirmGuestOrderAction(orderId: string): Promise<void> {
  const result = await markConfirmationSentAction(orderId);
  if (result.error) {
    throw new Error(result.error);
  }
  redirect("/owner");
}

// ---------------------------------------------------------------------------
// Milestone 3 Preview 1 — Payment
// ---------------------------------------------------------------------------

export type RecordPaymentState = {
  error: string | null;
  success: boolean;
};

export async function recordPaymentRequestPreparedAction(
  orderId: string,
): Promise<void> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order || order.status !== "awaiting_payment") return;

  await insertTimelineEvent({
    orderId,
    eventType: "payment_request_prepared",
    actorStaffId: staff.id,
  });
  revalidatePath(`/owner/orders/${orderId}`);
}

export async function markPaymentRequestSentAction(
  orderId: string,
  input: {
    method: "wb_qr" | "online_transfer";
    messageBody: string;
    deadlineAtIso: string;
  },
): Promise<{ error: string | null }> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found." };
  }
  if (order.status !== "awaiting_payment") {
    return { error: "Payment request can only be sent while awaiting payment." };
  }

  // Deadline belongs to the follow-up process, not the instruction method.
  // Re-sending alternative instructions (e.g. Online Transfer after WB QR)
  // must not reset an existing payment hold.
  const deadlineIso = order.paymentDeadlineAt ?? input.deadlineAtIso;
  const deadline = new Date(deadlineIso);
  if (Number.isNaN(deadline.getTime())) {
    return { error: "Invalid payment deadline." };
  }
  if (input.method !== "wb_qr" && input.method !== "online_transfer") {
    return { error: "Choose WB QR or Online Transfer." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_guest_payment_request_sent", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
    p_method: input.method,
    p_message_body: input.messageBody,
    p_deadline_at: deadline.toISOString(),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  revalidatePath(`/owner/orders/${orderId}/payment`);
  return { error: null };
}

export async function extendPaymentDeadlineAction(
  orderId: string,
  _prev: { error: string | null; success: boolean },
  formData: FormData,
): Promise<{ error: string | null; success: boolean }> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found.", success: false };
  }
  if (order.status !== "awaiting_payment") {
    return {
      error: "Deadline can only be updated while awaiting payment.",
      success: false,
    };
  }

  const raw = String(formData.get("deadline_at") ?? "").trim();
  const iso = fromDatetimeLocalValue(raw);
  if (!iso) {
    return { error: "Enter a valid follow-up deadline.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("extend_guest_payment_deadline", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
    p_deadline_at: iso,
  });

  if (error) {
    return { error: error.message, success: false };
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  return { error: null, success: true };
}

export async function recordAndVerifyPaymentAction(
  orderId: string,
  _prev: RecordPaymentState,
  formData: FormData,
): Promise<RecordPaymentState> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found.", success: false };
  }
  if (order.status !== "awaiting_payment") {
    return {
      error: "Payments can only be recorded while awaiting payment.",
      success: false,
    };
  }

  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount received.", success: false };
  }

  const method = String(formData.get("method") ?? "").trim();
  if (
    method !== "wb_qr" &&
    method !== "online_transfer" &&
    method !== "others"
  ) {
    return { error: "Choose a payment method.", success: false };
  }

  const methodDescription = String(
    formData.get("method_description") ?? "",
  ).trim();
  if (method === "others" && !methodDescription) {
    return {
      error: "Description is required when payment method is Others.",
      success: false,
    };
  }

  const paidAtRaw = String(formData.get("paid_at") ?? "").trim();
  const paidAtIso = fromDatetimeLocalValue(paidAtRaw);
  if (!paidAtIso) {
    return { error: "Enter a valid payment date/time.", success: false };
  }

  const referenceNote = String(formData.get("reference_note") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "record_and_verify_guest_order_payment",
    {
      p_order_id: orderId,
      p_amount: amount,
      p_method: method,
      p_method_description: method === "others" ? methodDescription : null,
      p_paid_at: paidAtIso,
      p_reference_note: referenceNote || null,
      p_verifier_staff_id: staff.id,
    },
  );

  if (error) {
    return { error: error.message, success: false };
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  return { error: null, success: true };
}

// ---------------------------------------------------------------------------
// Milestone 3 Preview 2 — Discounts & adjustments
// ---------------------------------------------------------------------------

export async function applyAugustPromoAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_august_promo_to_guest_order", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  revalidatePath(`/owner/orders/${orderId}/payment`);
  return { error: null };
}

export type RedeemRm10State = {
  error: string | null;
  success: boolean;
};

export async function redeemRm10VoucherAction(
  orderId: string,
  _prev: RedeemRm10State,
  formData: FormData,
): Promise<RedeemRm10State> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found.", success: false };
  }

  const voucherNumber = String(formData.get("voucher_number") ?? "").trim();
  const expiryDate = String(formData.get("expiry_date") ?? "").trim();
  const ownerOverride = String(formData.get("owner_override") ?? "") === "1";
  const overrideReason = String(formData.get("override_reason") ?? "").trim();

  if (!voucherNumber) {
    return { error: "Voucher number is required.", success: false };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
    return { error: "Enter a valid expiry date.", success: false };
  }
  if (ownerOverride && !overrideReason) {
    return {
      error: "Owner override requires a reason.",
      success: false,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "redeem_rm10_physical_voucher_for_guest_order",
    {
      p_order_id: orderId,
      p_actor_staff_id: staff.id,
      p_voucher_number: voucherNumber,
      p_expiry_date: expiryDate,
      p_owner_override: ownerOverride,
      p_override_reason: ownerOverride ? overrideReason : null,
    },
  );

  if (error) {
    return { error: error.message, success: false };
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  revalidatePath(`/owner/orders/${orderId}/payment`);
  return { error: null, success: true };
}

export async function removeOrderDiscountAction(
  orderId: string,
  adjustmentId: string,
): Promise<{ error: string | null }> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "reverse_active_guest_order_adjustment",
    {
      p_order_id: orderId,
      p_actor_staff_id: staff.id,
      p_adjustment_id: adjustmentId,
    },
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  revalidatePath(`/owner/orders/${orderId}/payment`);
  return { error: null };
}

export async function changeAugustPromoToRm10Action(
  orderId: string,
  _prev: RedeemRm10State,
  formData: FormData,
): Promise<RedeemRm10State> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found.", success: false };
  }

  const voucherNumber = String(formData.get("voucher_number") ?? "").trim();
  const expiryDate = String(formData.get("expiry_date") ?? "").trim();
  const ownerOverride = String(formData.get("owner_override") ?? "") === "1";
  const overrideReason = String(formData.get("override_reason") ?? "").trim();

  if (!voucherNumber) {
    return { error: "Voucher number is required.", success: false };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
    return { error: "Enter a valid expiry date.", success: false };
  }
  if (ownerOverride && !overrideReason) {
    return {
      error: "Owner override requires a reason.",
      success: false,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "change_august_promo_to_rm10_physical_voucher",
    {
      p_order_id: orderId,
      p_actor_staff_id: staff.id,
      p_voucher_number: voucherNumber,
      p_expiry_date: expiryDate,
      p_owner_override: ownerOverride,
      p_override_reason: ownerOverride ? overrideReason : null,
    },
  );

  if (error) {
    return { error: error.message, success: false };
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  revalidatePath(`/owner/orders/${orderId}/payment`);
  return { error: null, success: true };
}
