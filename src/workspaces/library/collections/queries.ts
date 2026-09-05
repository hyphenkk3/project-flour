import { createClient } from "@/lib/supabase/server";
import { mapCake } from "@/workspaces/library/cakes/queries";
import type { LibraryCake } from "@/types/library-cake";
import type { CataloguePurpose } from "@/workspaces/library/collections/catalogue";
import type { LibraryCollectionStatus } from "@/workspaces/library/labels";

export type { LibraryCollectionStatus };

export type LibraryCollection = {
  id: string;
  name: string;
  month: string | null;
  startDate: string | null;
  endDate: string | null;
  status: LibraryCollectionStatus;
  purpose: CataloguePurpose;
  websiteOverride: boolean;
  displayOrder: number | null;
  showInPastMenu: boolean;
  createdAt: string;
};

export type CollectionCakeRow = {
  id: string;
  collectionId: string;
  libraryCakeId: string;
  available: boolean;
  sortOrder: number;
  cake: LibraryCake;
};

type CollectionRow = {
  id: string;
  name: string;
  month: string | null;
  start_date: string | null;
  end_date: string | null;
  status: LibraryCollectionStatus;
  purpose: CataloguePurpose | null;
  website_override?: boolean | null;
  display_order?: number | null;
  show_in_past_menu?: boolean | null;
  created_at: string;
};

type MembershipRow = {
  id: string;
  collection_id: string;
  library_cake_id: string;
  available: boolean;
  sort_order: number;
  library_cakes:
    Parameters<typeof mapCake>[0] | Parameters<typeof mapCake>[0][] | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function optionalIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function mapCollection(row: CollectionRow): LibraryCollection {
  return {
    id: row.id,
    name: row.name,
    month: optionalIsoDate(row.month),
    startDate: optionalIsoDate(row.start_date),
    endDate: optionalIsoDate(row.end_date),
    status: row.status,
    purpose: row.purpose === "special" ? "special" : "monthly",
    websiteOverride: row.website_override === true,
    displayOrder:
      row.display_order == null ? null : Number(row.display_order),
    showInPastMenu: row.show_in_past_menu === true,
    createdAt: row.created_at,
  };
}

function isMissingShowInPastMenuColumn(message: string): boolean {
  return message.includes("show_in_past_menu");
}

function isMissingDisplayOrderColumn(message: string): boolean {
  return message.includes("display_order");
}

function isMissingWebsiteOverrideColumn(message: string): boolean {
  return message.includes("website_override");
}

function isMissingSpecialDateColumn(message: string): boolean {
  return message.includes("start_date") || message.includes("end_date");
}

function withNullSpecialDates(
  row: Omit<CollectionRow, "start_date" | "end_date">,
): CollectionRow {
  return { ...row, start_date: null, end_date: null };
}

function sortLibraryCollections(
  rows: LibraryCollection[],
): LibraryCollection[] {
  const hasOrder = rows.some((row) => row.displayOrder != null);
  if (!hasOrder) return rows;
  return [...rows].sort((a, b) => {
    if (a.displayOrder == null && b.displayOrder == null) {
      return a.id.localeCompare(b.id);
    }
    if (a.displayOrder == null) return 1;
    if (b.displayOrder == null) return -1;
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    return a.id.localeCompare(b.id);
  });
}

export async function listLibraryCollections(): Promise<LibraryCollection[]> {
  const supabase = await createClient();
  const withDisplayOrder = await supabase
    .from("collections")
    .select(
      "id, name, month, start_date, end_date, status, purpose, website_override, display_order, show_in_past_menu, created_at",
    )
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!withDisplayOrder.error) {
    return sortLibraryCollections(
      (withDisplayOrder.data as CollectionRow[]).map(mapCollection),
    );
  }
  if (isMissingShowInPastMenuColumn(withDisplayOrder.error.message)) {
    const withoutPastMenu = await supabase
      .from("collections")
      .select(
        "id, name, month, start_date, end_date, status, purpose, website_override, display_order, created_at",
      )
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!withoutPastMenu.error) {
      return sortLibraryCollections(
        (withoutPastMenu.data as CollectionRow[]).map(mapCollection),
      );
    }
  }
  if (!isMissingDisplayOrderColumn(withDisplayOrder.error.message)) {
    if (
      !isMissingWebsiteOverrideColumn(withDisplayOrder.error.message) &&
      !isMissingSpecialDateColumn(withDisplayOrder.error.message) &&
      !isMissingShowInPastMenuColumn(withDisplayOrder.error.message)
    ) {
      throw new Error(withDisplayOrder.error.message);
    }
  }

  const withOverride = await supabase
    .from("collections")
    .select(
      "id, name, month, start_date, end_date, status, purpose, website_override, created_at",
    )
    .order("month", { ascending: false, nullsFirst: false })
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (!withOverride.error) {
    return (withOverride.data as CollectionRow[]).map(mapCollection);
  }
  if (
    !isMissingWebsiteOverrideColumn(withOverride.error.message) &&
    !isMissingSpecialDateColumn(withOverride.error.message)
  ) {
    throw new Error(withOverride.error.message);
  }

  const dated = await supabase
    .from("collections")
    .select(
      "id, name, month, start_date, end_date, status, purpose, created_at",
    )
    .order("month", { ascending: false, nullsFirst: false })
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (!dated.error) {
    return (dated.data as CollectionRow[]).map(mapCollection);
  }
  if (!isMissingSpecialDateColumn(dated.error.message)) {
    throw new Error(dated.error.message);
  }

  const legacy = await supabase
    .from("collections")
    .select("id, name, month, status, purpose, created_at")
    .order("month", { ascending: false })
    .order("created_at", { ascending: false });
  if (legacy.error) {
    throw new Error(legacy.error.message);
  }
  return (
    legacy.data as Array<Omit<CollectionRow, "start_date" | "end_date">>
  ).map((row) => mapCollection(withNullSpecialDates(row)));
}

