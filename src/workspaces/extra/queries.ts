import {
  isExtraAvailable,
  type ExtraLifecycle,
} from "@/engines/extra/availability";
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
  pickup_through_at: string | null;
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
  pickup_through_at,
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
    pickupThroughAt: row.pickup_through_at,
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
  return ((data ?? []) as unknown as ExtraStockRow[]).map((row) =>
    mapExtraStockRow(row, now),
  );
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
    sizes: [...(cake.library_cake_sizes ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((size) => ({ id: size.id, label: size.label })),
  }));
}
