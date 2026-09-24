import { workspaceFulfilmentSectionTitle } from "@/engines/orders/fulfilment";
import {
  getEffectiveAdjustments,
  RM10_CARD_CODE,
  singaporeDateFromIso,
} from "@/engines/orders/promotions";
import {
  buildRm10LibraryRows,
  normalizePhysicalVoucherNumber,
  redemptionFromAdjustmentMetadata,
} from "@/engines/vouchers/physical-rm10";
import { createClient } from "@/lib/supabase/server";
import type {
  Rm10LibraryCard,
  Rm10LibraryRedemption,
  Rm10LibraryRow,
} from "@/types/rm10-physical-voucher";
import type { StorefrontOrderFulfilmentMethod } from "@/types/storefront";

type ManagedCardRow = {
  id: string;
  voucher_number: string;
  voucher_number_normalized: string;
  expiry_date: string | null;
};

type AdjustmentRow = {
  id: string;
  order_id: string;
  amount: number | string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
  status: string | null;
  reverses_adjustment_id: string | null;
  orders:
    | {
        id: string;
        order_number: string;
        guest_name: string | null;
        created_at: string;
        pickup_date: string | null;
        fulfilment_method: string | null;
      }
    | {
        id: string;
        order_number: string;
        guest_name: string | null;
        created_at: string;
        pickup_date: string | null;
        fulfilment_method: string | null;
      }[]
    | null;
};

function firstOrder(orders: AdjustmentRow["orders"]) {
  if (!orders) return null;
  return Array.isArray(orders) ? (orders[0] ?? null) : orders;
}

function mapManagedCard(row: ManagedCardRow): Rm10LibraryCard {
  return {
    id: row.id,
    voucherNumber: row.voucher_number,
    voucherNumberNormalized:
      normalizePhysicalVoucherNumber(row.voucher_number_normalized) ??
      normalizePhysicalVoucherNumber(row.voucher_number) ??
      row.voucher_number_normalized,
    expiryDate: row.expiry_date,
  };
}

function mapRedemption(
  row: AdjustmentRow,
  staffNames: Map<string, string>,
): Rm10LibraryRedemption | null {
  const extracted = redemptionFromAdjustmentMetadata(row.metadata);
  if (!extracted) {
    return null;
  }
  const order = firstOrder(row.orders);
  const fulfilmentMethod = order?.fulfilment_method
    ? workspaceFulfilmentSectionTitle(
        order.fulfilment_method as StorefrontOrderFulfilmentMethod,
      )
    : null;
  const overrideByName = row.created_by
    ? staffNames.get(row.created_by) ?? null
    : null;

  return {
    adjustmentId: row.id,
    orderId: order?.id ?? row.order_id,
    orderNumber: order?.order_number?.trim() || "—",
    customerName: order?.guest_name?.trim() || "—",
    orderDate: order ? singaporeDateFromIso(order.created_at) : "—",
    redeemedDate: singaporeDateFromIso(row.created_at),
    fulfilmentDate: order?.pickup_date ?? null,
    fulfilmentMethodLabel: fulfilmentMethod,
    discountAmount: Number(row.amount),
    voucherNumber: extracted.voucherNumber,
    expiryDate: extracted.expiryDate,
    ownerOverride: extracted.ownerOverride,
    overrideByName,
  };
}

export async function listRm10LibraryRows(): Promise<Rm10LibraryRow[]> {
  const supabase = await createClient();

  const [cardsResult, adjustmentsResult] = await Promise.all([
    supabase
      .from("physical_discount_vouchers")
      .select(
        "id, voucher_number, voucher_number_normalized, expiry_date",
      )
      .eq("library_managed", true)
      .order("voucher_number_normalized", { ascending: true }),
    supabase
      .from("order_adjustments")
      .select(
        "id, order_id, amount, metadata, created_at, created_by, status, reverses_adjustment_id, orders!inner (id, order_number, guest_name, created_at, pickup_date, fulfilment_method)",
      )
      .eq("code", RM10_CARD_CODE),
  ]);

  if (cardsResult.error) {
    throw new Error(cardsResult.error.message);
  }
  if (adjustmentsResult.error) {
    throw new Error(adjustmentsResult.error.message);
  }

  const adjustmentRows = adjustmentsResult.data as AdjustmentRow[];
  const staffIds = [
    ...new Set(
      adjustmentRows
        .map((row) => row.created_by)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const staffNames = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows, error: staffError } = await supabase
      .from("staff_profiles")
      .select("id, display_name")
      .in("id", staffIds);
    if (staffError) {
      throw new Error(staffError.message);
    }
    for (const staff of staffRows ?? []) {
      const name = String(staff.display_name ?? "").trim();
      if (name) {
        staffNames.set(String(staff.id), name);
      }
    }
  }

  const managedCards = (cardsResult.data as ManagedCardRow[]).map(mapManagedCard);
  const redemptions = getEffectiveAdjustments(
    adjustmentRows.map((row) => ({
      row,
      status: row.status ?? "active",
      reversesAdjustmentId: row.reverses_adjustment_id,
    })),
  )
    .map((item) => mapRedemption(item.row, staffNames))
    .filter((row): row is Rm10LibraryRedemption => row !== null);

  return buildRm10LibraryRows({
    managedCards,
    redemptions,
    today: singaporeDateFromIso(new Date().toISOString()),
  });
}

export async function getManagedRm10CardByNormalizedNumber(
  normalized: string,
): Promise<Rm10LibraryCard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("physical_discount_vouchers")
    .select("id, voucher_number, voucher_number_normalized, expiry_date")
    .eq("library_managed", true)
    .eq("voucher_number_normalized", normalized)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }
  return mapManagedCard(data as ManagedCardRow);
}

export async function listExistingRm10NormalizedNumbers(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("physical_discount_vouchers")
    .select("voucher_number, voucher_number_normalized");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) =>
      normalizePhysicalVoucherNumber(String(row.voucher_number_normalized ?? "")) ??
      normalizePhysicalVoucherNumber(String(row.voucher_number ?? "")),
    )
    .filter((value): value is string => Boolean(value));
}
