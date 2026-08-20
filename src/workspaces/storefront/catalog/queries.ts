import { sortCakeSizesByNumericLabel } from "@/engines/menu/cake-size-order";
import {
  browseCakeAvailabilityNote,
  isCatalogueExpired,
  isCurrentlyCustomerOrderable,
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

export type CakePickupMembership = {
  cakeId: string;
  monthlyMonths: string[];
  specialWindows: Array<{ from: string; to: string }>;
};

/** Customer-orderable catalogue windows a cake belongs to (checkout calendar bounds). */
export async function getCustomerCakePickupMemberships(
  cakeIds: readonly string[],
  todayYmd: string = toBusinessDateKey(),
): Promise<CakePickupMembership[]> {
  const ids = [...new Set(cakeIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data: catalogues, error: catalogueError } = await supabase
    .from("collections")
    .select("id, month, purpose, status, start_date, end_date, website_override")
    .eq("status", "active");

  if (catalogueError) {
    throw new Error(catalogueError.message);
  }

  const activeCatalogues = (
    (catalogues ?? []) as Array<{
      id: string;
      month: string | null;
      purpose: string | null;
      status: string;
      start_date: string | null;
      end_date: string | null;
      website_override: boolean | null;
    }>
  ).filter((row) =>
    isCurrentlyCustomerOrderable(
      {
        purpose: row.purpose ?? "monthly",
        status: row.status,
        month: row.month ? String(row.month).slice(0, 10) : null,
        endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
        websiteOverride: row.website_override === true,
      },
      todayYmd,
    ),
  );

  if (activeCatalogues.length === 0) {
    return ids.map((cakeId) => ({
      cakeId,
      monthlyMonths: [],
      specialWindows: [],
    }));
  }

  const monthlyMonthById = new Map<string, string>();
  const specialWindowById = new Map<string, { from: string; to: string }>();
  for (const row of activeCatalogues) {
    if (row.purpose === "monthly" && row.month) {
      monthlyMonthById.set(row.id, String(row.month).slice(0, 10));
      continue;
    }
    if (row.purpose === "special" && row.website_override === true) {
      const from = row.start_date ? String(row.start_date).slice(0, 10) : "";
      const to = row.end_date ? String(row.end_date).slice(0, 10) : "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
        specialWindowById.set(row.id, { from, to });
      }
    }
  }

  const { data, error } = await supabase
    .from("collection_cakes")
    .select("collection_id, library_cake_id")
    .eq("available", true)
    .in("library_cake_id", ids)
    .in(
      "collection_id",
      activeCatalogues.map((row) => row.id),
    );

  if (error) {
    throw new Error(error.message);
  }

  const monthlyByCake = new Map<string, string[]>();
  const specialByCake = new Map<string, Array<{ from: string; to: string }>>();

  for (const row of (data ?? []) as Array<{
    collection_id: string;
    library_cake_id: string;
  }>) {
    const month = monthlyMonthById.get(row.collection_id);
    if (month) {
      const months = monthlyByCake.get(row.library_cake_id) ?? [];
      if (!months.includes(month)) months.push(month);
      monthlyByCake.set(row.library_cake_id, months);
    }
    const special = specialWindowById.get(row.collection_id);
    if (special) {
      const windows = specialByCake.get(row.library_cake_id) ?? [];
      if (!windows.some((entry) => entry.from === special.from && entry.to === special.to)) {
        windows.push(special);
      }
      specialByCake.set(row.library_cake_id, windows);
    }
  }

  return ids.map((cakeId) => ({
    cakeId,
    monthlyMonths: (monthlyByCake.get(cakeId) ?? []).sort(),
    specialWindows: specialByCake.get(cakeId) ?? [],
  }));
}

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

export type StorefrontSpecialCatalogue = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  displayOrder: number | null;
};

type SpecialCatalogueRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  purpose: string | null;
  status: string;
  website_override: boolean | null;
};

function mapSpecialCatalogue(
  row: SpecialCatalogueRow,
): StorefrontSpecialCatalogue | null {
  const startDate = row.start_date ? String(row.start_date).slice(0, 10) : "";
  const endDate = row.end_date ? String(row.end_date).slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    startDate,
    endDate,
    displayOrder: null,
  };
}

/** Active special catalogues published as the customer website override. */
export async function listCustomerSpecialCatalogues(
  todayYmd: string = toBusinessDateKey(),
): Promise<StorefrontSpecialCatalogue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select(
      "id, name, start_date, end_date, purpose, status, website_override",
    )
    .eq("status", "active")
    .eq("purpose", "special")
    .eq("website_override", true)
    .order("start_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as SpecialCatalogueRow[])
    .map(mapSpecialCatalogue)
    .filter((row): row is StorefrontSpecialCatalogue => Boolean(row))
    .filter((row) =>
      isCurrentlyCustomerOrderable(
        {
          purpose: "special",
          status: "active",
          endDate: row.endDate,
          websiteOverride: true,
        },
        todayYmd,
      ),
    );
}

export async function getCustomerSpecialCatalogueById(
  id: string,
): Promise<StorefrontSpecialCatalogue | null> {
  const catalogues = await listCustomerSpecialCatalogues();
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
    .select("id, month, purpose, status, end_date")
    .eq("status", "active");

  if (catalogueError) {
    throw new Error(catalogueError.message);
  }

  const active = (
    (catalogues ?? []) as Array<{
      id: string;
      month: string | null;
      purpose: string | null;
      status: string;
      end_date: string | null;
    }>
  ).filter(
    (row) =>
      !isCatalogueExpired(
        {
          purpose: row.purpose ?? "monthly",
          status: row.status,
          month: row.month ? String(row.month).slice(0, 10) : null,
          endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
        },
        todayYmd,
      ),
  );
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
