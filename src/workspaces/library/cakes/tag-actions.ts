"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  moveCakeTagInOrder,
  nextCakeTagSortOrder,
  normalizeCakeTagName,
  tagNameConflicts,
} from "@/engines/menu/cake-tags";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import { listCakeTags } from "@/workspaces/library/cakes/queries";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function revalidateCakeTags() {
  revalidatePath("/library", "layout");
  revalidatePath("/browse");
  revalidatePath("/");
}

export async function createCakeTagAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const name = normalizeCakeTagName(String(formData.get("name") ?? ""));
  if (!name) {
    return { error: "Enter a tag name." };
  }

  const existing = await listCakeTags();
  if (tagNameConflicts(existing, name)) {
    return { error: "A tag with that name already exists." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("library_cake_tags").insert({
    name,
    is_active: true,
    sort_order: nextCakeTagSortOrder(existing),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "A tag with that name already exists." };
    }
    return { error: error.message };
  }

  revalidateCakeTags();
  return { error: null };
}

export async function renameCakeTagAction(
  id: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const name = normalizeCakeTagName(String(formData.get("name") ?? ""));
  if (!name) {
    return { error: "Enter a tag name." };
  }

  const existing = await listCakeTags();
  const current = existing.find((row) => row.id === id);
  if (!current) {
    return { error: "That tag could not be found." };
  }
  if (tagNameConflicts(existing, name, id)) {
    return { error: "A tag with that name already exists." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_cake_tags")
    .update({ name })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "A tag with that name already exists." };
    }
    return { error: error.message };
  }

  revalidateCakeTags();
  return { error: null };
}

export async function setCakeTagActiveAction(
  id: string,
  isActive: boolean,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const existing = await listCakeTags();
  const current = existing.find((row) => row.id === id);
  if (!current) {
    return { error: "That tag could not be found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_cake_tags")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidateCakeTags();
  return { error: null };
}

export async function moveCakeTagAction(
  id: string,
  direction: "up" | "down",
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const existing = await listCakeTags();
  const next = moveCakeTagInOrder(existing, id, direction === "up" ? -1 : 1);

  const supabase = await createClient();
  for (const row of next) {
    const { error } = await supabase
      .from("library_cake_tags")
      .update({ sort_order: row.sortOrder })
      .eq("id", row.id);
    if (error) {
      return { error: error.message };
    }
  }

  revalidateCakeTags();
  return { error: null };
}
