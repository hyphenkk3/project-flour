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
};

export function mapVoucher(row: VoucherRow): LibraryVoucher {
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
  try {
    const rulesById = await loadCatalogueRulesForVouchers(
      supabase,
      vouchers.map((row) => row.id),
    );
    return vouchers.map((voucher) => ({
      ...voucher,
      rules: rulesById.get(voucher.id) ?? emptyCatalogueRules(),
    }));
  } catch {
    return vouchers;
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
  try {
    const rulesById = await loadCatalogueRulesForVouchers(supabase, [voucher.id]);
    return {
      ...voucher,
      rules: rulesById.get(voucher.id) ?? emptyCatalogueRules(),
    };
  } catch {
    return voucher;
  }
}
