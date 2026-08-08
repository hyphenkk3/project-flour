import { createClient } from "@/lib/supabase/server";
import type {
  StorefrontCake,
  StorefrontCakeSize,
  StorefrontCollection,
} from "@/types/storefront";
import {
  formatRm,
  startingPrice,
} from "@/workspaces/storefront/catalog/pricing";

export { formatRm, startingPrice };

type CollectionRow = {
  id: string;
  name: string;
  month: string;
};

type LibraryCakeEmbed = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  sharing_guide: string | null;
  allergens: string[] | null;
  library_cake_sizes: Array<{
    id: string;
    cake_id: string;
    label: string;
    price: number | string;
    sort_order: number;
  }> | null;
  library_cake_photos: Array<{
    image_url: string;
    sort_order: number;
  }> | null;
};

type CatalogRow = {
  sort_order: number;
  library_cakes: LibraryCakeEmbed | LibraryCakeEmbed[] | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapSize(row: {
  id: string;
  cake_id: string;
  label: string;
  price: number | string;
  sort_order: number;
}): StorefrontCakeSize {
  return {
    id: row.id,
    cakeId: row.cake_id,
    size: row.label,
    price: Number(row.price),
    sortOrder: row.sort_order,
  };
}

function mapCake(row: LibraryCakeEmbed): StorefrontCake {
  const sizes = (row.library_cake_sizes ?? [])
    .map(mapSize)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const photos = [...(row.library_cake_photos ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image: photos[0]?.image_url ?? null,
    sharingGuide: row.sharing_guide,
    allergens: row.allergens ?? [],
    sizes,
  };
}

function isOfferableStatus(status: string): boolean {
  return status === "active" || status === "seasonal";
}

/** Active collection for the current Asia/Singapore calendar month. */
export async function getCurrentCollection(): Promise<StorefrontCollection | null> {
  const supabase = await createClient();
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }),
  );
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data, error } = await supabase
    .from("collections")
    .select("id, name, month")
    .eq("status", "active")
    .eq("month", monthStart)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    const { data: fallback, error: fallbackError } = await supabase
      .from("collections")
      .select("id, name, month")
      .eq("status", "active")
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }
    if (!fallback) return null;

    const row = fallback as CollectionRow;
    return { id: row.id, name: row.name, month: row.month };
  }

  const row = data as CollectionRow;
  return { id: row.id, name: row.name, month: row.month };
}

export async function listAvailableCakes(
  collectionId: string,
): Promise<StorefrontCake[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_cakes")
    .select(
      `
      sort_order,
      library_cakes (
        id,
        name,
        description,
        status,
        sharing_guide,
        allergens,
        library_cake_sizes (
          id,
          cake_id,
          label,
          price,
          sort_order
        ),
        library_cake_photos (
          image_url,
          sort_order
        )
      )
    `,
    )
    .eq("collection_id", collectionId)
    .eq("available", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as CatalogRow[])
    .map((row) => unwrapOne(row.library_cakes))
    .filter((cake): cake is LibraryCakeEmbed => Boolean(cake))
    .filter((cake) => isOfferableStatus(cake.status))
    .map(mapCake);
}

export async function getAvailableCakeById(
  id: string,
): Promise<StorefrontCake | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cakes")
    .select(
      `
      id,
      name,
      description,
      status,
      sharing_guide,
      allergens,
      library_cake_sizes (
        id,
        cake_id,
        label,
        price,
        sort_order
      ),
      library_cake_photos (
        image_url,
        sort_order
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const cake = data as unknown as LibraryCakeEmbed;
  if (!isOfferableStatus(cake.status)) return null;

  return mapCake(cake);
}

/**
 * Owner staff order entry / workspace: Master Library cakes independent of
 * Collection membership. Statuses: active | seasonal.
 * Does not read or write collection_cakes.
 */
export async function listOfferableLibraryCakes(): Promise<StorefrontCake[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cakes")
    .select(
      `
      id,
      name,
      description,
      status,
      sharing_guide,
      allergens,
      library_cake_sizes (
        id,
        cake_id,
        label,
        price,
        sort_order
      ),
      library_cake_photos (
        image_url,
        sort_order
      )
    `,
    )
    .in("status", ["active", "seasonal"])
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as LibraryCakeEmbed[])
    .filter((cake) => isOfferableStatus(cake.status))
    .map(mapCake)
    .filter((cake) => cake.sizes.length > 0);
}
