import { sortCakeSizesByNumericLabel } from "@/engines/menu/cake-size-order";
import { createClient } from "@/lib/supabase/server";
import type {
  LibraryCake,
  LibraryCakeCategory,
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
};

type PhotoRow = {
  id: string;
  cake_id: string;
  asset_id: string | null;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
};

type CakeRow = {
  id: string;
  name: string;
  category: LibraryCakeCategory;
  description: string | null;
  sharing_guide: string | null;
  allergens: string[] | null;
  bakery_notes: string | null;
  status: LibraryCakeStatus;
  created_at: string;
  updated_at: string;
  library_cake_sizes?: SizeRow[] | null;
};

export function mapSize(row: SizeRow): LibraryCakeSize {
  return {
    id: row.id,
    cakeId: row.cake_id,
    label: row.label,
    price: Number(row.price),
    sortOrder: row.sort_order,
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
  };
}

export function mapCake(row: CakeRow): LibraryCake {
  const sizes = sortCakeSizesByNumericLabel(
    (row.library_cake_sizes ?? []).map(mapSize),
    (size) => size.label,
  );

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    sharingGuide: row.sharing_guide,
    allergens: row.allergens ?? [],
    bakeryNotes: row.bakery_notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sizes,
  };
}

const cakeListSelect = `
  id,
  name,
  category,
  description,
  sharing_guide,
  allergens,
  bakery_notes,
  status,
  created_at,
  updated_at,
  library_cake_sizes (
    id,
    cake_id,
    label,
    price,
    sort_order
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

  const { data: photos, error: photosError } = await supabase
    .from("library_cake_photos")
    .select("*")
    .eq("cake_id", id)
    .order("sort_order", { ascending: true });

  if (photosError) {
    throw new Error(photosError.message);
  }

  return {
    ...mapCake(data as CakeRow),
    photos: (photos as PhotoRow[]).map(mapPhoto),
  };
}
