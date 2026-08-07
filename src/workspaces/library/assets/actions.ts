"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type {
  LibraryAssetInput,
  LibraryAssetKind,
  LibraryAssetStatus,
} from "@/types/library-asset";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import {
  emptyToNull,
  LIBRARY_ASSET_KINDS,
  LIBRARY_ASSET_STATUSES,
} from "@/workspaces/library/labels";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canAccessWorkspace(staff.role.code, "library")) {
    redirect("/home");
  }
  return staff;
}

function parseAssetInput(formData: FormData): LibraryAssetInput | string {
  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim() as LibraryAssetKind;
  const imageUrl = String(formData.get("image_url") ?? "").trim();
  const status = String(
    formData.get("status") ?? "",
  ).trim() as LibraryAssetStatus;
  const altText = emptyToNull(formData.get("alt_text"));

  if (!title) return "Title is required.";
  if (!imageUrl) return "Image URL is required.";
  if (!LIBRARY_ASSET_KINDS.includes(kind)) return "Choose a valid asset kind.";
  if (!LIBRARY_ASSET_STATUSES.includes(status)) {
    return "Choose a valid status.";
  }

  return { title, kind, imageUrl, altText, status };
}

export async function createAssetAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const parsed = parseAssetInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_assets")
    .insert({
      title: parsed.title,
      kind: parsed.kind,
      image_url: parsed.imageUrl,
      alt_text: parsed.altText,
      status: parsed.status,
      created_by: staff.id,
      updated_by: staff.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/library/assets");
  redirect(`/library/assets/${data.id}`);
}

export async function updateAssetAction(
  id: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const parsed = parseAssetInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_assets")
    .update({
      title: parsed.title,
      kind: parsed.kind,
      image_url: parsed.imageUrl,
      alt_text: parsed.altText,
      status: parsed.status,
      updated_by: staff.id,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/library/assets");
  revalidatePath(`/library/assets/${id}`);
  revalidatePath(`/library/assets/${id}/edit`);
  redirect(`/library/assets/${id}`);
}

export async function deleteAssetAction(id: string): Promise<void> {
  await requireLibraryStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("library_assets").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/library/assets");
  redirect("/library/assets");
}
