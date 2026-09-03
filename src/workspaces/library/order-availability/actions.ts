"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import { canMutateOrderAvailability } from "@/foundation/navigation/access";
import { parseBusinessDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import { emptyToNull } from "@/workspaces/library/labels";

function parsePickupDate(formData: FormData): string | null {
  const raw = String(formData.get("pickup_date") ?? "").trim();
  if (!parseBusinessDate(raw)) return null;
  return raw;
}

function revalidateOrderAvailability() {
  revalidatePath("/library/order-availability");
  revalidatePath("/bakery/availability");
  revalidatePath("/");
  revalidatePath("/order");
}

export async function updateOrderAvailabilityAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireStaff();
  if (!canMutateOrderAvailability(staff.role.code)) {
    return { error: "Not authorized to close or reopen pickup dates." };
  }

  const pickupDate = parsePickupDate(formData);
  if (!pickupDate) {
    return { error: "Choose a valid pickup date." };
  }

  const intent = String(formData.get("intent") ?? "").trim();
  const supabase = await createClient();

  if (intent === "reopen") {
    const { error } = await supabase
      .from("order_availability_overrides")
      .delete()
      .eq("pickup_date", pickupDate);
    if (error) {
      return { error: error.message };
    }
    revalidateOrderAvailability();
    return { error: null };
  }

  if (intent !== "close") {
    return { error: "Choose Close orders or Reopen orders." };
  }

  const note = emptyToNull(formData.get("note"));
  const { error } = await supabase.from("order_availability_overrides").upsert(
    {
      pickup_date: pickupDate,
      closed: true,
      note,
    },
    { onConflict: "pickup_date" },
  );
  if (error) {
    return { error: error.message };
  }

  revalidateOrderAvailability();
  return { error: null };
}
