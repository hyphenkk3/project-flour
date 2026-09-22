"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cakeSizePriceScheduleRangesOverlap } from "@/engines/orders/cake-size-price";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import { listCakeSizePricesForCake } from "@/workspaces/library/cakes/queries";
import {
  parseNonNegativeNumber,
  parseOptionalDate,
} from "@/workspaces/library/labels";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function revalidateCake(cakeId: string) {
  revalidatePath("/library", "layout");
  revalidatePath(`/library/cakes/${cakeId}`);
  revalidatePath(`/library/cakes/${cakeId}/edit`);
}

function parseScheduleDates(
  formData: FormData,
): { from: string; to: string | null } | string {
  const from = parseOptionalDate(formData.get("effective_from"));
  if (!from) {
    return "Enter an effective from date.";
  }
  const toRaw = String(formData.get("effective_to") ?? "").trim();
  const to = toRaw ? parseOptionalDate(formData.get("effective_to")) : null;
  if (toRaw && !to) {
    return "Enter a valid effective to date.";
  }
  if (to && to < from) {
    return "Effective to cannot be before effective from.";
  }
  return { from, to };
}

async function assertNoOverlap(input: {
  cakeId: string;
  cakeSizeId: string;
  from: string;
  to: string | null;
  ignoreId?: string;
}): Promise<string | null> {
  const existing = (await listCakeSizePricesForCake(input.cakeId)).filter(
    (row) => row.cakeSizeId === input.cakeSizeId && row.id !== input.ignoreId,
  );
  const next = { effectiveFrom: input.from, effectiveTo: input.to };
  if (
    existing.some((row) =>
      cakeSizePriceScheduleRangesOverlap(
        {
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
        },
        next,
      ),
    )
  ) {
    return "That date range overlaps another scheduled price for this size.";
  }
  return null;
}

export async function createCakeSizePriceAction(
  cakeId: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const cakeSizeId = String(formData.get("cake_size_id") ?? "").trim();
  if (!cakeSizeId) {
    return { error: "Choose a cake size." };
  }
  const dates = parseScheduleDates(formData);
  if (typeof dates === "string") {
    return { error: dates };
  }
  const priceRaw = String(formData.get("schedule_price") ?? "").trim();
  if (!priceRaw) {
    return { error: "Enter a price." };
  }
  const price = parseNonNegativeNumber(formData.get("schedule_price"));
  const overlap = await assertNoOverlap({
    cakeId,
    cakeSizeId,
    from: dates.from,
    to: dates.to,
  });
  if (overlap) return { error: overlap };

  const supabase = await createClient();
  const { data: size, error: sizeError } = await supabase
    .from("library_cake_sizes")
    .select("id")
    .eq("id", cakeSizeId)
    .eq("cake_id", cakeId)
    .maybeSingle();
  if (sizeError) {
    return { error: sizeError.message };
  }
  if (!size) {
    return { error: "That size no longer belongs to this cake." };
  }

  const { error } = await supabase.from("library_cake_size_prices").insert({
    cake_size_id: cakeSizeId,
    price,
    effective_from: dates.from,
    effective_to: dates.to,
  });
  if (error) {
    return { error: error.message };
  }
  revalidateCake(cakeId);
  return { error: null };
}

export async function updateCakeSizePriceAction(
  cakeId: string,
  scheduleId: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const cakeSizeId = String(formData.get("cake_size_id") ?? "").trim();
  if (!cakeSizeId || !scheduleId) {
    return { error: "Choose a scheduled price to update." };
  }
  const dates = parseScheduleDates(formData);
  if (typeof dates === "string") {
    return { error: dates };
  }
  const priceRaw = String(formData.get("schedule_price") ?? "").trim();
  if (!priceRaw) {
    return { error: "Enter a price." };
  }
  const price = parseNonNegativeNumber(formData.get("schedule_price"));
  const overlap = await assertNoOverlap({
    cakeId,
    cakeSizeId,
    from: dates.from,
    to: dates.to,
    ignoreId: scheduleId,
  });
  if (overlap) return { error: overlap };

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_cake_size_prices")
    .update({
      price,
      effective_from: dates.from,
      effective_to: dates.to,
    })
    .eq("id", scheduleId)
    .eq("cake_size_id", cakeSizeId);
  if (error) {
    return { error: error.message };
  }
  revalidateCake(cakeId);
  return { error: null };
}

export async function deleteCakeSizePriceAction(
  cakeId: string,
  scheduleId: string,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  if (!scheduleId) {
    return { error: "Choose a scheduled price to delete." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("library_cake_size_prices")
    .delete()
    .eq("id", scheduleId);
  if (error) {
    return { error: error.message };
  }
  revalidateCake(cakeId);
  return { error: null };
}
