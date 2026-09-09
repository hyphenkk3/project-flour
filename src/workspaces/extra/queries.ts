import {
  isExtraAvailable,
  type ExtraLifecycle,
} from "@/engines/extra/availability";
import { sortCakeSizesByNumericLabel } from "@/engines/menu/cake-size-order";
import { createClient } from "@/lib/supabase/server";
import type { ExtraCakeOption, ExtraStockUnit } from "@/workspaces/extra/types";

type ExtraStockRow = {
  id: string;
  lifecycle: ExtraLifecycle;
  cake_name: string;
  size_label: string;
  library_cake_id: string | null;
  library_cake_size_id: string | null;
  prepared_on: string | null;
  pickup_available_from_at: string | null;
  pickup_through_at: string | null;
  sold_at: string | null;
  cut_into_slices_at: string | null;
  note: string | null;
  proposed_at: string;
  proposed_by: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  reject_reason: string | null;
  proposer?: { display_name: string | null } | null;
  confirmer?: { display_name: string | null } | null;
  rejecter?: { display_name: string | null } | null;
};

const EXTRA_SELECT = `
  id,
  lifecycle,
  cake_name,
  size_label,
  library_cake_id,
  library_cake_size_id,
  prepared_on,
  pickup_available_from_at,
  pickup_through_at,
  sold_at,
  cut_into_slices_at,
  note,
  proposed_at,
  proposed_by,
  confirmed_at,
  confirmed_by,
  rejected_at,
  rejected_by,
  reject_reason,
  proposer:staff_profiles!proposed_by ( display_name ),
  confirmer:staff_profiles!confirmed_by ( display_name ),
  rejecter:staff_profiles!rejected_by ( display_name )
`;

function staffName(
  embed: { display_name: string | null } | { display_name: string | null }[] | null | undefined,
): string | null {
  if (!embed) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.display_name ?? null;
}

export function mapExtraStockRow(
  row: ExtraStockRow,
  now = new Date(),
): ExtraStockUnit {
  return {
    id: row.id,
    lifecycle: row.lifecycle,
    cakeName: row.cake_name,
    sizeLabel: row.size_label,
    libraryCakeId: row.library_cake_id,
    libraryCakeSizeId: row.library_cake_size_id,
    preparedOn: row.prepared_on,
    pickupAvailableFromAt: row.pickup_available_from_at,
    pickupThroughAt: row.pickup_through_at,
    soldAt: row.sold_at,
    cutIntoSlicesAt: row.cut_into_slices_at,
    assignedOrderId: null,
    assignedOrderNumber: null,
    assignedGuestName: null,
    note: row.note,
    proposedAt: row.proposed_at,
    proposedBy: row.proposed_by,
    proposedByName: staffName(row.proposer),
    confirmedAt: row.confirmed_at,
    confirmedBy: row.confirmed_by,
    confirmedByName: staffName(row.confirmer),
    rejectedAt: row.rejected_at,
    rejectedBy: row.rejected_by,
    rejectedByName: staffName(row.rejecter),
    rejectReason: row.reject_reason,
    available: isExtraAvailable({
      lifecycle: row.lifecycle,
      pickupThroughAt: row.pickup_through_at,
      soldAt: row.sold_at,
      cutIntoSlicesAt: row.cut_into_slices_at,
      now,
    }),
  };
}

export async function listExtraStockUnits(): Promise<ExtraStockUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("extra_stock")
    .select(EXTRA_SELECT)
    .order("proposed_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const now = new Date();
  const units = ((data ?? []) as unknown as ExtraStockRow[]).map((row) =>
    mapExtraStockRow(row, now),
  );
  const soldIds = units.filter((unit) => unit.soldAt).map((unit) => unit.id);
  if (soldIds.length === 0) return units;

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, guest_name, extra_stock_id")
    .in("extra_stock_id", soldIds);
  if (orderError) {
    throw new Error(orderError.message);
  }

  const byExtra = new Map<
    string,
    { id: string; order_number: string; guest_name: string | null }
  >();
  for (const order of orders ?? []) {
    const extraId = (order as { extra_stock_id?: string | null }).extra_stock_id;
    if (!extraId) continue;
    byExtra.set(extraId, {
      id: (order as { id: string }).id,
      order_number: String((order as { order_number?: string }).order_number ?? ""),
      guest_name: (order as { guest_name?: string | null }).guest_name ?? null,
    });
  }

  return units.map((unit) => {
    const linked = byExtra.get(unit.id);
    if (!linked) return unit;
    return {
      ...unit,
      assignedOrderId: linked.id,
      assignedOrderNumber: linked.order_number || null,
      assignedGuestName: linked.guest_name,
    };
  });
}

/**
 * Lightweight count of EXTRA awaiting Bakery review.
 * Canonical: lifecycle === "proposed" (same as ExtraBoard Proposed).
 */
export async function countExtraStockProposed(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("extra_stock")
    .select("id", { count: "exact", head: true })
    .eq("lifecycle", "proposed");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export type ExtraAssignableOrder = {
  id: string;
  orderNumber: string;
  guestName: string;
  pickupDate: string;
  pickupTime: string;
  extraStockId: string | null;
  itemSummary: string;
};

export async function findAssignableOrderForExtra(
  query: string,
): Promise<ExtraAssignableOrder | null> {
  const raw = query.trim();
  if (!raw) return null;
  const supabase = await createClient();
  let lookup = supabase
    .from("orders")
    .select(
      "id, order_number, guest_name, pickup_date, pickup_time, extra_stock_id, status, order_items ( cake_name, size_label, quantity )",
    )
    .neq("status", "cancelled")
    .limit(2);

  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw,
    );
  lookup = uuid
    ? lookup.eq("id", raw)
    : lookup.ilike("order_number", raw);

  const { data, error } = await lookup;
  if (error) {
    throw new Error(error.message);
  }
  const row = (data ?? [])[0];
  if (!row || (data ?? []).length !== 1) return null;

  const items = (
    (row as { order_items?: Array<{ cake_name: string; size_label: string; quantity: number }> })
      .order_items ?? []
  )
    .map((item) => `${item.cake_name} ${item.size_label} ×${item.quantity}`)
    .join(", ");

  return {
    id: (row as { id: string }).id,
    orderNumber: String((row as { order_number?: string }).order_number ?? ""),
    guestName: String((row as { guest_name?: string | null }).guest_name ?? "Guest"),
    pickupDate: String((row as { pickup_date?: string }).pickup_date ?? ""),
    pickupTime: String((row as { pickup_time?: string }).pickup_time ?? ""),
    extraStockId: (row as { extra_stock_id?: string | null }).extra_stock_id ?? null,
    itemSummary: items || "No cake lines",
  };
}

export async function listExtraCakeOptions(): Promise<ExtraCakeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cakes")
    .select(
      "id, name, status, library_cake_sizes ( id, label, sort_order )",
    )
    .in("status", ["active", "seasonal"])
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  type SizeRow = { id: string; label: string; sort_order: number };
  type CakeRow = {
    id: string;
    name: string;
    library_cake_sizes?: SizeRow[] | null;
  };

  return ((data ?? []) as CakeRow[]).map((cake) => ({
    id: cake.id,
    name: cake.name,
    sizes: sortCakeSizesByNumericLabel(
      cake.library_cake_sizes ?? [],
      (size) => size.label,
    ).map((size) => ({ id: size.id, label: size.label })),
  }));
}
