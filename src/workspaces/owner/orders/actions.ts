"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidPickupSlot } from "@/engines/business-calendar/pickup-slots";
import { requireStaff } from "@/foundation/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { StorefrontOrderListItem } from "@/types/storefront";
import {
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

export async function confirmGuestOrderAction(orderId: string): Promise<void> {
  await requireOwner();
  const supabase = await createClient();

  const { data, error: loadError } = await supabase
    .from("orders")
    .select("id, status, customer_id")
    .eq("id", orderId)
    .is("customer_id", null)
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }
  if (!data) {
    throw new Error("Order not found.");
  }
  if (data.status !== "submitted") {
    redirect("/owner");
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: "pending_confirmation" })
    .eq("id", orderId)
    .eq("status", "submitted")
    .is("customer_id", null);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  redirect("/owner");
}

export async function saveOrderWorkspaceAction(
  orderId: string,
  _prev: OrderWorkspaceSaveState,
  formData: FormData,
): Promise<OrderWorkspaceSaveState> {
  await requireOwner();

  const guestName = String(formData.get("guest_name") ?? "").trim();
  const guestPhone = String(formData.get("guest_phone") ?? "").trim();
  const guestEmail = String(formData.get("guest_email") ?? "").trim();
  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  const pickupTime = String(formData.get("pickup_time") ?? "").trim();
  const customerNotes = String(formData.get("customer_notes") ?? "").trim();
  const internalNotes = String(formData.get("internal_notes") ?? "").trim();
  const cakeId = String(formData.get("cake_id") ?? "").trim();
  const cakeSizeId = String(formData.get("cake_size_id") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "").trim());

  if (!guestName || !guestPhone || !guestEmail) {
    return {
      error: "Please fill in the customer name, phone, and email.",
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
  if (!cakeId || !cakeSizeId) {
    return { error: "Please choose a cake and size.", success: false };
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Quantity must be at least 1.", success: false };
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .is("customer_id", null)
    .maybeSingle();

  if (loadError) {
    return { error: loadError.message, success: false };
  }
  if (!existing) {
    return { error: "Order not found.", success: false };
  }
  if (
    existing.status !== "submitted" &&
    existing.status !== "pending_confirmation"
  ) {
    return {
      error: "This order can no longer be edited.",
      success: false,
    };
  }

  const collection = await getCurrentCollection();
  if (!collection) {
    return {
      error: "No active collection is available for cake selection.",
      success: false,
    };
  }

  const cakes = await listAvailableCakes(collection.id);
  const cake = cakes.find((entry) => entry.id === cakeId);
  if (!cake) {
    const fallback = await getAvailableCakeById(cakeId);
    if (!fallback) {
      return {
        error: "That cake is not available in the current collection.",
        success: false,
      };
    }
  }

  const selectedCake = cake ?? (await getAvailableCakeById(cakeId));
  if (!selectedCake) {
    return { error: "Cake not found.", success: false };
  }

  const size = selectedCake.sizes.find((entry) => entry.id === cakeSizeId);
  if (!size) {
    return {
      error: "Please choose a valid size for that cake.",
      success: false,
    };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail,
      pickup_date: pickupDate,
      pickup_time: pickupTime,
      customer_notes: customerNotes || null,
      internal_notes: internalNotes || null,
    })
    .eq("id", orderId)
    .is("customer_id", null);

  if (updateError) {
    return { error: updateError.message, success: false };
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (itemsError) {
    return { error: itemsError.message, success: false };
  }

  const firstItem = items?.[0];
  if (firstItem) {
    const { error: itemUpdateError } = await supabase
      .from("order_items")
      .update({
        cake_id: cakeId,
        cake_size_id: cakeSizeId,
        quantity,
        unit_price: size.price,
      })
      .eq("id", firstItem.id);

    if (itemUpdateError) {
      return { error: itemUpdateError.message, success: false };
    }
  } else {
    const { error: itemInsertError } = await supabase
      .from("order_items")
      .insert({
        order_id: orderId,
        cake_id: cakeId,
        cake_size_id: cakeSizeId,
        quantity,
        unit_price: size.price,
      });
    if (itemInsertError) {
      return { error: itemInsertError.message, success: false };
    }
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);

  return { error: null, success: true };
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
