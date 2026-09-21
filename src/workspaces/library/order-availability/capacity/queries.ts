import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseBusinessDate } from "@/lib/dates";
import { sortCakeSizesByNumericLabel } from "@/engines/menu/cake-size-order";
import { PRODUCTION_CAPACITY_REMOVED_EVENT_NOTE } from "@/engines/orders/production-capacity";
import { isStorefrontLibraryStatus } from "@/workspaces/library/collections/membership";
import type { LibraryCakeStatus } from "@/types/library-cake";
import type {
  ProductionCapacityCakeOption,
  ProductionCapacityEvent,
  ProductionCapacityRow,
} from "@/workspaces/library/order-availability/capacity/capacity-event-format";

export type {
  ProductionCapacityCakeOption,
  ProductionCapacityEvent,
  ProductionCapacityRow,
} from "@/workspaces/library/order-availability/capacity/capacity-event-format";

export type ProductionCapacityCakeCatalog = {
  collectionId: string | null;
  cakes: ProductionCapacityCakeOption[];
};

function isMissingCapacityTable(message: string): boolean {
  return /production_capacity|schema cache|does not exist/i.test(message);
}

function rpcCollectionId(data: unknown): string | null {
  const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  const id = String(row?.id ?? "").trim();
  return id || null;
}

function unwrapEmbeddedCake(value: unknown): {
  id: string;
  name: string;
  status: string;
  library_cake_sizes?: unknown;
} | null {
  const row = (Array.isArray(value) ? value[0] : value) as {
    id?: string;
    name?: string;
    status?: string;
    library_cake_sizes?: unknown;
  } | null;
  const id = String(row?.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(row?.name ?? "Cake"),
    status: String(row?.status ?? ""),
    library_cake_sizes: row?.library_cake_sizes,
  };
}

export async function resolvePickupCollectionId(
  pickupDate: string,
): Promise<string | null> {
  if (!parseBusinessDate(pickupDate)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "storefront_collection_for_pickup_date",
    { p_pickup_date: pickupDate },
  );
  if (error) throw new Error(error.message);
  return rpcCollectionId(data);
}

export async function listProductionCapacityCakesForPickupDate(
  pickupDate: string,
): Promise<ProductionCapacityCakeCatalog> {
  const collectionId = await resolvePickupCollectionId(pickupDate);
  if (!collectionId) return { collectionId: null, cakes: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_cakes")
    .select(
      `
      sort_order,
      library_cakes (
        id,
        name,
        status,
        library_cake_sizes ( id, label )
      )
    `,
    )
    .eq("collection_id", collectionId)
    .eq("available", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const cakes: ProductionCapacityCakeOption[] = [];
  for (const row of data ?? []) {
    const cake = unwrapEmbeddedCake(
      (row as { library_cakes?: unknown }).library_cakes,
    );
    if (!cake) continue;
    if (!isStorefrontLibraryStatus(cake.status as LibraryCakeStatus)) continue;
    const sizesRel = cake.library_cake_sizes;
    const sizes = Array.isArray(sizesRel) ? sizesRel : [];
    cakes.push({
      id: cake.id,
      name: cake.name,
      sizes: sortCakeSizesByNumericLabel(
        sizes.map((size) => ({
          id: String((size as { id?: string }).id ?? ""),
          label: String((size as { label?: string }).label ?? "Size"),
        })),
        (size) => size.label,
      ).filter((size) => size.id),
    });
  }
  return { collectionId, cakes };
}

async function loadStaffDisplayNames(
  staffIds: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(staffIds.filter(Boolean))];
  if (unique.length === 0) return names;
  try {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("staff_profiles")
      .select("id, display_name")
      .in("id", unique);
    if (error) return names;
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      const name = String(
        (row as { display_name?: string | null }).display_name ?? "",
      ).trim();
      if (id && name) names.set(id, name);
    }
  } catch {
    // Presentation-only.
  }
  return names;
}

