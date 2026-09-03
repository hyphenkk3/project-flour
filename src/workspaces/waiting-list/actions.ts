"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import {
  canConfigureWaitingList,
  canManageWaitingList,
} from "@/engines/waiting-list/capabilities";
import {
  isValidWaitingListWhatsApp,
  waitingListWhatsAppDigits,
} from "@/engines/waiting-list/phone";
import { parseBusinessDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { scheduleStaffNotificationDispatch } from "@/foundation/staff/schedule-staff-notification-dispatch";
import type { LibraryActionState } from "@/workspaces/library/action-state";

function revalidateWaitingList() {
  revalidatePath("/bakery/availability");
}

async function requireManage() {
  const staff = await requireStaff();
  if (!canManageWaitingList(staff.role.code)) {
    return { staff, error: "Not authorized to manage the waiting list." as const };
  }
  return { staff, error: null };
}

async function requireConfigure() {
  const staff = await requireStaff();
  if (!canConfigureWaitingList(staff.role.code)) {
    return {
      staff,
      error: "Not authorized to configure waiting-list enablement." as const,
    };
  }
  return { staff, error: null };
}

export async function setCollectionWaitingListAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireConfigure();
  if (auth.error) return { error: auth.error };
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  const enabled = String(formData.get("waiting_list_enabled") ?? "") === "on";
  const minutesRaw = String(formData.get("waiting_list_response_minutes") ?? "").trim();
  const minutes = minutesRaw ? Number.parseInt(minutesRaw, 10) : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_collection_waiting_list", {
    p_actor_staff_id: auth.staff.id,
    p_collection_id: collectionId,
    p_enabled: enabled,
    p_response_minutes: minutes && minutes > 0 ? minutes : null,
  });
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}

export async function setCapacityWaitingListAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireConfigure();
  if (auth.error) return { error: auth.error };
  const capacityId = String(formData.get("capacity_id") ?? "").trim();
  const enabled = String(formData.get("waiting_list_enabled") ?? "") === "on";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_production_capacity_waiting_list", {
    p_actor_staff_id: auth.staff.id,
    p_capacity_id: capacityId,
    p_enabled: enabled,
  });
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}

export async function createStaffWaitingListAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireManage();
  if (auth.error) return { error: auth.error };
  const name = String(formData.get("customer_name") ?? "").trim();
  const phone = waitingListWhatsAppDigits(String(formData.get("phone") ?? ""));
  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  const cakeId = String(formData.get("cake_id") ?? "").trim();
  const sizeId = String(formData.get("size_id") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "1"), 10);
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  const openToAlternatives = String(formData.get("open_to_alternatives") ?? "") === "yes";
  if (!name || !isValidWaitingListWhatsApp(phone)) {
    return { error: "Name and WhatsApp number are required." };
  }
  if (!parseBusinessDate(pickupDate) || !cakeId || !sizeId || quantity < 1) {
    return { error: "Date, cake, size, and quantity are required." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_staff_waiting_list_request", {
    p_actor_staff_id: auth.staff.id,
    p_customer_name: name,
    p_phone: phone,
    p_pickup_date: pickupDate,
    p_open_to_alternatives: openToAlternatives,
    p_items: [{ cake_id: cakeId, cake_size_id: sizeId, quantity }],
    p_collection_id: collectionId || null,
    p_notes: null,
  });
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}

export async function contactWaitingListItemAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireManage();
  if (auth.error) return { error: auth.error };
  const itemId = String(formData.get("item_id") ?? "").trim();
  const offered = Number.parseInt(String(formData.get("offered_quantity") ?? ""), 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("waiting_list_contact_item", {
    p_actor_staff_id: auth.staff.id,
    p_item_id: itemId,
    p_offered_quantity: Number.isFinite(offered) ? offered : null,
  });
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}

