"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";

async function requireActiveOwner() {
  const staff = await requireStaff();
  if (staff.role.code !== "owner" || !staff.isActive || staff.archivedAt) {
    redirect("/home");
  }
}

function parseDate(value: FormDataEntryValue | null): string | null | false {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : false;
}

function parseInteger(value: FormDataEntryValue | null, fallback: number): number | null {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function saveAddonCatalogueItemAction(
  _previous: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireActiveOwner();
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "complimentary" && kind !== "paid") {
    return { error: "Choose a valid add-on catalogue." };
  }
  const code = String(formData.get("code") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim() || null;
  const sortOrder = parseInteger(formData.get("sort_order"), 0);
  const maxQuantity = parseInteger(formData.get("max_quantity"), 1);
  const unitPrice = Number(String(formData.get("unit_price") ?? "").trim());
  const shorthand = String(formData.get("financial_shorthand") ?? "").trim();
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(code) || !name) {
    return { error: "Enter a name and a lowercase code using letters, numbers, and underscores." };
  }
  if (sortOrder === null) return { error: "Sort order must be a whole number." };
  if (kind === "paid" && (!Number.isFinite(unitPrice) || unitPrice < 0 || !shorthand || maxQuantity === null || maxQuantity < 1)) {
    return { error: "Enter a non-negative price, shorthand, and quantity limit of at least one." };
  }

  const collectionIds = String(formData.get("collection_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const assignments: Array<Record<string, unknown>> = [];
  for (const collectionId of collectionIds) {
    const availableFrom = parseDate(formData.get(`from_${collectionId}`));
    const availableUntil = parseDate(formData.get(`until_${collectionId}`));
    const defaultQuantity = parseInteger(formData.get(`quantity_${collectionId}`), 1);
    const mappingSort = parseInteger(formData.get(`sort_${collectionId}`), sortOrder);
    if (availableFrom === false || availableUntil === false || defaultQuantity === null || defaultQuantity < 0 || mappingSort === null) {
      return { error: "A collection assignment contains an invalid date, quantity, or sort order." };
    }
    if (availableFrom && availableUntil && availableUntil < availableFrom) {
      return { error: "Season end must be on or after the start date." };
    }
    assignments.push({
      collection_id: collectionId,
      is_available: formData.get(`available_${collectionId}`) === "on",
      customer_selectable: formData.get(`selectable_${collectionId}`) === "on",
      sort_order: mappingSort,
      available_from: availableFrom,
      available_until: availableUntil,
      is_default: formData.get(`default_${collectionId}`) === "on",
      default_quantity: defaultQuantity,
    });
  }

  const item: Record<string, unknown> = {
    id,
    code,
    name,
    is_active: formData.get("is_active") === "on",
    sort_order: sortOrder,
  };
  if (kind === "paid") {
    Object.assign(item, {
      unit_price: unitPrice,
      financial_shorthand: shorthand,
      max_quantity: maxQuantity,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_save_addon_catalogue_item", {
    p_kind: kind,
    p_item: item,
    p_collection_assignments: assignments,
  });
  if (error) return { error: error.message };

  revalidatePath("/library/addons");
  revalidatePath("/order");
  revalidatePath("/order/checkout");
  revalidatePath("/extra");
  revalidatePath("/extra/checkout");
  return { error: null, success: "Saved." };
}

export async function createAddonCatalogueItemAction(
  _previous: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const result = await saveAddonCatalogueItemAction(_previous, formData);
  if (!result.error) redirect("/library/addons?saved=1");
  return result;
}
