"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type {
  FulfilmentMethod,
  OrderInput,
  OrderStatus,
  PaymentStatus,
} from "@/types/order";
import { allocateOrderNumber } from "@/workspaces/customer-operations/orders/queries";
import {
  FULFILMENT_METHODS,
  normalizePickupTime,
} from "@/workspaces/customer-operations/orders/status";

export type OrderActionState = {
  error: string | null;
};

const emptyState: OrderActionState = { error: null };

async function requireCustomerOperationsStaff() {
  const staff = await requireStaff();

  if (!canAccessWorkspace(staff.role.code, "customer_operations")) {
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

  revalidateOrderPaths(orderId);
  return emptyState;
}

export async function createOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const staff = await requireCustomerOperationsStaff();
  const parsed = parseOrderInput(formData);

  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const orderNumber = await allocateOrderNumber();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      customer_id: parsed.customerId,
      fulfilment_method: parsed.fulfilmentMethod,
      pickup_date: parsed.pickupDate,
      pickup_time: parsed.pickupTime,
      status: "submitted" satisfies OrderStatus,
      payment_status: "unpaid" satisfies PaymentStatus,
      internal_notes: parsed.internalNotes,
      customer_notes: parsed.customerNotes,
      created_by: staff.id,
      updated_by: staff.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Unable to create order." };
  }

  revalidateOrderPaths(data.id);
  redirect(`/customer-operations/orders/${data.id}`);
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
