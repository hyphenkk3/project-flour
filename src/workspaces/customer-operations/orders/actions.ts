"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canCreateStaffAssistedOrder } from "@/engines/orders/delivery-finance-capabilities";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import { addBusinessCalendarDays } from "@/lib/dates";
import { scheduleStaffNotificationDispatch } from "@/foundation/staff/schedule-staff-notification-dispatch";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import { parseCustomerWebsiteFulfilmentMethod } from "@/engines/orders/fulfilment";
import type {
  FulfilmentMethod,
  OrderInput,
  OrderStatus,
  PaymentStatus,
} from "@/types/order";
import { getCustomerById } from "@/workspaces/customer-operations/customers/queries";
import { guestSnapshotFromCrmCustomer } from "@/workspaces/customer-operations/orders/guest-snapshot";
import {
  FULFILMENT_METHODS,
  normalizePickupTime,
} from "@/workspaces/customer-operations/orders/status";
import { createStaffGuestPreorderRecord } from "@/workspaces/owner/orders/create-staff-preorder";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";
import { isStaffGuestOrderSource } from "@/workspaces/owner/orders/labels";
import {
  parseDeliveryDraftFromForm,
  parseDineInDraftFromForm,
  parseStaffPreorderItemsFromForm,
} from "@/workspaces/owner/orders/staff-preorder-form";
import { listClosedPickupOrderDates } from "@/workspaces/storefront/checkout/order-availability";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";

export type OrderActionState = {
  error: string | null;
};

const emptyState: OrderActionState = { error: null };
const CO_ORDERS_RETURN = "/customer-operations/orders";

async function requireCustomerOperationsStaff() {
  const staff = await requireStaff();

  if (!canAccessWorkspace(staff.role.code, "customer_operations")) {
    redirect("/home");
  }

  return staff;
}

async function requireAssistedOrderCreator() {
  const staff = await requireStaff();
  if (
    !canCreateStaffAssistedOrder(staff.role.code) ||
    !canAccessWorkspace(staff.role.code, "customer_operations")
  ) {
    redirect("/home");
  }
  return staff;
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function parseFulfilmentMethod(
  value: FormDataEntryValue | null,
): FulfilmentMethod | null {
  const text = String(value ?? "").trim();
  if (FULFILMENT_METHODS.includes(text as FulfilmentMethod)) {
    return text as FulfilmentMethod;
  }
  return null;
}

function parseOrderInput(formData: FormData): OrderInput | string {
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const fulfilmentMethod = parseFulfilmentMethod(
    formData.get("fulfilment_method"),
  );
  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  const pickupTimeRaw = String(formData.get("pickup_time") ?? "").trim();
  const pickupTime = normalizePickupTime(pickupTimeRaw);

  if (!customerId) {
    return "Select a customer.";
  }
  if (!fulfilmentMethod) {
    return "Select a fulfilment method.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
    return "Pickup date is required.";
  }
  if (!pickupTime) {
    return "Pickup time is required.";
  }

  return {
    customerId,
    fulfilmentMethod,
    pickupDate,
    pickupTime,
    internalNotes: emptyToNull(formData.get("internal_notes")),
    customerNotes: emptyToNull(formData.get("customer_notes")),
  };
}

function revalidateOrderPaths(orderId?: string) {
  revalidatePath("/customer-operations/orders");
  if (orderId) {
    revalidatePath(`/customer-operations/orders/${orderId}`);
    revalidatePath(`/customer-operations/orders/${orderId}/edit`);
  }
}

type OrderSnapshot = {
  id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
};

async function loadOrderSnapshot(
  orderId: string,
): Promise<OrderSnapshot | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as OrderSnapshot;
}

async function applyOrderUpdate(
  orderId: string,
  fields: {
    status?: OrderStatus;
    payment_status?: PaymentStatus;
  },
): Promise<OrderActionState> {
  const staff = await requireCustomerOperationsStaff();
  const supabase = await createClient();

  const { error } = await supabase
    .from("orders")
    .update({
      ...fields,
      updated_by: staff.id,
    })
    .eq("id", orderId);

  if (error) {
    return { error: "Unable to update order." };
  }

  scheduleStaffNotificationDispatch();
  revalidateOrderPaths(orderId);
  return emptyState;
}

