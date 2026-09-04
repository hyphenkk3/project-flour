"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canManageCakePhotos } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import {
  fallbackDefaultPhotoId,
  shouldAutoDefaultNewPhoto,
  type ResolvableCakePhoto,
} from "@/engines/menu/cake-photos";
import type { LibraryCakePhoto } from "@/types/library-cake";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import { getCakeById } from "@/workspaces/library/cakes/queries";
import {
  LIBRARY_CAKE_PHOTO_BUCKET,
  isMissingCakePhotoSchema,
  isMissingCakePhotoStorage,
  libraryCakePhotoObjectPath,
  libraryCakePhotoReplacePath,
  validateLibraryCakePhotoFile,
} from "@/workspaces/library/cakes/photo-storage";

function photoError(message: string): LibraryActionState {
  if (isMissingCakePhotoSchema(message) || isMissingCakePhotoStorage(message)) {
    return {
      error:
        "Cake photo storage is not available yet. Apply the cake photo migration first.",
    };
  }
  return { error: message };
}

async function requireCakePhotoStaff() {
  const staff = await requireStaff();
  if (!canManageCakePhotos(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function revalidateCake(cakeId: string) {
  revalidatePath("/library/cakes");
  revalidatePath(`/library/cakes/${cakeId}`);
  revalidatePath(`/library/cakes/${cakeId}/edit`);
  revalidatePath("/browse");
  revalidatePath(`/cakes/${cakeId}`);
}

function toResolvable(photos: LibraryCakePhoto[]): ResolvableCakePhoto[] {
  return photos.map((photo) => ({
    id: photo.id,
    url: photo.imageUrl,
    altText: photo.altText,
    sortOrder: photo.sortOrder,
    cakeSizeId: photo.cakeSizeId,
    isDefault: photo.isDefault,
  }));
}

async function loadCakeOrError(cakeId: string) {
  const cake = await getCakeById(cakeId);
  if (!cake) return { error: "Cake not found." as const, cake: null };
  return { error: null, cake };
}

async function publicUrlForPath(path: string): Promise<string> {
  const supabase = await createClient();
  const { data } = supabase.storage
    .from(LIBRARY_CAKE_PHOTO_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

async function setDefaultPhoto(cakeId: string, photoId: string | null) {
  const supabase = await createClient();
  const { error: clearError } = await supabase
    .from("library_cake_photos")
    .update({ is_default: false })
    .eq("cake_id", cakeId);
  if (clearError) throw new Error(clearError.message);
  if (!photoId) return;
  const { error } = await supabase
    .from("library_cake_photos")
    .update({ is_default: true })
    .eq("id", photoId)
    .eq("cake_id", cakeId);
  if (error) throw new Error(error.message);
}

async function clearSizeAssignment(cakeId: string, sizeId: string, exceptPhotoId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("library_cake_photos")
    .update({ cake_size_id: null })
    .eq("cake_id", cakeId)
    .eq("cake_size_id", sizeId);
  if (exceptPhotoId) {
    query = query.neq("id", exceptPhotoId);
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function uploadCakePhotoAction(
  cakeId: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireCakePhotoStaff();
  const loaded = await loadCakeOrError(cakeId);
  if (loaded.error || !loaded.cake) return { error: loaded.error ?? "Cake not found." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  const invalid = validateLibraryCakePhotoFile(file);
  if (invalid) return { error: invalid };

  const sizeIdRaw = String(formData.get("cake_size_id") ?? "").trim();
  const sizeId =
    sizeIdRaw && loaded.cake.sizes.some((size) => size.id === sizeIdRaw)
      ? sizeIdRaw
      : null;
  const altText = String(formData.get("alt_text") ?? "").trim() || null;

  const photoId = crypto.randomUUID();
  const path = libraryCakePhotoObjectPath({
    cakeId,
    photoId,
    mimeType: file.type,
  });

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from(LIBRARY_CAKE_PHOTO_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return photoError(uploadError.message);
  }

  const imageUrl = await publicUrlForPath(path);
  const nextSort =
    loaded.cake.photos.reduce(
      (max, photo) => Math.max(max, photo.sortOrder),
      -1,
    ) + 1;
  const makeDefault = shouldAutoDefaultNewPhoto({
    existing: toResolvable(loaded.cake.photos),
    newCakeSizeId: sizeId,
    sizes: loaded.cake.sizes,
  });

  try {
    if (sizeId) {
      await clearSizeAssignment(cakeId, sizeId);
    }
    if (makeDefault) {
      await setDefaultPhoto(cakeId, null);
    }
    const { error } = await supabase.from("library_cake_photos").insert({
      id: photoId,
      cake_id: cakeId,
      image_url: imageUrl,
      alt_text: altText,
      sort_order: nextSort,
      cake_size_id: sizeId,
      is_default: makeDefault,
      storage_path: path,
      asset_id: null,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    await supabase.storage.from(LIBRARY_CAKE_PHOTO_BUCKET).remove([path]);
    return photoError(
      error instanceof Error ? error.message : "Could not save the photo.",
    );
  }

  revalidateCake(cakeId);
  return { error: null };
}

export async function replaceCakePhotoAction(
  cakeId: string,
  photoId: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireCakePhotoStaff();
  const loaded = await loadCakeOrError(cakeId);
  if (loaded.error || !loaded.cake) return { error: loaded.error ?? "Cake not found." };
  const existing = loaded.cake.photos.find((photo) => photo.id === photoId);
  if (!existing) return { error: "Photo not found." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  const invalid = validateLibraryCakePhotoFile(file);
  if (invalid) return { error: invalid };

  const path = libraryCakePhotoReplacePath({
    cakeId,
    photoId,
    mimeType: file.type,
  });
  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from(LIBRARY_CAKE_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return photoError(uploadError.message);

  const imageUrl = await publicUrlForPath(path);
  const { error } = await supabase
    .from("library_cake_photos")
    .update({
      image_url: imageUrl,
      storage_path: path,
    })
    .eq("id", photoId)
    .eq("cake_id", cakeId);
  if (error) return photoError(error.message);

  if (existing.storagePath && existing.storagePath !== path) {
    await supabase.storage
      .from(LIBRARY_CAKE_PHOTO_BUCKET)
      .remove([existing.storagePath]);
  }

  revalidateCake(cakeId);
  return { error: null };
}

export async function assignCakePhotoSizeAction(
  cakeId: string,
  photoId: string,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireCakePhotoStaff();
  const loaded = await loadCakeOrError(cakeId);
  if (loaded.error || !loaded.cake) return { error: loaded.error ?? "Cake not found." };
  const photo = loaded.cake.photos.find((item) => item.id === photoId);
  if (!photo) return { error: "Photo not found." };

  const sizeIdRaw = String(formData.get("cake_size_id") ?? "").trim();
  const sizeId =
    sizeIdRaw && loaded.cake.sizes.some((size) => size.id === sizeIdRaw)
      ? sizeIdRaw
      : null;

  try {
    if (sizeId) await clearSizeAssignment(cakeId, sizeId, photoId);
    const supabase = await createClient();
    const { error } = await supabase
      .from("library_cake_photos")
      .update({ cake_size_id: sizeId })
      .eq("id", photoId)
      .eq("cake_id", cakeId);
    if (error) throw new Error(error.message);

    if (
      shouldAutoDefaultNewPhoto({
        existing: toResolvable(
          loaded.cake.photos.filter((item) => item.id !== photoId),
        ),
        newCakeSizeId: sizeId,
        sizes: loaded.cake.sizes,
      })
    ) {
      await setDefaultPhoto(cakeId, photoId);
    }
  } catch (error) {
    return photoError(
      error instanceof Error ? error.message : "Could not assign that size.",
    );
  }

  revalidateCake(cakeId);
  return { error: null };
}

export async function setCakePhotoDefaultAction(
  cakeId: string,
  photoId: string,
): Promise<LibraryActionState> {
  await requireCakePhotoStaff();
  const loaded = await loadCakeOrError(cakeId);
  if (loaded.error || !loaded.cake) return { error: loaded.error ?? "Cake not found." };
  if (!loaded.cake.photos.some((photo) => photo.id === photoId)) {
    return { error: "Photo not found." };
  }
  try {
    await setDefaultPhoto(cakeId, photoId);
  } catch (error) {
    return photoError(
      error instanceof Error ? error.message : "Could not set the default photo.",
    );
  }
  revalidateCake(cakeId);
  return { error: null };
}

export async function moveCakePhotoAction(
  cakeId: string,
  photoId: string,
  direction: "up" | "down",
): Promise<LibraryActionState> {
  await requireCakePhotoStaff();
  const loaded = await loadCakeOrError(cakeId);
  if (loaded.error || !loaded.cake) return { error: loaded.error ?? "Cake not found." };
  const ordered = [...loaded.cake.photos].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const index = ordered.findIndex((photo) => photo.id === photoId);
  if (index < 0) return { error: "Photo not found." };
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ordered.length) return { error: null };

  const supabase = await createClient();
  const current = ordered[index]!;
  const other = ordered[swapWith]!;
  const { error: firstError } = await supabase
    .from("library_cake_photos")
    .update({ sort_order: other.sortOrder })
    .eq("id", current.id);
  if (firstError) return photoError(firstError.message);
  const { error: secondError } = await supabase
    .from("library_cake_photos")
    .update({ sort_order: current.sortOrder })
    .eq("id", other.id);
  if (secondError) return photoError(secondError.message);

  revalidateCake(cakeId);
  return { error: null };
}

export async function deleteCakePhotoAction(
  cakeId: string,
  photoId: string,
): Promise<LibraryActionState> {
  await requireCakePhotoStaff();
  const loaded = await loadCakeOrError(cakeId);
  if (loaded.error || !loaded.cake) return { error: loaded.error ?? "Cake not found." };
  const existing = loaded.cake.photos.find((photo) => photo.id === photoId);
  if (!existing) return { error: "Photo not found." };

  const remaining = loaded.cake.photos.filter((photo) => photo.id !== photoId);
  const nextDefault = fallbackDefaultPhotoId({
    remaining: toResolvable(remaining),
    sizes: loaded.cake.sizes,
    deletedWasDefault: existing.isDefault,
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_cake_photos")
    .delete()
    .eq("id", photoId)
    .eq("cake_id", cakeId);
  if (error) return photoError(error.message);

  if (existing.storagePath) {
    await supabase.storage
      .from(LIBRARY_CAKE_PHOTO_BUCKET)
      .remove([existing.storagePath]);
  }

  if (nextDefault) {
    try {
      await setDefaultPhoto(cakeId, nextDefault);
    } catch (error) {
      return photoError(
        error instanceof Error
          ? error.message
          : "Photo deleted, but the default could not be updated.",
      );
    }
  }

  revalidateCake(cakeId);
  return { error: null };
}