export async function getStorefrontCurrentCollectionId(): Promise<
  string | null
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_current_collection");
  if (error) {
    throw new Error(error.message);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  return row?.id ?? null;
}

export async function getLibraryCollectionById(
  id: string,
): Promise<LibraryCollection | null> {
  const supabase = await createClient();
  const withDisplayOrder = await supabase
    .from("collections")
    .select(
      "id, name, month, start_date, end_date, status, purpose, website_override, display_order, show_in_past_menu, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!withDisplayOrder.error) {
    if (!withDisplayOrder.data) return null;
    return mapCollection(withDisplayOrder.data as CollectionRow);
  }
  if (isMissingShowInPastMenuColumn(withDisplayOrder.error.message)) {
    const withoutPastMenu = await supabase
      .from("collections")
      .select(
        "id, name, month, start_date, end_date, status, purpose, website_override, display_order, created_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (!withoutPastMenu.error) {
      if (!withoutPastMenu.data) return null;
      return mapCollection(withoutPastMenu.data as CollectionRow);
    }
  }
  if (
    !isMissingDisplayOrderColumn(withDisplayOrder.error.message) &&
    !isMissingWebsiteOverrideColumn(withDisplayOrder.error.message) &&
    !isMissingSpecialDateColumn(withDisplayOrder.error.message) &&
    !isMissingShowInPastMenuColumn(withDisplayOrder.error.message)
  ) {
    throw new Error(withDisplayOrder.error.message);
  }

  const withOverride = await supabase
    .from("collections")
    .select(
      "id, name, month, start_date, end_date, status, purpose, website_override, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!withOverride.error) {
    if (!withOverride.data) return null;
    return mapCollection(withOverride.data as CollectionRow);
  }
  if (
    !isMissingWebsiteOverrideColumn(withOverride.error.message) &&
    !isMissingSpecialDateColumn(withOverride.error.message)
  ) {
    throw new Error(withOverride.error.message);
  }

  const dated = await supabase
    .from("collections")
    .select(
      "id, name, month, start_date, end_date, status, purpose, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!dated.error) {
    if (!dated.data) return null;
    return mapCollection(dated.data as CollectionRow);
  }
  if (!isMissingSpecialDateColumn(dated.error.message)) {
    throw new Error(dated.error.message);
  }

  const legacy = await supabase
    .from("collections")
    .select("id, name, month, status, purpose, created_at")
    .eq("id", id)
    .maybeSingle();
  if (legacy.error) {
    throw new Error(legacy.error.message);
  }
  if (!legacy.data) return null;
  return mapCollection(
    withNullSpecialDates(
      legacy.data as Omit<CollectionRow, "start_date" | "end_date">,
    ),
  );
}

export async function listCollectionCakeRows(
  collectionId: string,
): Promise<CollectionCakeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_cakes")
    .select(
      `
      id,
      collection_id,
      library_cake_id,
      available,
      sort_order,
      library_cakes (
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
          sort_order
        )
      )
    `,
    )
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  const rows: CollectionCakeRow[] = [];
  for (const row of (data ?? []) as MembershipRow[]) {
    const cakeRow = unwrapOne(row.library_cakes);
    if (!cakeRow) continue;
    rows.push({
      id: row.id,
      collectionId: row.collection_id,
      libraryCakeId: row.library_cake_id,
      available: row.available,
      sortOrder: row.sort_order,
      cake: mapCake(cakeRow),
    });
  }
  return rows;
}

export async function countCakesByCollection(): Promise<
  Record<string, number>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_cakes")
    .select("collection_id");
  if (error) {
    throw new Error(error.message);
  }
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const collectionId = String(row.collection_id);
    counts[collectionId] = (counts[collectionId] ?? 0) + 1;
  }
  return counts;
}