export async function recordWaitingListResponseAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireManage();
  if (auth.error) return { error: auth.error };
  const itemId = String(formData.get("item_id") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const accepted = Number.parseInt(String(formData.get("accepted_quantity") ?? ""), 10);
  const keepRemaining = String(formData.get("keep_remaining") ?? "yes") !== "no";
  const supabase = await createClient();
  const { error } = await supabase.rpc("waiting_list_record_response", {
    p_actor_staff_id: auth.staff.id,
    p_item_id: itemId,
    p_outcome: outcome,
    p_accepted_quantity: Number.isFinite(accepted) ? accepted : null,
    p_keep_remaining: keepRemaining,
    p_note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}

export async function convertWaitingListItemAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireManage();
  if (auth.error) return { error: auth.error };
  const itemId = String(formData.get("item_id") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? ""), 10);
  const pickupTime = String(formData.get("pickup_time") ?? "").trim();
  const keepRemaining = String(formData.get("keep_remaining") ?? "yes") !== "no";
  const supabase = await createClient();
  const { error } = await supabase.rpc("waiting_list_convert_item", {
    p_actor_staff_id: auth.staff.id,
    p_item_id: itemId,
    p_quantity: Number.isFinite(quantity) ? quantity : null,
    p_pickup_time: pickupTime || null,
    p_keep_remaining: keepRemaining,
  });
  if (error) return { error: error.message };
  scheduleStaffNotificationDispatch();
  revalidateWaitingList();
  return { error: null };
}

export async function closeWaitingListRemainingAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireManage();
  if (auth.error) return { error: auth.error };
  const itemId = String(formData.get("item_id") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("waiting_list_close_remaining", {
    p_actor_staff_id: auth.staff.id,
    p_item_id: itemId,
  });
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}

export async function cancelWaitingListItemAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireManage();
  if (auth.error) return { error: auth.error };
  const itemId = String(formData.get("item_id") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("waiting_list_cancel_item", {
    p_actor_staff_id: auth.staff.id,
    p_item_id: itemId,
    p_guest_phone: null,
    p_reason: String(formData.get("reason") ?? "").trim() || "Staff cancelled",
  });
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}

export async function offerWaitingListAlternativeAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireManage();
  if (auth.error) return { error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("waiting_list_offer_alternative", {
    p_actor_staff_id: auth.staff.id,
    p_item_id: String(formData.get("item_id") ?? "").trim(),
    p_alternative_cake_id: String(formData.get("alternative_cake_id") ?? "").trim(),
    p_alternative_size_id: String(formData.get("alternative_size_id") ?? "").trim(),
    p_quantity: Number.parseInt(String(formData.get("quantity") ?? "1"), 10),
  });
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}

export async function recordWaitingListAlternativeAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireManage();
  if (auth.error) return { error: auth.error };
  const accept = String(formData.get("accept") ?? "") === "yes";
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "waiting_list_record_alternative_response",
    {
      p_actor_staff_id: auth.staff.id,
      p_item_id: String(formData.get("item_id") ?? "").trim(),
      p_accept: accept,
      p_alternative_cake_id:
        String(formData.get("alternative_cake_id") ?? "").trim() || null,
      p_alternative_size_id:
        String(formData.get("alternative_size_id") ?? "").trim() || null,
      p_quantity: Number.parseInt(String(formData.get("quantity") ?? ""), 10) || null,
      p_keep_original: String(formData.get("keep_original") ?? "yes") !== "no",
    },
  );
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}

export async function replaceWaitingListItemScopeAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireManage();
  if (auth.error) return { error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("waiting_list_replace_item_scope", {
    p_actor_staff_id: auth.staff.id,
    p_item_id: String(formData.get("item_id") ?? "").trim(),
    p_pickup_date: String(formData.get("pickup_date") ?? "").trim(),
    p_cake_id: String(formData.get("cake_id") ?? "").trim(),
    p_size_id: String(formData.get("size_id") ?? "").trim(),
  });
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}

export async function setWaitingListItemQuantityAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireManage();
  if (auth.error) return { error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("waiting_list_set_item_quantity", {
    p_actor_staff_id: auth.staff.id,
    p_item_id: String(formData.get("item_id") ?? "").trim(),
    p_quantity: Number.parseInt(String(formData.get("quantity") ?? ""), 10),
  });
  if (error) return { error: error.message };
  revalidateWaitingList();
  return { error: null };
}
