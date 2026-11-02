"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import { assignmentsToPreserve, getKuchingBusinessDate, isAddonCollectionPast } from "@/workspaces/library/addons/collection-dates.mjs";

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

  const supabase = await createClient();
  const { data: collectionRows, error: collectionError } = await supabase
    .from("collections")
    .select("id, name, status, start_date, end_date");
  if (collectionError) return { error: "Could not verify collection dates. Refresh and try again." };
  const collectionsById = new Map((collectionRows ?? []).map((row) => [String(row.id), {
    id: String(row.id), name: String(row.name), status: String(row.status),
    startDate: row.start_date ? String(row.start_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
  }]));
  const businessToday = getKuchingBusinessDate();
  const requestedIds = [...new Set(String(formData.get("collection_ids") ?? "").split(",").map((value) => value.trim()).filter(Boolean))];
  for (const collectionId of requestedIds) {
    if (!collectionsById.has(collectionId)) return { error: "A collection is no longer available. Refresh and try again." };
  }
  const editableIds = requestedIds.filter((collectionId) => {
    const collection = collectionsById.get(collectionId);
    return collection !== undefined && !isAddonCollectionPast(collection, businessToday);
  });
  const editableSet = new Set(editableIds);
  const assignments: Array<Record<string, unknown>> = [];
  for (const collectionId of editableIds) {
    const availableFrom = parseDate(formData.get("from_" + collectionId));
    const availableUntil = parseDate(formData.get("until_" + collectionId));
    const defaultQuantity = parseInteger(formData.get("quantity_" + collectionId), 1);
    const mappingSort = parseInteger(formData.get("sort_" + collectionId), sortOrder);
    if (availableFrom === false || availableUntil === false || defaultQuantity === null || defaultQuantity < 0 || mappingSort === null) {
      return { error: "A collection assignment contains an invalid date, quantity, or sort order." };
    }
    if (availableFrom && availableUntil && availableUntil < availableFrom) return { error: "Season end must be on or after the start date." };
    assignments.push({
      collection_id: collectionId,
      is_available: formData.get("available_" + collectionId) === "on",
      customer_selectable: formData.get("selectable_" + collectionId) === "on",
      sort_order: mappingSort,
      available_from: availableFrom,
      available_until: availableUntil,
      is_default: formData.get("default_" + collectionId) === "on",
      default_quantity: defaultQuantity,
    });
  }

  if (id) {
    const complimentary = kind === "complimentary";
    const assignmentResult = complimentary
      ? await supabase.from("collection_complimentary_items")
          .select("collection_id, is_available, customer_selectable, is_default, default_quantity, sort_order, available_from, available_until")
          .eq("complimentary_item_type_id", id)
      : await supabase.from("collection_paid_addon_types")
          .select("collection_id, is_available, customer_selectable, sort_order, available_from, available_until")
          .eq("paid_addon_type_id", id);
    if (assignmentResult.error) return { error: "Could not preserve existing collection settings. No changes were saved." };
    const existing = (assignmentResult.data ?? []) as unknown as Array<Record<string, unknown>>;
    for (const row of assignmentsToPreserve(existing, editableSet, collectionsById, businessToday)) {
      assignments.push({
        collection_id: String(row.collection_id),
        is_available: Boolean(row.is_available),
        customer_selectable: Boolean(row.customer_selectable),
        sort_order: Number(row.sort_order ?? 0),
        available_from: row.available_from ? String(row.available_from) : null,
        available_until: row.available_until ? String(row.available_until) : null,
        ...(complimentary ? { is_default: Boolean(row.is_default), default_quantity: Number(row.default_quantity ?? 1) } : {}),
      });
    }
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
