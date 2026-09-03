"use server";

import { redirect } from "next/navigation";
import {
  isValidWaitingListWhatsApp,
  waitingListWhatsAppDigits,
} from "@/engines/waiting-list/phone";
import { createClient } from "@/lib/supabase/server";
import { parseBusinessDate } from "@/lib/dates";
import {
  guestWaitingListCookieId,
  setGuestWaitingListCookie,
} from "@/workspaces/storefront/waiting-list/cookie";
import { getGuestWaitingListAck } from "@/workspaces/storefront/waiting-list/queries";

export type GuestWaitingListState = {
  error: string | null;
};

export async function submitGuestWaitingListAction(
  _prev: GuestWaitingListState,
  formData: FormData,
): Promise<GuestWaitingListState> {
  const name = String(formData.get("customer_name") ?? "").trim();
  const phone = waitingListWhatsAppDigits(String(formData.get("phone") ?? ""));
  const pickupDate = String(formData.get("pickup_date") ?? "").trim().slice(0, 10);
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  const openToAlternatives = String(formData.get("open_to_alternatives") ?? "") === "yes";
  const itemsJson = String(formData.get("items_json") ?? "").trim();

  if (!name) {
    return { error: "Please fill in your name and WhatsApp phone number." };
  }
  if (!isValidWaitingListWhatsApp(phone)) {
    return { error: "Please enter a valid WhatsApp number." };
  }
  if (!parseBusinessDate(pickupDate)) {
    return { error: "Collection date is required." };
  }

  let items: Array<{ cake_id: string; cake_size_id: string; quantity: number }> =
    [];
  try {
    const parsed = JSON.parse(itemsJson) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { error: "At least one cake is required." };
    }
    items = parsed.map((row) => {
      const entry = row as Record<string, unknown>;
      return {
        cake_id: String(entry.cake_id ?? entry.cakeId ?? "").trim(),
        cake_size_id: String(
          entry.cake_size_id ?? entry.sizeId ?? "",
        ).trim(),
        quantity: Number(entry.quantity ?? 0),
      };
    });
  } catch {
    return { error: "At least one cake is required." };
  }
  if (items.some((item) => !item.cake_id || !item.cake_size_id || item.quantity < 1)) {
    return { error: "Each waiting-list item needs a cake, size, and quantity." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_guest_waiting_list_request", {
    p_customer_name: name,
    p_phone: phone,
    p_pickup_date: pickupDate,
    p_open_to_alternatives: openToAlternatives,
    p_items: items,
    p_collection_id: collectionId || null,
  });
  if (error) {
    return { error: error.message };
  }
  const requestId =
    data && typeof data === "object" && "id" in data
      ? String((data as { id: string }).id)
      : "";
  if (!requestId) {
    return { error: "Waiting-list request was created but could not be confirmed." };
  }
  await setGuestWaitingListCookie(requestId);
  redirect(`/order/waiting-list?request=${requestId}`);
}

export async function cancelGuestWaitingListAction(
  formData: FormData,
): Promise<void> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const phone = waitingListWhatsAppDigits(String(formData.get("phone") ?? ""));
  const cookieId = await guestWaitingListCookieId();
  if (!requestId || cookieId !== requestId || !phone) {
    return;
  }
  const ack = await getGuestWaitingListAck(requestId);
  if (!ack) return;
  const supabase = await createClient();
  for (const item of ack.items) {
    if (
      item.status !== "active" &&
      item.status !== "contacted" &&
      item.status !== "partially_accepted"
    ) {
      continue;
    }
    await supabase.rpc("waiting_list_cancel_item", {
      p_actor_staff_id: null,
      p_item_id: item.id,
      p_guest_phone: phone,
      p_reason: "Customer cancelled",
    });
  }
  redirect(`/order/waiting-list?request=${requestId}`);
}
