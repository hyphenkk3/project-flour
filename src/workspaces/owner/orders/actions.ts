"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildConfirmationPayloadFromOrder,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import {
  canAccessCustomerConfirmation,
  financialMateriallyAffectsConfirmation,
  nextStatusAfterConfirmationMarkedSent,
  orderMateriallyAffectsConfirmation,
  orderStatusAllowsConfirmationInvalidation,
  shouldOfferUpdatedConfirmationAction,
  shouldOutdateSentConfirmation,
} from "@/engines/orders/confirmation-validity";
import {
  paidAddonsMateriallyDiffer,
  paidAddonsTimelineSummary,
  type PaidAddonMutationPayload,
} from "@/engines/orders/paid-addons";
import {
  buildCreateStaffFulfilmentRpcParams,
  defaultDeliveryCreateDraft,
  fulfilmentMateriallyDiffer,
  fulfilmentTimelineSummary,
  normalizeOwnerCreateFulfilmentMethod,
  validateOwnerCreateFulfilment,
  type DeliveryCreateDraft,
} from "@/engines/orders/fulfilment";
import { reconcilePaymentLifecycleStatus } from "@/engines/orders/payment-status";
import { isValidClockPickupTime, isValidPickupSlot } from "@/engines/business-calendar/pickup-slots";
import { requireStaff } from "@/foundation/auth/session";
import {
  formatBusinessMonthYear,
  isDifferentBusinessMonth,
} from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type {
  StorefrontOrder,
  StorefrontOrderListItem,
} from "@/types/storefront";
import {
  fromDatetimeLocalValue,
  guestOrderRequiresPhone,
  isGuestOrderEditable,
  isStaffGuestOrderSource,
} from "@/workspaces/owner/orders/labels";
import {
  getGuestOrderById,
  getGuestOrderListItem,
  listGuestOrders,
} from "@/workspaces/owner/orders/queries";
import {
  getAvailableCakeById,
  listOfferableLibraryCakes,
} from "@/workspaces/storefront/catalog/queries";

export type OrderWorkspaceSaveState = {
  error: string | null;
  success: boolean;
};

export type CreateStaffGuestOrderState = {
  error: string | null;
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

/**
 * After amendment/discount mutation: Paid ↔ Awaiting Payment from settlement.
 * Does not touch payment rows.
 */
async function reconcileOrderStatusAfterFinancialChange(input: {
  orderId: string;
  before: StorefrontOrder;
  staffId: string;
}): Promise<{ error: string | null }> {
  const after = await getGuestOrderById(input.orderId);
  if (!after) {
    return { error: "Order not found after update." };
  }

  const reconciled = reconcilePaymentLifecycleStatus({
    previousStatus: input.before.status,
    previousNetReceived: input.before.settlement.netReceived,
    settlement: after.settlement,
  });

  if (reconciled.statusChanged) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update({
        status: reconciled.newStatus,
        payment_status: reconciled.newStatus === "paid" ? "paid" : "unpaid",
        updated_by: input.staffId,
      })
      .eq("id", input.orderId)
      .is("customer_id", null);
    if (error) {
      return { error: error.message };
    }
  }

  return { error: null };
}

/**
 * When amount due changes after Mark as Sent, outdate the sent confirmation
 * and require resend — same pattern as material order edits.
 */
async function markPendingConfirmationStaleIfAmountChanged(input: {
  orderId: string;
  before: StorefrontOrder;
  staffId: string;
}): Promise<{ error: string | null }> {
  if (!orderStatusAllowsConfirmationInvalidation(input.before.status)) {
    return { error: null };
  }

  const after = await getGuestOrderById(input.orderId);
  if (!after) {
    return { error: "Order not found after update." };
  }

  if (
    !financialMateriallyAffectsConfirmation(
      input.before.settlement.amountDue,
      after.settlement.amountDue,
    )
  ) {
    return { error: null };
  }

  const supabase = await createClient();
  const { data: latestSent } = await supabase
    .from("order_confirmation_snapshots")
    .select("id")
    .eq("order_id", input.orderId)
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
      orderId: input.orderId,
      eventType: "confirmation_outdated",
      actorStaffId: input.staffId,
      metadata: {
        reason: "financial_adjustment",
        previous_amount_due: input.before.settlement.amountDue,
        new_amount_due: after.settlement.amountDue,
      },
    });
  }

  await supabase
    .from("orders")
    .update({ confirmation_needs_resend: true })
    .eq("id", input.orderId)
    .is("customer_id", null);

  revalidatePath(`/owner/orders/${input.orderId}/confirmation`);
  return { error: null };
}

