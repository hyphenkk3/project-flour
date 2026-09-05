import { sortCakePhotos } from "@/engines/menu/cake-photos";
import { sortCakeSizesByNumericLabel } from "@/engines/menu/cake-size-order";
import { sortCakeCategories } from "@/engines/menu/cake-categories";
import { readPreorderDays } from "@/engines/preorder/lead";
import { createClient } from "@/lib/supabase/server";
import type {
  LibraryCake,
  LibraryCakeCategoryRecord,
  LibraryCakeDetail,
  LibraryCakePhoto,
  LibraryCakeSize,
  LibraryCakeStatus,
} from "@/types/library-cake";

type SizeRow = {
  id: string;
  cake_id: string;
  label: string;
  price: number | string;
  sort_order: number;
  preorder_days?: number | string | null;
};

type PhotoRow = {
  id: string;
  cake_id: string;
  asset_id: string | null;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  cake_size_id?: string | null;
  is_default?: boolean | null;
  storage_path?: string | null;
};

type CategoryEmbed = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

type CakeRow = {
  id: string;
  name: string;
  category_id: string;
  description: string | null;
  sharing_guide: string | null;
  allergens: string[] | null;
  bakery_notes: string | null;
  status: LibraryCakeStatus;
  created_at: string;
  updated_at: string;
  library_cake_categories?: CategoryEmbed | CategoryEmbed[] | null;
  library_cake_sizes?: SizeRow[] | null;
  library_cake_photos?: PhotoRow[] | null;
};

type CategoryRow = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapSize(row: SizeRow): LibraryCakeSize {
  return {
    id: row.id,
    cakeId: row.cake_id,
    label: row.label,
    price: Number(row.price),
    sortOrder: row.sort_order,
    preorderDays: readPreorderDays(row.preorder_days),
  };
}

export function mapPhoto(row: PhotoRow): LibraryCakePhoto {
  return {
    id: row.id,
    cakeId: row.cake_id,
    assetId: row.asset_id,
    imageUrl: row.image_url,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    cakeSizeId: row.cake_size_id ?? null,
    isDefault: Boolean(row.is_default),
    storagePath: row.storage_path ?? null,
  };
}

export function mapCakeCategory(row: CategoryRow): LibraryCakeCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCake(row: CakeRow): LibraryCake {
  const sizes = sortCakeSizesByNumericLabel(
    (row.library_cake_sizes ?? []).map(mapSize),
    (size) => size.label,
  );
  const category = unwrapOne(row.library_cake_categories);

  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: category?.name ?? "",
    categoryActive: category?.is_active ?? true,
    categorySortOrder: category?.sort_order ?? 0,
    description: row.description,
    sharingGuide: row.sharing_guide,
    allergens: row.allergens ?? [],
    bakeryNotes: row.bakery_notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sizes,
    photos: sortCakePhotos((row.library_cake_photos ?? []).map(mapPhoto)),
  };
}

const cakeListSelect = `
  id,
  name,
  category_id,
  description,
  sharing_guide,
  allergens,
  bakery_notes,
  status,
  created_at,
  updated_at,
  library_cake_categories (
    id,
    name,
    is_active,
    sort_order
  ),
  library_cake_sizes (
    id,
    cake_id,
    label,
    price,
    sort_order,
    preorder_days
  ),
  library_cake_photos (
    id,
    cake_id,
    asset_id,
    image_url,
    alt_text,
    sort_order,
    cake_size_id,
    is_default,
    storage_path
  )
`;

export async function listCakes(query?: string): Promise<LibraryCake[]> {
  const supabase = await createClient();
  const trimmed = query?.trim() ?? "";

  let request = supabase
    .from("library_cakes")
    .select(cakeListSelect)
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

  return (data as CakeRow[]).map(mapCake);
}

export async function getCakeById(
  id: string,
): Promise<LibraryCakeDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cakes")
    .select(cakeListSelect)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const mapped = mapCake(data as CakeRow);
  return {
    ...mapped,
    photos: mapped.photos ?? [],
  };
}

export async function listCakeCategories(): Promise<LibraryCakeCategoryRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cake_categories")
    .select("id, name, is_active, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return sortCakeCategories((data as CategoryRow[]).map(mapCakeCategory));
}

export async function countCakesByCategoryId(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cakes")
    .select("category_id");

  if (error) {
    throw new Error(error.message);
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ category_id: string | null }>) {
    const id = row.category_id?.trim() ?? "";
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