export async function listProductionCapacityForDate(
  pickupDate: string,
): Promise<ProductionCapacityRow[]> {
  if (!parseBusinessDate(pickupDate)) return [];

  const supabase = await createClient();
  let { data, error } = await supabase
    .from("production_capacity")
    .select(
      "id, pickup_date, library_cake_id, library_cake_size_id, collection_id, capacity_quantity, waiting_list_enabled, note",
    )
    .eq("pickup_date", pickupDate)
    .order("created_at", { ascending: true });

  if (error && /waiting_list_enabled/i.test(error.message)) {
    const fallback = await supabase
      .from("production_capacity")
      .select(
        "id, pickup_date, library_cake_id, library_cake_size_id, collection_id, capacity_quantity, note",
      )
      .eq("pickup_date", pickupDate)
      .order("created_at", { ascending: true });
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingCapacityTable(error.message)) return [];
    throw new Error(error.message);
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const cakeIds = [
    ...new Set(
      rows.map((row) => String((row as { library_cake_id?: string }).library_cake_id ?? "")),
    ),
  ].filter(Boolean);
  const sizeIds = [
    ...new Set(
      rows
        .map((row) =>
          String((row as { library_cake_size_id?: string | null }).library_cake_size_id ?? ""),
        )
        .filter(Boolean),
    ),
  ];
  const collectionIds = [
    ...new Set(
      rows
        .map((row) =>
          String((row as { collection_id?: string | null }).collection_id ?? ""),
        )
        .filter(Boolean),
    ),
  ];

  const [{ data: cakes }, { data: sizes }, { data: collections }] =
    await Promise.all([
      supabase.from("library_cakes").select("id, name").in("id", cakeIds),
      sizeIds.length > 0
        ? supabase.from("library_cake_sizes").select("id, label").in("id", sizeIds)
        : Promise.resolve({ data: [] as Array<{ id: string; label: string }> }),
      collectionIds.length > 0
        ? supabase.from("collections").select("id, name").in("id", collectionIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

  const cakeNames = new Map(
    (cakes ?? []).map((row) => [
      String((row as { id: string }).id),
      String((row as { name: string }).name),
    ]),
  );
  const sizeLabels = new Map(
    (sizes ?? []).map((row) => [
      String((row as { id: string }).id),
      String((row as { label: string }).label),
    ]),
  );
  const collectionNames = new Map(
    (collections ?? []).map((row) => [
      String((row as { id: string }).id),
      String((row as { name?: string }).name ?? "Catalogue"),
    ]),
  );

  const committedResults = await Promise.all(
    rows.map(async (row) => {
      const cakeId = String((row as { library_cake_id?: string }).library_cake_id ?? "");
      const sizeIdRaw = (row as { library_cake_size_id?: string | null })
        .library_cake_size_id;
      const collectionIdRaw = (row as { collection_id?: string | null }).collection_id;
      const sizeId = sizeIdRaw ? String(sizeIdRaw) : null;
      const collectionId = collectionIdRaw ? String(collectionIdRaw) : null;
      const { data: committed, error: committedError } = await supabase.rpc(
        "production_capacity_committed_quantity",
        {
          p_pickup_date: pickupDate,
          p_library_cake_id: cakeId,
          p_library_cake_size_id: sizeId,
          p_collection_id: collectionId,
        },
      );
      if (committedError && !isMissingCapacityTable(committedError.message)) {
        throw new Error(committedError.message);
      }
      return Number(committed ?? 0);
    }),
  );

  return rows.map((row, index) => {
    const cakeId = String((row as { library_cake_id?: string }).library_cake_id ?? "");
    const sizeIdRaw = (row as { library_cake_size_id?: string | null })
      .library_cake_size_id;
    const collectionIdRaw = (row as { collection_id?: string | null }).collection_id;
    const sizeId = sizeIdRaw ? String(sizeIdRaw) : null;
    const collectionId = collectionIdRaw ? String(collectionIdRaw) : null;
    return {
      id: String((row as { id?: string }).id ?? ""),
      pickupDate,
      cakeId,
      cakeName: cakeNames.get(cakeId) ?? "Cake",
      sizeId,
      sizeLabel: sizeId ? (sizeLabels.get(sizeId) ?? "Size") : null,
      collectionId,
      collectionLabel: collectionId
        ? (collectionNames.get(collectionId) ?? "Catalogue")
        : null,
      quantity: Number((row as { capacity_quantity?: number }).capacity_quantity ?? 0),
      committedQuantity: committedResults[index] ?? 0,
      waitingListEnabled: Boolean(
        (row as { waiting_list_enabled?: boolean }).waiting_list_enabled,
      ),
      note: String((row as { note?: string | null }).note ?? "").trim() || null,
    };
  });
}

export async function listRecentProductionCapacityEvents(
  pickupDate: string,
  limit = 12,
): Promise<ProductionCapacityEvent[]> {
  if (!parseBusinessDate(pickupDate)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_capacity_events")
    .select(
      "pickup_date, library_cake_id, library_cake_size_id, previous_quantity, new_quantity, actor_staff_id, note, created_at",
    )
    .eq("pickup_date", pickupDate)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingCapacityTable(error.message)) return [];
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const cakeIds = [
    ...new Set(
      rows.map((row) => String((row as { library_cake_id?: string }).library_cake_id ?? "")),
    ),
  ].filter(Boolean);
  const sizeIds = [
    ...new Set(
      rows
        .map((row) =>
          String((row as { library_cake_size_id?: string | null }).library_cake_size_id ?? ""),
        )
        .filter(Boolean),
    ),
  ];

  const [{ data: cakes }, { data: sizes }] = await Promise.all([
    cakeIds.length > 0
      ? supabase.from("library_cakes").select("id, name").in("id", cakeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    sizeIds.length > 0
      ? supabase.from("library_cake_sizes").select("id, label").in("id", sizeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; label: string }> }),
  ]);
  const cakeNames = new Map(
    (cakes ?? []).map((row) => [
      String((row as { id: string }).id),
      String((row as { name: string }).name),
    ]),
  );
  const sizeLabels = new Map(
    (sizes ?? []).map((row) => [
      String((row as { id: string }).id),
      String((row as { label: string }).label),
    ]),
  );
  const names = await loadStaffDisplayNames(
    rows.map((row) => String((row as { actor_staff_id?: string | null }).actor_staff_id ?? "")),
  );

  return rows.map((row) => {
    const cakeId = String((row as { library_cake_id?: string }).library_cake_id ?? "");
    const sizeId = (row as { library_cake_size_id?: string | null }).library_cake_size_id;
    const note = String((row as { note?: string | null }).note ?? "").trim();
    const actorId = String((row as { actor_staff_id?: string | null }).actor_staff_id ?? "");
    return {
      pickupDate: String((row as { pickup_date?: string }).pickup_date ?? pickupDate).slice(0, 10),
      cakeName: cakeNames.get(cakeId) ?? "Cake",
      sizeLabel: sizeId ? (sizeLabels.get(String(sizeId)) ?? null) : null,
      previousQuantity:
        (row as { previous_quantity?: number | null }).previous_quantity ?? null,
      newQuantity: Number((row as { new_quantity?: number }).new_quantity ?? 0),
      removed: note === PRODUCTION_CAPACITY_REMOVED_EVENT_NOTE,
      createdAt: String((row as { created_at?: string }).created_at ?? ""),
      actorName: actorId ? (names.get(actorId) ?? null) : null,
    };
  });
}
