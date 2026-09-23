"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
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
import {
  LIBRARY_ASSET_BUCKET,
  isMissingAssetStorage,
  libraryAssetObjectPath,
  libraryAssetReplacePath,
  validateLibraryAssetImageFile,
} from "@/workspaces/library/assets/asset-storage";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function parseAssetInput(formData: FormData): LibraryAssetInput | string {
  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim() as LibraryAssetKind;
  const status = String(
    formData.get("status") ?? "",
  ).trim() as LibraryAssetStatus;
  const altText = emptyToNull(formData.get("alt_text"));

  if (!title) return "Title is required.";
  if (!LIBRARY_ASSET_KINDS.includes(kind)) return "Choose a valid asset kind.";
  if (!LIBRARY_ASSET_STATUSES.includes(status)) {
    return "Choose a valid status.";
  }

  return { title, kind, altText, status };
}

function selectedImageFile(formData: FormData): File | null {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }
  return file;
}

function storageError(message: string): LibraryActionState {
  if (isMissingAssetStorage(message)) {
    return {
      error:
        "Library asset storage is not ready. Apply the latest database update and try again.",
    };
  }
  return { error: message };
}

async function publicUrlForPath(path: string): Promise<string> {
  const supabase = await createClient();
  const { data } = supabase.storage
    .from(LIBRARY_ASSET_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
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

  const file = selectedImageFile(formData);
  if (!file) {
    return { error: "Choose an image to upload." };
  }

  const invalid = validateLibraryAssetImageFile(file);
  if (invalid) {
    return { error: invalid };
  }

  const supabase = await createClient();
  const assetId = crypto.randomUUID();
  const path = libraryAssetObjectPath({
    assetId,
    mimeType: file.type,
  });

  const { error: uploadError } = await supabase.storage
    .from(LIBRARY_ASSET_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return storageError(uploadError.message);
  }

  const imageUrl = await publicUrlForPath(path);
  const { error } = await supabase.from("library_assets").insert({
    id: assetId,
    title: parsed.title,
    kind: parsed.kind,
    image_url: imageUrl,
    storage_path: path,
    alt_text: parsed.altText,
    status: parsed.status,
    created_by: staff.id,
    updated_by: staff.id,
  });

  if (error) {
    await supabase.storage.from(LIBRARY_ASSET_BUCKET).remove([path]);
    return storageError(error.message);
  }

  revalidatePath("/library/assets");
  redirect(`/library/assets/${assetId}`);
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
  const { data: current, error: currentError } = await supabase
    .from("library_assets")
    .select("id, image_url, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (currentError) {
    return { error: currentError.message };
  }
  if (!current) {
    return { error: "This asset is no longer available." };
  }

  const file = selectedImageFile(formData);
  let imageUrl = current.image_url as string;
  let storagePath = (current.storage_path as string | null) ?? null;
  let previousStoragePath: string | null = null;

  if (file) {
    const invalid = validateLibraryAssetImageFile(file);
    if (invalid) {
      return { error: invalid };
    }

    const nextPath = libraryAssetReplacePath({
      assetId: id,
      mimeType: file.type,
    });
    const { error: uploadError } = await supabase.storage
      .from(LIBRARY_ASSET_BUCKET)
      .upload(nextPath, file, {
        contentType: file.type,
        upsert: true,
      });
    if (uploadError) {
      return storageError(uploadError.message);
    }

    imageUrl = await publicUrlForPath(nextPath);
    previousStoragePath = storagePath;
    storagePath = nextPath;
  }

  const { error } = await supabase
    .from("library_assets")
    .update({
      title: parsed.title,
      kind: parsed.kind,
      image_url: imageUrl,
      storage_path: storagePath,
      alt_text: parsed.altText,
      status: parsed.status,
      updated_by: staff.id,
    })
    .eq("id", id);

  if (error) {
    if (file && storagePath && storagePath !== previousStoragePath) {
      await supabase.storage.from(LIBRARY_ASSET_BUCKET).remove([storagePath]);
    }
    return storageError(error.message);
  }

  if (previousStoragePath && previousStoragePath !== storagePath) {
    await supabase.storage
      .from(LIBRARY_ASSET_BUCKET)
      .remove([previousStoragePath]);
  }

  revalidatePath("/library/assets");
  revalidatePath(`/library/assets/${id}`);
  revalidatePath(`/library/assets/${id}/edit`);
  redirect(`/library/assets/${id}`);
}

export async function deleteAssetAction(id: string): Promise<void> {
  await requireLibraryStaff();
  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("library_assets")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message);
  }

  const { error } = await supabase.from("library_assets").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }

  const storagePath = (current?.storage_path as string | null) ?? null;
  if (storagePath) {
    await supabase.storage.from(LIBRARY_ASSET_BUCKET).remove([storagePath]);
  }

  revalidatePath("/library/assets");
  redirect("/library/assets");
}