export async function createOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const staff = await requireAssistedOrderCreator();
  const customerId = String(formData.get("customer_id") ?? "").trim();
  if (!customerId) {
    return { error: "Select a customer." };
  }

  const customer = await getCustomerById(customerId);
  if (!customer) {
    return { error: "Select a customer." };
  }

  const snapshot = guestSnapshotFromCrmCustomer(customer);
  if (!snapshot.guestName) {
    return { error: "Select a customer." };
  }

  const orderSource = String(formData.get("order_source") ?? "").trim();
  if (!isStaffGuestOrderSource(orderSource)) {
    return { error: "Please choose a valid order source." };
  }

  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  const pickupTime = String(formData.get("pickup_time") ?? "").trim();
  const items = parseStaffPreorderItemsFromForm(formData);
  const fulfilmentMethod = parseCustomerWebsiteFulfilmentMethod(
    String(formData.get("fulfilment_method") ?? ""),
  );
  const deliveryDraft = parseDeliveryDraftFromForm(formData);
  const dineInDraft = parseDineInDraftFromForm(formData);
  const hoursSnapshot = await loadOperatingHoursSnapshot();
  const earliest = earliestPickupDateYmd();
  const rangeMax = addBusinessCalendarDays(earliest, 120) ?? earliest;
  const closedDates = await listClosedPickupOrderDates(earliest, rangeMax);

  const created = await createStaffGuestPreorderRecord({
    actorStaffId: staff.id,
    guestName: snapshot.guestName,
    guestPhone: snapshot.guestPhone,
    guestEmail: null,
    orderSource,
    pickupDate,
    pickupTime,
    items,
    complimentary: [],
    paidAddons: [],
    includeReceipt: false,
    needsBakeryAttention: false,
    bakeryAttentionNote: null,
    customerNotes: emptyToNull(formData.get("customer_notes")),
    internalNotes: emptyToNull(formData.get("internal_notes")),
    fulfilmentMethod,
    delivery: deliveryDraft,
    dineIn: dineInDraft,
    slotPolicy: "customer-slots",
    closedDates,
    hoursSnapshot,
  });

  if ("error" in created) {
    return { error: created.error };
  }

  scheduleStaffNotificationDispatch();
  revalidatePath("/customer-operations/orders");
  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${created.orderId}`);
  redirect(ownerOrderWorkspaceHref(created.orderId, CO_ORDERS_RETURN));
}

export async function updateOrderAction(
  orderId: string,
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const staff = await requireCustomerOperationsStaff();
  const parsed = parseOrderInput(formData);

  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const existing = await loadOrderSnapshot(orderId);

  if (!existing) {
    return { error: "Order not found." };
  }

  if (existing.status === "cancelled" || existing.status === "completed") {
    return { error: "This order can no longer be edited." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({
      customer_id: parsed.customerId,
      fulfilment_method: parsed.fulfilmentMethod,
      pickup_date: parsed.pickupDate,
      pickup_time: parsed.pickupTime,
      internal_notes: parsed.internalNotes,
      customer_notes: parsed.customerNotes,
      updated_by: staff.id,
    })
    .eq("id", orderId);

  if (error) {
    return { error: "Unable to update order." };
  }

  revalidateOrderPaths(orderId);
  redirect(`/customer-operations/orders/${orderId}`);
}

export async function markOrderPendingConfirmationAction(
  orderId: string,
): Promise<OrderActionState> {
  const existing = await loadOrderSnapshot(orderId);

  if (!existing) {
    return { error: "Order not found." };
  }

  if (existing.status !== "submitted") {
    return {
      error: "Only submitted orders can move to pending confirmation.",
    };
  }

  return applyOrderUpdate(orderId, { status: "pending_confirmation" });
}

export async function confirmOrderAction(
  orderId: string,
): Promise<OrderActionState> {
  const existing = await loadOrderSnapshot(orderId);

  if (!existing) {
    return { error: "Order not found." };
  }

  if (
    existing.status !== "submitted" &&
    existing.status !== "pending_confirmation"
  ) {
    return {
      error: "Only submitted or pending orders can be confirmed.",
    };
  }

  return applyOrderUpdate(orderId, { status: "confirmed" });
}

export async function markOrderAwaitingPaymentAction(
  orderId: string,
): Promise<OrderActionState> {
  const existing = await loadOrderSnapshot(orderId);

  if (!existing) {
    return { error: "Order not found." };
  }

  if (existing.status !== "confirmed") {
    return {
      error: "Only confirmed orders can move to awaiting payment.",
    };
  }

  return applyOrderUpdate(orderId, { status: "awaiting_payment" });
}

export async function recordOrderPaidAction(
  orderId: string,
): Promise<OrderActionState> {
  const existing = await loadOrderSnapshot(orderId);

  if (!existing) {
    return { error: "Order not found." };
  }

  if (existing.status === "cancelled" || existing.status === "completed") {
    return { error: "This order can no longer be updated." };
  }

  if (existing.payment_status === "paid") {
    return { error: "Payment is already recorded as paid." };
  }

  if (
    existing.status !== "confirmed" &&
    existing.status !== "awaiting_payment"
  ) {
    return {
      error: "Confirm the order before recording payment.",
    };
  }

  return applyOrderUpdate(orderId, {
    payment_status: "paid",
    status: "paid",
  });
}

export async function cancelOrderAction(
  orderId: string,
): Promise<OrderActionState> {
  const existing = await loadOrderSnapshot(orderId);

  if (!existing) {
    return { error: "Order not found." };
  }

  if (existing.status === "cancelled") {
    return { error: "Order is already cancelled." };
  }

  if (existing.status === "completed") {
    return { error: "Completed orders cannot be cancelled." };
  }

  return applyOrderUpdate(orderId, { status: "cancelled" });
}
