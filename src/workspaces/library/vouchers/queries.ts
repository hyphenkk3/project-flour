import { emptyCatalogueRules } from "@/engines/vouchers/catalogue-voucher";
import { createClient } from "@/lib/supabase/server";
import type {
  LibraryVoucher,
  LibraryVoucherStatus,
  LibraryVoucherType,
} from "@/types/library-voucher";
import { loadCatalogueRulesForVouchers } from "@/workspaces/library/vouchers/rule-queries";

type VoucherRow = {
  id: string;
  code: string;
  voucher_type: LibraryVoucherType;
  value: number | string;
  valid_from: string | null;
  valid_until: string | null;
  image_url: string | null;
  asset_id: string | null;
  status: LibraryVoucherStatus;
  created_at: string;
  updated_at: string;
  redemption_limit?: number | string | null;
};

export type CatalogueRedemptionSummary = {
  voucherId: string;
  redemptionLimit: number | null;
  active: number;
  released: number;
  remaining: number | null;
};

export type CatalogueRedemptionEvent = {
  redemptionId: string;
  voucherId: string;
  orderId: string;
  orderNumber: string;
  guestName: string;
  event: "redeemed" | "released";
  discountAmount: number;
  status: "redeemed" | "released";
  occurredAt: string;
  releaseReason: string | null;
};

export function mapVoucher(row: VoucherRow): LibraryVoucher {
  const rawLimit = row.redemption_limit;
  const limit =
    rawLimit == null || rawLimit === ""
      ? null
      : Number(rawLimit);
  return {
    id: row.id,
    code: row.code,
    voucherType: row.voucher_type,
    value: Number(row.value),
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    imageUrl: row.image_url,
    assetId: row.asset_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rules: emptyCatalogueRules(),
    redemptionLimit: Number.isInteger(limit) && (limit as number) > 0 ? (limit as number) : null,
  };
}

function mapRedemptionSummary(row: {
  voucher_id?: string;
  redemption_limit?: number | null;
  active?: number;
  released?: number;
  remaining?: number | null;
}): CatalogueRedemptionSummary {
  return {
    voucherId: String(row.voucher_id ?? ""),
    redemptionLimit:
      row.redemption_limit == null ? null : Number(row.redemption_limit),
    active: Number(row.active ?? 0),
    released: Number(row.released ?? 0),
    remaining: row.remaining == null ? null : Number(row.remaining),
  };
}

function mapRedemptionEvent(row: {
  redemption_id?: string;
  voucher_id?: string;
  order_id?: string;
  order_number?: string | null;
  guest_name?: string | null;
  event?: string;
  discount_amount?: number | string;
  status?: string;
  occurred_at?: string;
  release_reason?: string | null;
}): CatalogueRedemptionEvent {
  return {
    redemptionId: String(row.redemption_id ?? ""),
    voucherId: String(row.voucher_id ?? ""),
    orderId: String(row.order_id ?? ""),
    orderNumber: String(row.order_number ?? "").trim() || "—",
    guestName: String(row.guest_name ?? "").trim() || "—",
    event: row.event === "released" ? "released" : "redeemed",
    discountAmount: Number(row.discount_amount ?? 0),
    status: row.status === "released" ? "released" : "redeemed",
    occurredAt: String(row.occurred_at ?? ""),
    releaseReason: row.release_reason ?? null,
  };
}

async function loadRedemptionSummaries(): Promise<
  Map<string, CatalogueRedemptionSummary>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_catalogue_voucher_redemption_summaries",
  );
  if (error) {
    if (/redemption|does not exist|schema cache/i.test(error.message)) {
      return new Map();
    }
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return new Map(
    rows.map((row) => {
      const summary = mapRedemptionSummary(row as never);
      return [summary.voucherId, summary] as const;
    }),
  );
}

function withRedemptionSummary(
  voucher: LibraryVoucher,
  summary: CatalogueRedemptionSummary | undefined,
): LibraryVoucher {
  if (!summary) return voucher;
  return {
    ...voucher,
    redemptionLimit: summary.redemptionLimit,
    redemptionActive: summary.active,
    redemptionReleased: summary.released,
    redemptionRemaining: summary.remaining,
  };
}

export async function listVouchers(query?: string): Promise<LibraryVoucher[]> {
  const supabase = await createClient();
  const trimmed = query?.trim() ?? "";

  let request = supabase
    .from("library_vouchers")
    .select("*")
    .order("updated_at", { ascending: false });

  if (trimmed) {
    const escaped = trimmed
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_")
      .replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    request = request.ilike("code", pattern);
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(error.message);
  }

  const vouchers = (data as VoucherRow[]).map(mapVoucher);
  const summaries = await loadRedemptionSummaries().catch(() => new Map());
  try {
    const rulesById = await loadCatalogueRulesForVouchers(
      supabase,
      vouchers.map((row) => row.id),
    );
    return vouchers.map((voucher) =>
      withRedemptionSummary(
        {
          ...voucher,
          rules: rulesById.get(voucher.id) ?? emptyCatalogueRules(),
        },
        summaries.get(voucher.id),
      ),
    );
  } catch {
    return vouchers.map((voucher) =>
      withRedemptionSummary(voucher, summaries.get(voucher.id)),
    );
  }
}

export async function getVoucherById(
  id: string,
): Promise<LibraryVoucher | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_vouchers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;
  const voucher = mapVoucher(data as VoucherRow);
  const summaries = await loadRedemptionSummaries().catch(() => new Map());
  try {
    const rulesById = await loadCatalogueRulesForVouchers(supabase, [voucher.id]);
    return withRedemptionSummary(
      {
        ...voucher,
        rules: rulesById.get(voucher.id) ?? emptyCatalogueRules(),
      },
      summaries.get(voucher.id),
    );
  } catch {
    return withRedemptionSummary(voucher, summaries.get(voucher.id));
  }
}

export async function listCatalogueVoucherRedemptionEvents(
  voucherId: string,
  status: "all" | "redeemed" | "released" = "all",
): Promise<CatalogueRedemptionEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_catalogue_voucher_redemption_events",
    {
      p_voucher_id: voucherId,
      p_status: status,
      p_limit: 50,
      p_offset: 0,
    },
  );
  if (error) {
    if (/redemption|does not exist|schema cache|Not authorized/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => mapRedemptionEvent(row as never));
}
