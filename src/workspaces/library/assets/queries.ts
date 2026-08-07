import { createClient } from "@/lib/supabase/server";
import type {
  LibraryAsset,
  LibraryAssetKind,
  LibraryAssetStatus,
} from "@/types/library-asset";

type AssetRow = {
  id: string;
  title: string;
  kind: LibraryAssetKind;
  image_url: string;
  alt_text: string | null;
  status: LibraryAssetStatus;
  created_at: string;
  updated_at: string;
};

export function mapAsset(row: AssetRow): LibraryAsset {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    imageUrl: row.image_url,
    altText: row.alt_text,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAssets(query?: string): Promise<LibraryAsset[]> {
  const supabase = await createClient();
  const trimmed = query?.trim() ?? "";

  let request = supabase
    .from("library_assets")
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
      `title.ilike."${pattern}",image_url.ilike."${pattern}",alt_text.ilike."${pattern}"`,
    );
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(error.message);
  }

  return (data as AssetRow[]).map(mapAsset);
}

export async function getAssetById(id: string): Promise<LibraryAsset | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapAsset(data as AssetRow) : null;
}
