"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import { canMutateOrderAvailability } from "@/foundation/navigation/access";
import { parseBusinessDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import { emptyToNull } from "@/workspaces/library/labels";

function revalidateCapacity() {
  revalidatePath("/bakery/availability");
}

function parseOptionalUuid(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw,
    )
  ) {
    return null;
  }
  return raw;
}

async function requireCapacityMutation() {
  const staff = await requireStaff();
  if (!canMutateOrderAvailability(staff.role.code)) {
    return {
      staff,
      error: "Not authorized to change production capacity." as const,
    };
  }
  return { staff, error: null };
}

export async function saveProductionCapacityAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireCapacityMutation();
  if (auth.error) return { error: auth.error };

  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  if (!parseBusinessDate(pickupDate)) {
    return { error: "Choose a valid pickup date." };
  }

  const cakeId = parseOptionalUuid(formData.get("library_cake_id"));
  if (!cakeId) {
    return { error: "Choose a cake." };
  }

  const sizeId = parseOptionalUuid(formData.get("library_cake_size_id"));
  const collectionId = parseOptionalUuid(formData.get("collection_id"));
  const rawQuantity = String(formData.get("capacity_quantity") ?? "").trim();
  const quantity = Number.parseInt(rawQuantity, 10);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: "Enter a capacity of 0 or more." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_production_capacity", {
    p_actor_staff_id: auth.staff.id,
    p_pickup_date: pickupDate,
    p_library_cake_id: cakeId,
    p_library_cake_size_id: sizeId,
    p_collection_id: collectionId,
    p_capacity_quantity: quantity,
    p_note: emptyToNull(formData.get("note")),
  });
  if (error) {
    return { error: error.message };
  }

  revalidateCapacity();
  return { error: null };
}

export async function removeProductionCapacityAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireCapacityMutation();
  if (auth.error) return { error: auth.error };

  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  if (!parseBusinessDate(pickupDate)) {
    return { error: "Choose a valid pickup date." };
  }

  const cakeId = parseOptionalUuid(formData.get("library_cake_id"));
  if (!cakeId) {
    return { error: "Choose a cake." };
  }

  const sizeId = parseOptionalUuid(formData.get("library_cake_size_id"));
  const collectionId = parseOptionalUuid(formData.get("collection_id"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_production_capacity", {
    p_actor_staff_id: auth.staff.id,
    p_pickup_date: pickupDate,
    p_library_cake_id: cakeId,
    p_library_cake_size_id: sizeId,
    p_collection_id: collectionId,
    p_capacity_quantity: null,
    p_note: null,
  });
  if (error) {
    return { error: error.message };
  }

  revalidateCapacity();
  return { error: null };
}
