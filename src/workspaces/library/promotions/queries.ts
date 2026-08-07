import { createClient } from "@/lib/supabase/server";
import type {
  LibraryPromotion,
  LibraryPromotionStatus,
} from "@/types/library-promotion";

type PromotionRow = {
  id: string;
  name: string;
  description: string | null;
  valid_from: string | null;
  valid_until: string | null;
  status: LibraryPromotionStatus;
  created_at: string;
  updated_at: string;
};

export function mapPromotion(row: PromotionRow): LibraryPromotion {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPromotions(
  query?: string,
): Promise<LibraryPromotion[]> {
  const supabase = await createClient();
  const trimmed = query?.trim() ?? "";

  let request = supabase
    .from("library_promotions")
    .select("*")
    .order("updated_at", { ascending: false });

  if (trimmed) {
    const escaped = trimmed
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_")
      .replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    request = request.or(
      `name.ilike."${pattern}",description.ilike."${pattern}"`,
    );
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(error.message);
  }

  return (data as PromotionRow[]).map(mapPromotion);
}

export async function getPromotionById(
  id: string,
): Promise<LibraryPromotion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_promotions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapPromotion(data as PromotionRow) : null;
}
