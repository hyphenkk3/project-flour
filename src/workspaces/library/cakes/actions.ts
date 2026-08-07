"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type {
  LibraryCakeCategory,
  LibraryCakeInput,
  LibraryCakePhotoInput,
  LibraryCakeSizeInput,
  LibraryCakeStatus,
} from "@/types/library-cake";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import {
  emptyToNull,
  LIBRARY_CAKE_CATEGORIES,
  LIBRARY_CAKE_STATUSES,
  parseNonNegativeNumber,
} from "@/workspaces/library/labels";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canAccessWorkspace(staff.role.code, "library")) {
    redirect("/home");
  }
  return staff;
}

function parseLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseSizes(formData: FormData): LibraryCakeSizeInput[] | string {
  const labels = formData
    .getAll("size_label")
    .map((value) => String(value).trim());
  const prices = formData.getAll("size_price");

  const sizes: LibraryCakeSizeInput[] = [];

  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index] ?? "";
    const priceRaw = String(prices[index] ?? "").trim();

    if (!label && !priceRaw) {
      continue;
    }
    if (!label) {
      return "Enter a size for each row (e.g. 6\").";
    }
    if (!priceRaw) {
      return `Enter a price for size “${label}”.`;
    }

    const price = parseNonNegativeNumber(priceRaw);
    sizes.push({
      label,
      price,
      sortOrder: sizes.length,
    });
  }

  if (sizes.length === 0) {
    return "Add at least one size with a label and price.";
  }

  return sizes;
}

function parsePhotos(formData: FormData): LibraryCakePhotoInput[] {
  const urls = parseLines(formData.get("photo_urls"));
  const alts = parseLines(formData.get("photo_alts"));

  return urls.map((imageUrl, index) => ({
    imageUrl,
    altText: alts[index]?.trim() || null,
    assetId: null,
    sortOrder: index,
  }));
}

function parseCakeInput(formData: FormData): LibraryCakeInput | string {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(
    formData.get("category") ?? "",
  ).trim() as LibraryCakeCategory;
  const description = emptyToNull(formData.get("description"));
  const sharingGuide = emptyToNull(formData.get("sharing_guide"));
  const bakeryNotes = emptyToNull(formData.get("bakery_notes"));
  const status = String(
    formData.get("status") ?? "",
  ).trim() as LibraryCakeStatus;
  const allergens = parseLines(formData.get("allergens"));
  const sizes = parseSizes(formData);
  if (typeof sizes === "string") {
    return sizes;
  }
  const photos = parsePhotos(formData);

  if (!name) return "Name is required.";
  if (!LIBRARY_CAKE_CATEGORIES.includes(category)) {
    return "Choose a valid category.";
  }
  if (!LIBRARY_CAKE_STATUSES.includes(status)) {
    return "Choose a valid status.";
  }

  return {
    name,
    category,
    description,
    sharingGuide,
    allergens,
    bakeryNotes,
    status,
    sizes,
    photos,
  };
}

async function replaceCakeChildren(
  cakeId: string,
  sizes: LibraryCakeSizeInput[],
  photos: LibraryCakePhotoInput[],
) {
  const supabase = await createClient();

  const { error: deleteSizesError } = await supabase
    .from("library_cake_sizes")
    .delete()
    .eq("cake_id", cakeId);
  if (deleteSizesError) {
    throw new Error(deleteSizesError.message);
  }

  const { error: deletePhotosError } = await supabase
    .from("library_cake_photos")
    .delete()
    .eq("cake_id", cakeId);
  if (deletePhotosError) {
    throw new Error(deletePhotosError.message);
  }

  if (sizes.length > 0) {
    const { error } = await supabase.from("library_cake_sizes").insert(
      sizes.map((size) => ({
        cake_id: cakeId,
        label: size.label,
        serves: null,
        price: size.price,
        sort_order: size.sortOrder,
      })),
    );
    if (error) {
      throw new Error(error.message);
    }
  }

  if (photos.length > 0) {
    const { error } = await supabase.from("library_cake_photos").insert(
      photos.map((photo) => ({
        cake_id: cakeId,
        image_url: photo.imageUrl,
        alt_text: photo.altText,
        asset_id: photo.assetId,
        sort_order: photo.sortOrder,
      })),
    );
    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function createCakeAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const parsed = parseCakeInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cakes")
    .insert({
      name: parsed.name,
      category: parsed.category,
      description: parsed.description,
      sharing_guide: parsed.sharingGuide,
      allergens: parsed.allergens,
      bakery_notes: parsed.bakeryNotes,
      status: parsed.status,
      created_by: staff.id,
      updated_by: staff.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  try {
    await replaceCakeChildren(data.id, parsed.sizes, parsed.photos);
  } catch (childError) {
    return {
      error:
        childError instanceof Error
          ? childError.message
          : "Could not save sizes or photos.",
    };
  }

  revalidatePath("/library/cakes");
  redirect(`/library/cakes/${data.id}`);
}

export async function updateCakeAction(
  id: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const parsed = parseCakeInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_cakes")
    .update({
      name: parsed.name,
      category: parsed.category,
      description: parsed.description,
      sharing_guide: parsed.sharingGuide,
      allergens: parsed.allergens,
      bakery_notes: parsed.bakeryNotes,
      status: parsed.status,
      updated_by: staff.id,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  try {
    await replaceCakeChildren(id, parsed.sizes, parsed.photos);
  } catch (childError) {
    return {
      error:
        childError instanceof Error
          ? childError.message
          : "Could not save sizes or photos.",
    };
  }

  revalidatePath("/library/cakes");
  revalidatePath(`/library/cakes/${id}`);
  revalidatePath(`/library/cakes/${id}/edit`);
  redirect(`/library/cakes/${id}`);
}

export async function deleteCakeAction(id: string): Promise<void> {
  await requireLibraryStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("library_cakes").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/library/cakes");
  redirect("/library/cakes");
}