async function afterDiscountMutation(input: {
  orderId: string;
  before: StorefrontOrder;
  staffId: string;
}): Promise<{ error: string | null }> {
  const reconcile = await reconcileOrderStatusAfterFinancialChange(input);
  if (reconcile.error) return reconcile;
  return markPendingConfirmationStaleIfAmountChanged(input);
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

/** Mutation-only paid-add-on payload (code / qty / per-card messages). */
function parsePaidAddonsMutationFromForm(
  formData: FormData,
): PaidAddonMutationPayload[] {
  const raw = String(formData.get("paid_addons_json") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      code?: string;
      quantity?: number;
      messages?: Array<string | null>;
      written_message?: string | null;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
        let messages: Array<string | null>;
        if (Array.isArray(item.messages)) {
          messages = item.messages
            .slice(0, quantity)
            .map((m) =>
              m == null ? null : String(m).trim() || null,
            );
          while (messages.length < quantity) messages.push(null);
        } else if (item.written_message != null) {
          messages = Array.from({ length: quantity }, (_, i) =>
            i === 0 ? String(item.written_message).trim() || null : null,
          );
        } else {
          messages = Array.from({ length: quantity }, () => null);
        }
        return {
          code: String(item.code ?? "").trim(),
          quantity,
          messages,
        };
      })
      .filter((item) => item.code.length > 0 && item.quantity >= 1);
  } catch {
    return [];
  }
}

function parseDeliveryDraftFromForm(formData: FormData): DeliveryCreateDraft {
  const raw = String(formData.get("delivery_json") ?? "").trim();
  if (!raw) return defaultDeliveryCreateDraft();
  try {
    const parsed = JSON.parse(raw) as Partial<DeliveryCreateDraft>;
    return {
      recipientName: String(parsed.recipientName ?? ""),
      recipientPhone: String(parsed.recipientPhone ?? ""),
      addressLine1: String(parsed.addressLine1 ?? ""),
      addressLine2: String(parsed.addressLine2 ?? ""),
      postcode: String(parsed.postcode ?? ""),
      city: String(parsed.city ?? ""),
      state: String(parsed.state ?? ""),
      recipientNotifyPreference:
        parsed.recipientNotifyPreference === "inform_recipient" ||
        parsed.recipientNotifyPreference === "do_not_inform_recipient"
          ? parsed.recipientNotifyPreference
          : null,
      sameAsCustomer: Boolean(parsed.sameAsCustomer),
    };
  } catch {
    return defaultDeliveryCreateDraft();
  }
}

