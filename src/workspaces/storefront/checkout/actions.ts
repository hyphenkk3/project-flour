"use server";

import { redirect } from "next/navigation";
import { isValidPickupSlot } from "@/engines/business-calendar/pickup-slots";
import { createClient } from "@/lib/supabase/server";

export type CheckoutState = {
  error: string | null;
};

export async function submitGuestPreorderAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  const pickupTime = String(formData.get("pickup_time") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const cakeId = String(formData.get("cake_id") ?? "").trim();
  const cakeSizeId = String(formData.get("cake_size_id") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "1").trim();
  const quantity = Number(quantityRaw);

  if (!customerName || !phone || !email) {
    return { error: "Please fill in your name, phone, and email." };
  }
  if (!pickupDate || !pickupTime) {
    return { error: "Please choose a pickup date and time." };
  }
  if (!isValidPickupSlot(pickupDate, pickupTime)) {
    return {
      error: "Please choose a valid pickup time for that date.",
    };
  }
  if (!cakeId || !cakeSizeId) {
    return { error: "Please choose a cake size." };
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Quantity must be at least 1." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_guest_preorder", {
    p_customer_name: customerName,
    p_phone: phone,
    p_email: email,
    p_pickup_date: pickupDate,
    p_pickup_time: pickupTime,
    p_notes: notes || null,
    p_cake_id: cakeId,
    p_cake_size_id: cakeSizeId,
    p_quantity: quantity,
  });

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

  redirect(`/order/success?order=${orderId}`);
}
