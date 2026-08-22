"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { parseBusinessDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import { emptyToNull } from "@/workspaces/library/labels";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function parsePickupDate(formData: FormData): string | null {
  const raw = String(formData.get("pickup_date") ?? "").trim();
  if (!parseBusinessDate(raw)) return null;
  return raw;
}

function revalidateOrderAvailability() {
  revalidatePath("/library/order-availability");
  revalidatePath("/");
  revalidatePath("/order");
}

export async function updateOrderAvailabilityAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
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