export async function createStaffGuestOrderAction(
  _prev: CreateStaffGuestOrderState,
  formData: FormData,
): Promise<CreateStaffGuestOrderState> {
  const staff = await requireOwner();

  const guestName = String(formData.get("guest_name") ?? "").trim();
  const guestPhone = String(formData.get("guest_phone") ?? "").trim();
  const guestEmail = String(formData.get("guest_email") ?? "").trim();
  const orderSource = String(formData.get("order_source") ?? "").trim();
  const crewOrder = String(formData.get("crew_order") ?? "") === "1";
  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  const pickupTime = String(formData.get("pickup_time") ?? "").trim();
  const includeReceipt = String(formData.get("include_receipt") ?? "") === "1";
  const needsAttention =
    String(formData.get("needs_bakery_attention") ?? "") === "1";
  const attentionNote = String(
    formData.get("bakery_attention_note") ?? "",
  ).trim();
  const customerNotes = String(formData.get("customer_notes") ?? "").trim();
  const internalNotes = String(formData.get("internal_notes") ?? "").trim();
  const draftItems = parseItemsFromForm(formData);
  const draftComplimentary = parseComplimentaryFromForm(formData);
  const draftPaidAddons = parsePaidAddonsMutationFromForm(formData);
  const fulfilmentMethod = normalizeOwnerCreateFulfilmentMethod(
    String(formData.get("fulfilment_method") ?? ""),
  );
  const deliveryDraft = parseDeliveryDraftFromForm(formData);

  if (!guestName) {
    return { error: "Please enter the customer name." };
  }
  if (!isStaffGuestOrderSource(orderSource)) {
    return { error: "Please choose a valid order source." };
  }
  if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return {
      error: "Please enter a valid email address, or leave email blank.",
    };
  }

  const fulfilmentError = validateOwnerCreateFulfilment({
    method: fulfilmentMethod,
    pickupDate,
    pickupTime,
    delivery: deliveryDraft,
  });
  if (fulfilmentError) {
    return { error: fulfilmentError };
  }
  if (!isValidClockPickupTime(pickupTime)) {
    return {
      error:
        fulfilmentMethod === "delivery"
          ? "Please enter a valid delivery clock time."
          : "Please enter a valid pickup clock time.",
    };
  }
  if (draftItems.length === 0) {
    return { error: "Please add at least one cake." };
  }

  const cakes = await listOfferableLibraryCakes();

  for (const draft of draftItems) {
    const cake = cakes.find((entry) => entry.id === draft.cakeId);
    if (!cake) {
      return {
        error: "One of the cakes is not available in the Library.",
      };
    }
    const size = cake.sizes.find((entry) => entry.id === draft.cakeSizeId);
    if (!size) {
      return {
        error: `Please choose a valid size for ${cake.name}.`,
      };
    }
  }

  const fulfilmentRpc = buildCreateStaffFulfilmentRpcParams({
    method: fulfilmentMethod,
    delivery: deliveryDraft,
  });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_staff_guest_preorder", {
    p_actor_staff_id: staff.id,
    p_customer_name: guestName,
    p_phone: guestPhone || null,
    p_email: guestEmail || null,
    p_order_source: orderSource,
    p_crew_order: crewOrder,
    p_pickup_date: pickupDate,
    p_pickup_time: pickupTime,
    /** Free-text pickup instruction retired from Owner UI — new orders leave null. */
    p_pickup_instruction: null,
    p_items: draftItems.map((item) => ({
      cake_id: item.cakeId,
      cake_size_id: item.cakeSizeId,
      quantity: item.quantity,
    })),
    p_complimentary: draftComplimentary
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        type_id: item.typeId,
        name: item.name,
        quantity: item.quantity,
        sort_order: item.sortOrder,
      })),
    p_paid_addons: draftPaidAddons,
    p_include_receipt: includeReceipt,
    p_needs_bakery_attention: needsAttention,
    p_bakery_attention_note: needsAttention ? attentionNote || null : null,
    p_customer_notes: customerNotes || null,
    p_internal_notes: internalNotes || null,
    p_fulfilment_method: fulfilmentRpc.p_fulfilment_method,
    p_delivery: fulfilmentRpc.p_delivery,
  });

  if (error) {
    return { error: error.message };
  }

  const orderId =
    data && typeof data === "object" && "id" in data
      ? String((data as { id: string }).id)
      : null;
  if (!orderId) {
    return { error: "Order was created but could not be opened." };
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  redirect(`/owner/orders/${orderId}`);
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
  const requestedSource = String(formData.get("order_source") ?? "").trim();
  const crewOrder = String(formData.get("crew_order") ?? "") === "1";
  const includeReceipt = String(formData.get("include_receipt") ?? "") === "1";
  const needsAttention =
    String(formData.get("needs_bakery_attention") ?? "") === "1";
  const attentionNote = String(
    formData.get("bakery_attention_note") ?? "",
  ).trim();
  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  const pickupTime = String(formData.get("pickup_time") ?? "").trim();
  const customerNotes = String(formData.get("customer_notes") ?? "").trim();
  const internalNotes = String(formData.get("internal_notes") ?? "").trim();
  const draftItems = parseItemsFromForm(formData);
  const draftComplimentary = parseComplimentaryFromForm(formData);
  const draftPaidAddons = parsePaidAddonsMutationFromForm(formData);
  const fulfilmentMethod = normalizeOwnerCreateFulfilmentMethod(
    String(formData.get("fulfilment_method") ?? ""),
  );
  const deliveryDraft = parseDeliveryDraftFromForm(formData);

  const before = await getGuestOrderById(orderId);
  if (!before) {
    return { error: "Order not found.", success: false };
  }
  if (!isGuestOrderEditable(before.status)) {
    return {
      error: "This order can no longer be edited.",
      success: false,
    };
  }

  let nextSource = before.orderSource;
  if (before.orderSource === "customer_website") {
    // Website-origin source stays locked — never convert to a manual channel.
    nextSource = "customer_website";
  } else {
    if (!requestedSource) {
      return { error: "Please choose an order source.", success: false };
    }
    if (requestedSource === "customer_website") {
      return {
        error: "Cannot convert a staff-created order to customer website.",
        success: false,
      };
    }
    if (
      !isStaffGuestOrderSource(requestedSource) &&
      requestedSource !== "walk_in" &&
      requestedSource !== "last_minute"
    ) {
      return { error: "Please choose a valid order source.", success: false };
    }
    nextSource = requestedSource as typeof before.orderSource;
  }

  const phoneRequired = guestOrderRequiresPhone(nextSource);
  if (!guestName || (phoneRequired && !guestPhone)) {
    return {
      error: phoneRequired
        ? "Please fill in the customer name and WhatsApp phone."
        : "Please fill in the customer name.",
      success: false,
    };
  }
  if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return {
      error: "Please enter a valid email address, or leave email blank.",
      success: false,
    };
  }

  const fulfilmentError = validateOwnerCreateFulfilment({
    method: fulfilmentMethod,
    pickupDate,
    pickupTime,
    delivery: deliveryDraft,
  });
  if (fulfilmentError) {
    return { error: fulfilmentError, success: false };
  }

  // Normal amendment: pickup month stays put. Cross-month requires explicit Owner override.
  const pickupMonthOverride =
    String(formData.get("pickup_month_override") ?? "") === "1";
  if (isDifferentBusinessMonth(before.pickupDate, pickupDate)) {
    if (!pickupMonthOverride) {
      return {
        error: `Pickup date must stay within ${formatBusinessMonthYear(before.pickupDate)}. Enable Owner override to change the pickup month.`,
        success: false,
      };
    }
    // requireOwner() already gated this action; override checkbox is the explicit intent.
  }

  if (nextSource === "customer_website") {
    if (!isValidPickupSlot(pickupDate, pickupTime)) {
      return {
        error:
          fulfilmentMethod === "delivery"
            ? "Please choose a valid delivery time for that date."
            : "Please choose a valid pickup time for that date.",
        success: false,
      };
    }
  } else if (!isValidClockPickupTime(pickupTime)) {
    return {
      error:
        fulfilmentMethod === "delivery"
          ? "Please enter a valid delivery clock time."
          : "Please enter a valid pickup clock time.",
      success: false,
    };
  }
  if (draftItems.length === 0) {
    return { error: "Please keep at least one cake on the order.", success: false };
  }

  let fulfilmentRpc: ReturnType<typeof buildCreateStaffFulfilmentRpcParams>;
  try {
    fulfilmentRpc = buildCreateStaffFulfilmentRpcParams({
      method: fulfilmentMethod,
      delivery: deliveryDraft,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Please complete Delivery details before saving.",
      success: false,
    };
  }

  const cakes = await listOfferableLibraryCakes();

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
        error: "One of the cakes is not available in the Library.",
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
      guest_phone: guestPhone || null,
      guest_email: guestEmail || null,
      order_source: nextSource,
      crew_order: crewOrder,
      include_receipt: includeReceipt,
      needs_bakery_attention: needsAttention,
      bakery_attention_note: needsAttention ? attentionNote || null : null,
      pickup_date: pickupDate,
      pickup_time: pickupTime,
      /** Preserve historical free-text; Owner UI no longer edits this field. */
      pickup_instruction: before.pickupInstruction,
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

  // Full-membership sync — server retains snapshots for kept codes.
  const { error: syncPaidAddonsError } = await supabase.rpc(
    "sync_guest_order_paid_addons",
    {
      p_order_id: orderId,
      p_paid_addons: draftPaidAddons,
    },
  );

  if (syncPaidAddonsError) {
    return { error: syncPaidAddonsError.message, success: false };
  }

  // Atomic method + delivery-details sync (Pickup clears sibling row).
  const { error: syncFulfilmentError } = await supabase.rpc(
    "sync_guest_order_fulfilment",
    {
      p_order_id: orderId,
      p_fulfilment_method: fulfilmentRpc.p_fulfilment_method,
      p_delivery: fulfilmentRpc.p_delivery,
    },
  );

  if (syncFulfilmentError) {
    return { error: syncFulfilmentError.message, success: false };
  }

  const afterPaidAddons = await getGuestOrderById(orderId);
  if (!afterPaidAddons) {
    return { error: "Order not found after fulfilment sync.", success: false };
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
    paidAddons: afterPaidAddons.paidAddons,
    fulfilmentMethod: afterPaidAddons.fulfilmentMethod,
    delivery: afterPaidAddons.delivery,
  });

  const paidAddonsChanged = paidAddonsMateriallyDiffer(
    before.paidAddons ?? [],
    afterPaidAddons.paidAddons ?? [],
  );

  const fulfilmentChanged = fulfilmentMateriallyDiffer(
    {
      method: before.fulfilmentMethod,
      pickupDate: before.pickupDate,
      pickupTime: before.pickupTime,
      delivery: before.delivery,
    },
    {
      method: afterPaidAddons.fulfilmentMethod,
      pickupDate: afterPaidAddons.pickupDate,
      pickupTime: afterPaidAddons.pickupTime,
      delivery: afterPaidAddons.delivery,
    },
  );

  const shouldInvalidateConfirmation = shouldOutdateSentConfirmation({
    materialChange,
    orderStatus: before.status,
  });
  const previousAmountDue = before.settlement.amountDue;
  const previousStatus = before.status;

  const reconcile = await reconcileOrderStatusAfterFinancialChange({
    orderId,
    before,
    staffId: staff.id,
  });
  if (reconcile.error) {
    return { error: reconcile.error, success: false };
  }

  const after = await getGuestOrderById(orderId);
  if (!after) {
    return { error: "Order not found after save.", success: false };
  }

  const newAmountDue = after.settlement.amountDue;
  const netReceived = after.settlement.netReceived;
  const newStatus = after.status;

  const shouldAuditUpdate =
    materialChange ||
    paidAddonsChanged ||
    fulfilmentChanged ||
    previousStatus === "awaiting_payment" ||
    previousStatus === "paid" ||
    newStatus !== previousStatus ||
    previousAmountDue !== newAmountDue;

  if (shouldAuditUpdate) {
    const metadata: Record<string, unknown> = {
      previous_amount_due: previousAmountDue,
      new_amount_due: newAmountDue,
      net_received: netReceived,
      previous_status: previousStatus,
      new_status: newStatus,
      remaining_balance: after.settlement.remainingBalance,
      overpayment: after.settlement.overpayment,
    };
    if (
      previousStatus === "awaiting_payment" ||
      previousStatus === "paid" ||
      newStatus !== previousStatus
    ) {
      metadata.amended_during_payment_lifecycle = true;
    }
    if (paidAddonsChanged) {
      metadata.paid_addons_before = paidAddonsTimelineSummary(
        before.paidAddons ?? [],
      );
      metadata.paid_addons_after = paidAddonsTimelineSummary(
        after.paidAddons ?? [],
      );
    }
    if (fulfilmentChanged) {
      metadata.fulfilment_before = fulfilmentTimelineSummary({
        method: before.fulfilmentMethod,
        pickupDate: before.pickupDate,
        pickupTime: before.pickupTime,
        delivery: before.delivery,
      });
      metadata.fulfilment_after = fulfilmentTimelineSummary({
        method: after.fulfilmentMethod,
        pickupDate: after.pickupDate,
        pickupTime: after.pickupTime,
        delivery: after.delivery,
      });
    }

    await insertTimelineEvent({
      orderId,
      eventType: "order_updated",
      actorStaffId: staff.id,
      metadata,
    });
  }

  if (shouldInvalidateConfirmation) {
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
  revalidatePath(`/owner/orders/${orderId}/payment`);

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
  if (
    !canAccessCustomerConfirmation({
      status: order.status,
      confirmationNeedsResend: order.confirmationNeedsResend,
    })
  ) {
    return { error: "This order cannot receive a confirmation send right now." };
  }

  const payload = buildConfirmationPayloadFromOrder({
    order,
    staffCustomerFacingName: staff.displayName,
  });
  const messageBody = generateConfirmationMessage(payload);
  const isUpdated = shouldOfferUpdatedConfirmationAction({
    status: order.status,
    confirmationNeedsResend: order.confirmationNeedsResend,
  }) || order.status === "pending_confirmation";
  const nextStatus = nextStatusAfterConfirmationMarkedSent(order.status);

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
      status: nextStatus,
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
  if (order.settlement.remainingBalance <= 0) {
    return {
      error: "No outstanding balance — a Payment Request is not needed.",
    };
  }

  // Deadline belongs to the follow-up process, not the instruction method.
  // Re-sending alternative instructions (e.g. Online Transfer after WB QR)
  // must not reset an existing payment hold — unless this is a new outstanding
  // balance request after prior verified payment (e.g. Paid amended upward).
  const isOutstandingBalanceFollowUp =
    order.settlement.netReceived > 0 && order.settlement.remainingBalance > 0;
  const deadlineIso = isOutstandingBalanceFollowUp
    ? input.deadlineAtIso
    : (order.paymentDeadlineAt ?? input.deadlineAtIso);
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

  const reconcile = await afterDiscountMutation({
    orderId,
    before: order,
    staffId: staff.id,
  });
  if (reconcile.error) {
    return { error: reconcile.error };
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

  const reconcile = await afterDiscountMutation({
    orderId,
    before: order,
    staffId: staff.id,
  });
  if (reconcile.error) {
    return { error: reconcile.error, success: false };
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

  const reconcile = await afterDiscountMutation({
    orderId,
    before: order,
    staffId: staff.id,
  });
  if (reconcile.error) {
    return { error: reconcile.error };
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

  const reconcile = await afterDiscountMutation({
    orderId,
    before: order,
    staffId: staff.id,
  });
  if (reconcile.error) {
    return { error: reconcile.error, success: false };
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  revalidatePath(`/owner/orders/${orderId}/payment`);
  return { error: null, success: true };
}

// ---------------------------------------------------------------------------
// Milestone 3 Preview 3A-5 — Ready / Picked Up (Owner operational UI)
// Narrow RPCs only. Does not mutate items, adjustments, payments, or financial status.
// ---------------------------------------------------------------------------

export async function markOrderReadyAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_guest_order_ready", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath("/owner/calendar");
  revalidatePath(`/owner/orders/${orderId}`);
  return { error: null };
}

export async function undoOrderReadyAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_guest_order_ready", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath("/owner/calendar");
  revalidatePath(`/owner/orders/${orderId}`);
  return { error: null };
}

export async function markOrderPickedUpAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_guest_order_picked_up", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath("/owner/calendar");
  revalidatePath(`/owner/orders/${orderId}`);
  return { error: null };
}

export async function undoOrderPickedUpAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireOwner();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_guest_order_picked_up", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath("/owner/calendar");
  revalidatePath(`/owner/orders/${orderId}`);
  return { error: null };
}
