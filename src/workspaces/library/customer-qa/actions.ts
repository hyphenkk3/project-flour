"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  FAQ_ANSWER_REQUIRED,
  FAQ_QUESTION_REQUIRED,
  moveFaqItemInOrder,
  nextFaqDisplayOrder,
  normalizeFaqAnswer,
  normalizeFaqQuestion,
} from "@/engines/storefront/faq";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import { listStorefrontFaqItems } from "@/workspaces/library/customer-qa/queries";

async function requireFaqManager() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function revalidateFaq() {
  revalidatePath("/library", "layout");
  revalidatePath("/faq");
}

function readActive(formData: FormData): boolean {
  return String(formData.get("is_active") ?? "") === "on";
}

export async function createStorefrontFaqItemAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireFaqManager();
  const question = normalizeFaqQuestion(String(formData.get("question") ?? ""));
  const answer = normalizeFaqAnswer(String(formData.get("answer") ?? ""));
  if (!question) return { error: FAQ_QUESTION_REQUIRED };
  if (!answer) return { error: FAQ_ANSWER_REQUIRED };

  const existing = await listStorefrontFaqItems();
  const supabase = await createClient();
  const { error } = await supabase.from("storefront_faq_items").insert({
    question,
    answer,
    is_active: readActive(formData),
    display_order: nextFaqDisplayOrder(existing),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "A question with that wording already exists." };
    }
    return { error: error.message };
  }

  revalidateFaq();
  return { error: null };
}

export async function updateStorefrontFaqItemAction(
  id: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireFaqManager();
  const question = normalizeFaqQuestion(String(formData.get("question") ?? ""));
  const answer = normalizeFaqAnswer(String(formData.get("answer") ?? ""));
  if (!question) return { error: FAQ_QUESTION_REQUIRED };
  if (!answer) return { error: FAQ_ANSWER_REQUIRED };

  const existing = await listStorefrontFaqItems();
  if (!existing.some((row) => row.id === id)) {
    return { error: "That question could not be found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("storefront_faq_items")
    .update({
      question,
      answer,
      is_active: readActive(formData),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "A question with that wording already exists." };
    }
    return { error: error.message };
  }

  revalidateFaq();
  return { error: null };
}

export async function setStorefrontFaqItemActiveAction(
  id: string,
  isActive: boolean,
): Promise<LibraryActionState> {
  await requireFaqManager();
  const existing = await listStorefrontFaqItems();
  if (!existing.some((row) => row.id === id)) {
    return { error: "That question could not be found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("storefront_faq_items")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidateFaq();
  return { error: null };
}

export async function moveStorefrontFaqItemAction(
  id: string,
  direction: "up" | "down",
): Promise<LibraryActionState> {
  await requireFaqManager();
  const existing = await listStorefrontFaqItems();
  const next = moveFaqItemInOrder(existing, id, direction === "up" ? -1 : 1);

  const supabase = await createClient();
  for (const row of next) {
    const { error } = await supabase
      .from("storefront_faq_items")
      .update({ display_order: row.displayOrder })
      .eq("id", row.id);
    if (error) {
      return { error: error.message };
    }
  }

  revalidateFaq();
  return { error: null };
}
