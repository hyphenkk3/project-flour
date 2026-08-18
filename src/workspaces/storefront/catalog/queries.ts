import { sortCakeSizesByNumericLabel } from "@/engines/menu/cake-size-order";
import {
  browseCakeAvailabilityNote,
  isCustomerOrderableMonthlyMonth,
} from "@/engines/menu/customer-browse";
import {
  businessYearMonth,
  formatBusinessMonthYear,
  toBusinessDateKey,
} from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { LibraryCakeCategory } from "@/types/library-cake";
import type {
  StorefrontCake,
  StorefrontCakePhoto,
  StorefrontCakeSize,
  StorefrontCollection,
} from "@/types/storefront";
import {
  formatRm,
  startingPrice,
} from "@/workspaces/storefront/catalog/pricing";

export { formatRm, startingPrice };

type LibraryCakeEmbed = {
  id: string;
  name: string;
  description: string | null;
  category: LibraryCakeCategory | null;
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
    alt_text: string | null;
    sort_order: number;
  }> | null;
};

type CatalogRow = {
  collection_id?: string;
  sort_order: number;
  library_cakes: LibraryCakeEmbed | LibraryCakeEmbed[] | null;
};

export type BrowseStorefrontCake = StorefrontCake & {
  availabilityNote: string | null;
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

export function mapStorefrontCake(row: LibraryCakeEmbed): StorefrontCake {
  const sizes = sortCakeSizesByNumericLabel(
    (row.library_cake_sizes ?? []).map(mapSize),
    (size) => size.size,
  );
  const photos: StorefrontCakePhoto[] = [...(row.library_cake_photos ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((photo) => Boolean(photo.image_url))
    .map((photo) => ({
      url: photo.image_url,
      altText: photo.alt_text,
    }));

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    image: photos[0]?.url ?? null,
    photos,
    sharingGuide: row.sharing_guide,
    allergens: row.allergens ?? [],
    sizes,
  };
}

function isOfferableStatus(status: string): boolean {
  return status === "active" || status === "seasonal";
}

type CurrentCollectionRpcRow = {
  id: string;
  name: string;
  month: string | null;
};

function mapCollection(row: CurrentCollectionRpcRow): StorefrontCollection {
  return {
    id: row.id,
    name: row.name,
    month: row.month ? String(row.month).slice(0, 10) : null,
  };
}

function collectionFromRpc(data: unknown): StorefrontCollection | null {
  if (!data) return null;
  const row = (
    Array.isArray(data) ? data[0] : data
  ) as CurrentCollectionRpcRow | null;
  if (!row?.id) return null;
  return mapCollection(row);
}

export function unpublishedCataloguePreorderMessage(pickupYmd: string): string {
  return `${formatBusinessMonthYear(pickupYmd)} catalogue is not yet available for preorder.`;
}

/**
 * Singapore-today catalogue for homepage merchandising.
 * Customer *ordering* must use getStorefrontCollectionForPickupDate.
 */
export async function getCurrentCollection(): Promise<StorefrontCollection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_current_collection");

  if (error) {
    throw new Error(error.message);
  }
  return collectionFromRpc(data);
}

/** Authoritative customer catalogue for a pickup date (SQL resolver). */
export async function getStorefrontCollectionForPickupDate(
  pickupYmd: string,
): Promise<StorefrontCollection | null> {
  const key = pickupYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "storefront_collection_for_pickup_date",
    { p_pickup_date: key },
  );
  if (error) {
    throw new Error(error.message);
  }
  return collectionFromRpc(data);
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
        category,
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
          alt_text,
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
    .map(mapStorefrontCake)
    .filter((cake) => cake.sizes.length > 0);
}

/**
 * Cake offered on the public storefront for Singapore today (homepage
 * merchandising). Checkout ordering uses the pickup-date catalogue instead.
 */
export async function getStorefrontOfferedCakeById(
  id: string,
): Promise<StorefrontCake | null> {
  const collection = await getCurrentCollection();
  if (!collection) return null;
  const cakes = await listAvailableCakes(collection.id);
  return cakes.find((cake) => cake.id === id) ?? null;
}

