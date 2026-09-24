import { workspaceFulfilmentSectionTitle } from "@/engines/orders/fulfilment";
import {
  getEffectiveAdjustments,
  RM10_CARD_CODE,
  singaporeDateFromIso,
} from "@/engines/orders/promotions";
import {
  buildRm10LibraryRows,
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
    voucherNumberNormalized: row.voucher_number_normalized,
    expiryDate: row.expiry_date,
  };
}

function mapRedemption(row: AdjustmentRow): Rm10LibraryRedemption | null {
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
        "id, order_id, amount, metadata, created_at, status, reverses_adjustment_id, orders!inner (id, order_number, guest_name, created_at, pickup_date, fulfilment_method)",
      )
      .eq("code", RM10_CARD_CODE),
  ]);

  if (cardsResult.error) {
    throw new Error(cardsResult.error.message);
  }
  if (adjustmentsResult.error) {
    throw new Error(adjustmentsResult.error.message);
  }

  const managedCards = (cardsResult.data as ManagedCardRow[]).map(mapManagedCard);
  const redemptions = getEffectiveAdjustments(
    (adjustmentsResult.data as AdjustmentRow[]).map((row) => ({
      row,
      status: row.status ?? "active",
      reversesAdjustmentId: row.reverses_adjustment_id,
    })),
  )
    .map((item) => mapRedemption(item.row))
    .filter((row): row is Rm10LibraryRedemption => row !== null);

  return buildRm10LibraryRows({
    managedCards,
    redemptions,
    today: singaporeDateFromIso(new Date().toISOString()),
  });
}

export async function listExistingRm10NormalizedNumbers(
  normalized: string[],
): Promise<string[]> {
  if (normalized.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("physical_discount_vouchers")
    .select("voucher_number_normalized")
    .in("voucher_number_normalized", normalized);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => String(row.voucher_number_normalized));
}
