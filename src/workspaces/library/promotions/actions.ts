"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type {
  LibraryPromotionInput,
  LibraryPromotionStatus,
} from "@/types/library-promotion";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import {
  emptyToNull,
  LIBRARY_PROMOTION_STATUSES,
  parseOptionalDate,
} from "@/workspaces/library/labels";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function parsePromotionInput(
  formData: FormData,
): LibraryPromotionInput | string {
  const name = String(formData.get("name") ?? "").trim();
  const description = emptyToNull(formData.get("description"));
  const validFrom = parseOptionalDate(formData.get("valid_from"));
  const validUntil = parseOptionalDate(formData.get("valid_until"));
  const status = String(
    formData.get("status") ?? "",
  ).trim() as LibraryPromotionStatus;

  if (!name) return "Name is required.";
  if (!LIBRARY_PROMOTION_STATUSES.includes(status)) {
    return "Choose a valid status.";
  }
  if (validFrom && validUntil && validUntil < validFrom) {
    return "Valid until must be on or after valid from.";
  }

  return { name, description, validFrom, validUntil, status };
}

export async function createPromotionAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const parsed = parsePromotionInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_promotions")
    .insert({
      name: parsed.name,
      description: parsed.description,
      valid_from: parsed.validFrom,
      valid_until: parsed.validUntil,
      status: parsed.status,
      created_by: staff.id,
      updated_by: staff.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/library/promotions");
  redirect(`/library/promotions/${data.id}`);
}

export async function updatePromotionAction(
  id: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const parsed = parsePromotionInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_promotions")
    .update({
      name: parsed.name,
      description: parsed.description,
      valid_from: parsed.validFrom,
      valid_until: parsed.validUntil,
      status: parsed.status,
      updated_by: staff.id,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/library/promotions");
  revalidatePath(`/library/promotions/${id}`);
  revalidatePath(`/library/promotions/${id}/edit`);
  redirect(`/library/promotions/${id}`);
}

export async function deletePromotionAction(id: string): Promise<void> {
  await requireLibraryStaff();
  const supabase = await createClient();
  const { error } = await supabase
    .from("library_promotions")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/library/promotions");
  redirect("/library/promotions");
}
