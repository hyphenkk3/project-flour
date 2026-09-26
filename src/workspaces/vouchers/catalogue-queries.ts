import {
  emptyCatalogueRules,
  parseCatalogueOrderType,
} from "@/engines/vouchers/catalogue-voucher";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import { cache } from "react";
import type {
  CatalogueVoucherRecord,
  CatalogueVoucherRuleType,
  CatalogueVoucherRules,
} from "@/types/catalogue-voucher";
import type { LibraryVoucherStatus, LibraryVoucherType } from "@/types/library-voucher";
import { loadCatalogueRulesForVouchers } from "@/workspaces/library/vouchers/rule-queries";

type PublicRuleValue = {
  cake_id?: string | null;
  cake_name?: string | null;
  cake_size_id?: string | null;
  size_label?: string | null;
  value_code?: string | null;
};

type PublicRule = {
  rule_type?: CatalogueVoucherRuleType;
  date_from?: string | null;
  date_until?: string | null;
  amount?: number | string | null;
  values?: PublicRuleValue[];
};

type PublicVoucher = {
  id: string;
  code: string;
  voucher_type: LibraryVoucherType;
  value: number | string;
  valid_from: string | null;
  valid_until: string | null;
  status: LibraryVoucherStatus;
  image_url?: string | null;
  asset_id?: string | null;
  rules?: PublicRule[];
};

function rulesFromPublic(raw: PublicRule[] | undefined): CatalogueVoucherRules {
  const next = emptyCatalogueRules();
  for (const rule of raw ?? []) {
    if (rule.rule_type === "order_date") {
      next.orderDate = {
        from: rule.date_from ?? null,
        until: rule.date_until ?? null,
      };
    } else if (rule.rule_type === "fulfilment_date") {
      next.fulfilmentDate = {
        from: rule.date_from ?? null,
        until: rule.date_until ?? null,
      };
    } else if (rule.rule_type === "minimum_cake_subtotal") {
      next.minimumCakeSubtotal =
        rule.amount == null ? null : Number(rule.amount);
    } else if (rule.rule_type === "cake") {
      next.cakeIds = (rule.values ?? [])
        .map((value) => value.cake_id)
        .filter((id): id is string => Boolean(id));
      next.cakeNames = (rule.values ?? [])
        .map((value) => value.cake_name)
        .filter((name): name is string => Boolean(name));
    } else if (rule.rule_type === "cake_size") {
      next.sizeLabels = (rule.values ?? [])
        .map((value) => value.size_label)
        .filter((label): label is string => Boolean(label));
    } else if (rule.rule_type === "order_type") {
      next.orderTypes = (rule.values ?? [])
        .map((value) => parseCatalogueOrderType(value.value_code))
        .filter((value): value is NonNullable<typeof value> => Boolean(value));
    }
  }
  return next;
}

function mapPublicVoucher(row: PublicVoucher): CatalogueVoucherRecord {
  return {
    id: row.id,
    code: row.code,
    voucherType: row.voucher_type,
    value: Number(row.value),
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    status: row.status,
    imageUrl: row.image_url ?? null,
    assetId: row.asset_id ?? null,
    rules: rulesFromPublic(row.rules),
  };
}

async function loadPublicCatalogueVouchers(): Promise<CatalogueVoucherRecord[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("list_public_catalogue_vouchers");
    if (error) {
      throw new Error(error.message);
    }
    const rows = Array.isArray(data) ? data : [];
    return (rows as PublicVoucher[]).map(mapPublicVoucher);
  } catch {
    return [];
  }
}

const readPublicCatalogueVouchers = cache(loadPublicCatalogueVouchers);

export async function listPublicCatalogueVouchers(): Promise<
  CatalogueVoucherRecord[]
> {
  return readPublicCatalogueVouchers();
}

export async function listStaffCatalogueVouchers(): Promise<
  CatalogueVoucherRecord[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_vouchers")
    .select(
      "id, code, voucher_type, value, valid_from, valid_until, status, image_url, asset_id",
    )
    .in("voucher_type", ["fixed_amount", "percentage"])
    .order("code");
  if (error) {
    throw new Error(error.message);
  }
  const rows = (data ?? []) as PublicVoucher[];
  const rules = await loadCatalogueRulesForVouchers(
    supabase,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    ...mapPublicVoucher(row),
    rules: rules.get(row.id) ?? emptyCatalogueRules(),
  }));
}

export async function getCatalogueVoucherForApply(
  voucherId: string,
): Promise<CatalogueVoucherRecord | null> {
  const admin = createServiceClient();
  const [voucherResult, rules] = await Promise.all([
    admin
      .from("library_vouchers")
      .select(
        "id, code, voucher_type, value, valid_from, valid_until, status, image_url, asset_id",
      )
      .eq("id", voucherId)
      .maybeSingle(),
    loadCatalogueRulesForVouchers(admin as never, [voucherId]),
  ]);
  if (voucherResult.error) {
    throw new Error(voucherResult.error.message);
  }
  if (!voucherResult.data) return null;
  return {
    ...mapPublicVoucher(voucherResult.data as PublicVoucher),
    rules: rules.get(voucherId) ?? emptyCatalogueRules(),
  };
}

export type CatalogueApplyOrder = {
  id: string;
  createdAt: string;
  pickupDate: string;
  extraStockId: string | null;
  items: Array<{
    cakeId: string;
    cakeSizeId: string;
    sizeLabel: string;
    quantity: number;
    unitPrice: number;
  }>;
  adjustments: Array<{
    code: string | null;
    status?: string;
    reversesAdjustmentId?: string | null;
    label?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
};

export async function loadCatalogueApplyOrder(
  orderId: string,
): Promise<CatalogueApplyOrder | null> {
  const admin = createServiceClient();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, created_at, pickup_date, customer_id, extra_stock_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    throw new Error(orderError.message);
  }
  if (!order || order.customer_id) return null;

  const [{ data: items, error: itemError }, { data: adjustments, error: adjError }] =
    await Promise.all([
      admin
        .from("order_items")
        .select("cake_id, cake_size_id, size_label, quantity, unit_price")
        .eq("order_id", orderId),
      admin
        .from("order_adjustments")
        .select("code, status, reverses_adjustment_id, label, metadata")
        .eq("order_id", orderId),
    ]);
  if (itemError) throw new Error(itemError.message);
  if (adjError) throw new Error(adjError.message);

  return {
    id: order.id,
    createdAt: order.created_at,
    pickupDate: order.pickup_date,
    extraStockId: order.extra_stock_id ?? null,
    items: (items ?? []).map((item) => ({
      cakeId: String(item.cake_id ?? ""),
      cakeSizeId: String(item.cake_size_id ?? ""),
      sizeLabel: String(item.size_label ?? ""),
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unit_price) || 0,
    })),
    adjustments: (adjustments ?? []).map((row) => ({
      code: (row.code as string | null) ?? null,
      status: (row.status as string | null) ?? "active",
      reversesAdjustmentId:
        (row.reverses_adjustment_id as string | null) ?? null,
      label: (row.label as string | null) ?? null,
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : null,
    })),
  };
}

export function voucherRelevantToCake(
  voucher: CatalogueVoucherRecord,
  cakeId: string,
): boolean {
  return voucher.rules.cakeIds.length === 0 || voucher.rules.cakeIds.includes(cakeId);
}