/** Library cake by id when offerable (staff workspace). Not collection-gated. */
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
      category,
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
        alt_text,
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

  return mapStorefrontCake(cake);
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
      category,
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
        alt_text,
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
    .map(mapStorefrontCake)
    .filter((cake) => cake.sizes.length > 0);
}

type ActiveCollectionRow = {
  id: string;
  name: string;
  month: string | null;
  purpose: string | null;
  status: string;
};

/** Active monthly catalogues customers may currently preorder from. */
export async function listOrderableMonthlyCatalogues(
  todayYmd: string = toBusinessDateKey(),
): Promise<StorefrontCollection[]> {
  const todayYm = businessYearMonth(todayYmd) ?? todayYmd.slice(0, 7);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select("id, name, month, purpose, status")
    .eq("status", "active")
    .eq("purpose", "monthly")
    .order("month", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as ActiveCollectionRow[])
    .filter((row) =>
      isCustomerOrderableMonthlyMonth(
        row.month ? String(row.month).slice(0, 10) : null,
        todayYm,
      ),
    )
    .map((row) => mapCollection(row));
}

export async function getOrderableMonthlyCatalogueById(
  id: string,
): Promise<StorefrontCollection | null> {
  const catalogues = await listOrderableMonthlyCatalogues();
  return catalogues.find((catalogue) => catalogue.id === id) ?? null;
}

/**
 * Discovery only: cakes published in any Active catalogue.
 * Not checkout authority — pickup date still selects the catalogue.
 */
export async function listBrowsePublishedCakes(
  todayYmd: string = toBusinessDateKey(),
): Promise<BrowseStorefrontCake[]> {
  const todayYm = businessYearMonth(todayYmd) ?? todayYmd.slice(0, 7);
  const supabase = await createClient();
  const { data: catalogues, error: catalogueError } = await supabase
    .from("collections")
    .select("id, month, purpose, status")
    .eq("status", "active");

  if (catalogueError) {
    throw new Error(catalogueError.message);
  }

  const active = (catalogues ?? []) as Array<{
    id: string;
    month: string | null;
    purpose: string | null;
    status: string;
  }>;
  if (active.length === 0) {
    return [];
  }

  const monthlyMonthById = new Map<string, string>();
  for (const row of active) {
    if (row.purpose !== "monthly" || !row.month) continue;
    monthlyMonthById.set(row.id, String(row.month).slice(0, 10));
  }

  const { data, error } = await supabase
    .from("collection_cakes")
    .select(
      `
      collection_id,
      sort_order,
      library_cakes (
        id,
        name,
        description,
        category,
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
          alt_text,
          sort_order
        )
      )
    `,
    )
    .eq("available", true)
    .in(
      "collection_id",
      active.map((row) => row.id),
    )
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const cakeById = new Map<string, StorefrontCake>();
  const monthsByCakeId = new Map<string, string[]>();

  for (const row of (data ?? []) as unknown as CatalogRow[]) {
    const embed = unwrapOne(row.library_cakes);
    if (!embed || !isOfferableStatus(embed.status)) continue;
    const cake = mapStorefrontCake(embed);
    if (cake.sizes.length === 0) continue;
    cakeById.set(cake.id, cake);
    const month = row.collection_id
      ? monthlyMonthById.get(row.collection_id)
      : undefined;
    if (!month) continue;
    const months = monthsByCakeId.get(cake.id) ?? [];
    months.push(month);
    monthsByCakeId.set(cake.id, months);
  }

  return [...cakeById.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map((cake) => ({
      ...cake,
      availabilityNote: browseCakeAvailabilityNote(
        todayYm,
        monthsByCakeId.get(cake.id) ?? [],
      ),
    }));
}

export async function getBrowsePublishedCakeById(
  id: string,
): Promise<BrowseStorefrontCake | null> {
  const cakes = await listBrowsePublishedCakes();
  return cakes.find((cake) => cake.id === id) ?? null;
}
