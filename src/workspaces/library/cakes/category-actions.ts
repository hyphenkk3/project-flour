"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  categoryNameConflicts,
  moveCakeCategoryInOrder,
  nextCakeCategorySortOrder,
  normalizeCakeCategoryName,
} from "@/engines/menu/cake-categories";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import { listCakeCategories } from "@/workspaces/library/cakes/queries";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function revalidateCakeCategories() {
  revalidatePath("/library", "layout");
  revalidatePath("/browse");
  revalidatePath("/");
}

export async function createCakeCategoryAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const name = normalizeCakeCategoryName(String(formData.get("name") ?? ""));
  if (!name) {
    return { error: "Enter a category name." };
  }

  const existing = await listCakeCategories();
  if (categoryNameConflicts(existing, name)) {
    return { error: "A category with that name already exists." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("library_cake_categories").insert({
    name,
    is_active: true,
    sort_order: nextCakeCategorySortOrder(existing),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "A category with that name already exists." };
    }
    return { error: error.message };
  }

  revalidateCakeCategories();
  return { error: null };
}

export async function renameCakeCategoryAction(
  id: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const name = normalizeCakeCategoryName(String(formData.get("name") ?? ""));
  if (!name) {
    return { error: "Enter a category name." };
  }

  const existing = await listCakeCategories();
  const current = existing.find((row) => row.id === id);
  if (!current) {
    return { error: "That category could not be found." };
  }
  if (categoryNameConflicts(existing, name, id)) {
    return { error: "A category with that name already exists." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_cake_categories")
    .update({ name })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "A category with that name already exists." };
    }
    return { error: error.message };
  }

  revalidateCakeCategories();
  return { error: null };
}

export async function setCakeCategoryActiveAction(
  id: string,
  isActive: boolean,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const existing = await listCakeCategories();
  const current = existing.find((row) => row.id === id);
  if (!current) {
    return { error: "That category could not be found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_cake_categories")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidateCakeCategories();
  return { error: null };
}

export async function moveCakeCategoryAction(
  id: string,
  direction: "up" | "down",
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const existing = await listCakeCategories();
  const next = moveCakeCategoryInOrder(
    existing,
    id,
    direction === "up" ? -1 : 1,
  );

  const supabase = await createClient();
  for (const row of next) {
    const { error } = await supabase
      .from("library_cake_categories")
      .update({ sort_order: row.sortOrder })
      .eq("id", row.id);
    if (error) {
      return { error: error.message };
    }
  }

  revalidateCakeCategories();
  return { error: null };
}
