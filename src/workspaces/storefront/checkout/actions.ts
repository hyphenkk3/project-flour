"use server";

import { redirect } from "next/navigation";
import { isValidPickupSlot } from "@/engines/business-calendar/pickup-slots";
import { createClient } from "@/lib/supabase/server";

export type CheckoutState = {
  error: string | null;
};

type SubmitItem = {
  cake_id: string;
  cake_size_id: string;
  quantity: number;
};

function parseItems(formData: FormData): SubmitItem[] {
  const raw = String(formData.get("items_json") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      cakeId?: string;
      sizeId?: string;
      quantity?: number;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        cake_id: String(item.cakeId ?? "").trim(),
        cake_size_id: String(item.sizeId ?? "").trim(),
        quantity: Number(item.quantity ?? 0),
      }))
      .filter(
        (item) =>
          item.cake_id &&
          item.cake_size_id &&
          Number.isInteger(item.quantity) &&
          item.quantity >= 1,
      );
  } catch {
    return [];
  }
}

function consolidateItems(items: SubmitItem[]): SubmitItem[] {
  const map = new Map<string, SubmitItem>();
  for (const item of items) {
    const key = `${item.cake_id}::${item.cake_size_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

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
  const items = consolidateItems(parseItems(formData));

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
  if (items.length === 0) {
    return { error: "Please add at least one cake to your preorder." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_guest_preorder", {
    p_customer_name: customerName,
    p_phone: phone,
    p_email: email,
    p_pickup_date: pickupDate,
    p_pickup_time: pickupTime,
    p_notes: notes || null,
    p_items: items,
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
