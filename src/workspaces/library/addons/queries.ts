import { createClient } from "@/lib/supabase/server";
import type {
  AddonAssignment,
  AddonCatalogueSnapshot,
  ComplimentaryCatalogItem,
  PaidAddonCatalogItem,
} from "@/workspaces/library/addons/types";

type Row = Record<string, unknown>;

function mapAssignment(row: Row, collectionKey = "collection_id"): AddonAssignment {
  return {
    collectionId: String(row[collectionKey] ?? ""),
    isAvailable: Boolean(row.is_available),
    customerSelectable: Boolean(row.customer_selectable),
    sortOrder: Number(row.sort_order ?? 0),
    availableFrom: row.available_from ? String(row.available_from) : null,
    availableUntil: row.available_until ? String(row.available_until) : null,
    isDefault: Boolean(row.is_default),
    defaultQuantity: Number(row.default_quantity ?? 1),
  };
}

export async function loadAddonCatalogue(): Promise<AddonCatalogueSnapshot> {
  const supabase = await createClient();
  const [collectionsResult, complimentaryResult, complimentaryMapResult, paidResult, paidMapResult] = await Promise.all([
    supabase.from("collections").select("id, name, status, start_date, end_date").order("name"),
    supabase.from("complimentary_item_types").select("id, code, name, is_active").order("name"),
    supabase.from("collection_complimentary_items").select("collection_id, complimentary_item_type_id, is_available, is_default, customer_selectable, default_quantity, sort_order, available_from, available_until"),
    supabase.from("paid_addon_types").select("id, code, name, unit_price, financial_shorthand, is_active, sort_order, max_quantity").order("sort_order").order("name"),
    supabase.from("collection_paid_addon_types").select("collection_id, paid_addon_type_id, is_available, customer_selectable, sort_order, available_from, available_until"),
  ]);
  for (const result of [collectionsResult, complimentaryResult, complimentaryMapResult, paidResult, paidMapResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const compAssignments = (complimentaryMapResult.data ?? []) as Row[];
  const paidAssignments = (paidMapResult.data ?? []) as Row[];
  const complimentary = ((complimentaryResult.data ?? []) as Row[]).map((row): ComplimentaryCatalogItem => ({
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    isActive: Boolean(row.is_active),
    assignments: compAssignments
      .filter((assignment) => assignment.complimentary_item_type_id === row.id)
      .map((assignment) => mapAssignment(assignment)),
  }));
  const paid = ((paidResult.data ?? []) as Row[]).map((row): PaidAddonCatalogItem => ({
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    unitPrice: Number(row.unit_price),
    financialShorthand: String(row.financial_shorthand),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 0),
    maxQuantity: Number(row.max_quantity ?? 1),
    assignments: paidAssignments
      .filter((assignment) => assignment.paid_addon_type_id === row.id)
      .map((assignment) => mapAssignment(assignment)),
  }));

  return {
    collections: ((collectionsResult.data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      status: String(row.status),
      startDate: row.start_date ? String(row.start_date) : null,
      endDate: row.end_date ? String(row.end_date) : null,
    })),
    complimentary,
    paid,
  };
}
