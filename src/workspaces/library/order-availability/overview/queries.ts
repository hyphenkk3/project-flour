import { createClient } from "@/lib/supabase/server";
import {
  AVAILABILITY_OVERVIEW_FLOOR_ORDER_STATUSES,
  availabilityOverviewDates,
  buildAvailabilityOverviewDays,
  committedQuantityForOverviewRow,
  parseAvailabilityOverviewFrom,
  type AvailabilityOverviewCapacityRow,
  type AvailabilityOverviewCommittedLine,
  type AvailabilityOverviewDay,
} from "@/engines/orders/availability-overview";
import { parseBusinessDate } from "@/lib/dates";

export type AvailabilityOverviewWindow = {
  from: string;
  to: string;
  dates: string[];
  days: AvailabilityOverviewDay[];
};

function isMissingRelation(message: string, names: readonly string[]): boolean {
  return (
    names.some((name) => message.includes(name)) ||
    /schema cache|does not exist/i.test(message)
  );
}

function asId(value: unknown): string {
  return String(value ?? "").trim();
}

function asOptionalId(value: unknown): string | null {
  const id = asId(value);
  return id.length > 0 ? id : null;
}

async function loadClosedPickupDates(
  first: string,
  last: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_availability_overrides")
    .select("pickup_date, closed")
    .gte("pickup_date", first)
    .lte("pickup_date", last);

  if (error) {
    if (
      isMissingRelation(error.message, ["order_availability_overrides"])
    ) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? [])
    .filter((row) => (row as { closed?: boolean | null }).closed !== false)
    .map((row) =>
      String((row as { pickup_date?: string }).pickup_date ?? "").slice(0, 10),
    )
    .filter((date) => parseBusinessDate(date) != null);
}

type CapacityRaw = {
  pickup_date?: string;
  library_cake_id?: string;
  library_cake_size_id?: string | null;
  collection_id?: string | null;
  capacity_quantity?: number;
};

async function loadCapacityRows(
  first: string,
  last: string,
): Promise<CapacityRaw[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_capacity")
    .select(
      "pickup_date, library_cake_id, library_cake_size_id, collection_id, capacity_quantity",
    )
    .gte("pickup_date", first)
    .lte("pickup_date", last)
    .order("pickup_date", { ascending: true });

  if (error) {
    if (isMissingRelation(error.message, ["production_capacity"])) {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []) as CapacityRaw[];
}

async function loadCommittedLines(
  first: string,
  last: string,
): Promise<AvailabilityOverviewCommittedLine[]> {
  const supabase = await createClient();
  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("id, pickup_date, collection_id, status")
    .in("status", [...AVAILABILITY_OVERVIEW_FLOOR_ORDER_STATUSES])
    .gte("pickup_date", first)
    .lte("pickup_date", last);

  if (orderError) {
    if (isMissingRelation(orderError.message, ["orders"])) return [];
    throw new Error(orderError.message);
  }

  const orderRows = orders ?? [];
  if (orderRows.length === 0) return [];

  const orderById = new Map<
    string,
    { pickupDate: string; collectionId: string | null; status: string }
  >();
  for (const row of orderRows) {
    const id = asId((row as { id?: string }).id);
    if (!id) continue;
    orderById.set(id, {
      pickupDate: String(
        (row as { pickup_date?: string }).pickup_date ?? "",
      ).slice(0, 10),
      collectionId: asOptionalId(
        (row as { collection_id?: string | null }).collection_id,
      ),
      status: String((row as { status?: string }).status ?? ""),
    });
  }

  const { data: items, error: itemError } = await supabase
    .from("order_items")
    .select("order_id, cake_id, cake_size_id, quantity")
    .in("order_id", [...orderById.keys()]);

  if (itemError) {
    if (isMissingRelation(itemError.message, ["order_items"])) return [];
    throw new Error(itemError.message);
  }

  const lines: AvailabilityOverviewCommittedLine[] = [];
  for (const item of items ?? []) {
    const order = orderById.get(asId((item as { order_id?: string }).order_id));
    const cakeId = asId((item as { cake_id?: string }).cake_id);
    if (!order || !cakeId) continue;
    lines.push({
      orderStatus: order.status,
      orderPickupDate: order.pickupDate,
      orderCollectionId: order.collectionId,
      itemCakeId: cakeId,
      itemSizeId: asOptionalId(
        (item as { cake_size_id?: string | null }).cake_size_id,
      ),
      quantity: Number((item as { quantity?: number }).quantity ?? 0),
    });
  }
  return lines;
}

async function loadLabels(input: {
  cakeIds: string[];
  sizeIds: string[];
  collectionIds: string[];
}): Promise<{
  cakeNames: Map<string, string>;
  sizeLabels: Map<string, string>;
  collectionNames: Map<string, string>;
}> {
  const supabase = await createClient();
  const [{ data: cakes }, { data: sizes }, { data: collections }] =
    await Promise.all([
      input.cakeIds.length > 0
        ? supabase.from("library_cakes").select("id, name").in("id", input.cakeIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      input.sizeIds.length > 0
        ? supabase
            .from("library_cake_sizes")
            .select("id, label")
            .in("id", input.sizeIds)
        : Promise.resolve({ data: [] as Array<{ id: string; label: string }> }),
      input.collectionIds.length > 0
        ? supabase
            .from("collections")
            .select("id, name")
            .in("id", input.collectionIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

  return {
    cakeNames: new Map(
      (cakes ?? []).map((row) => [
        String((row as { id: string }).id),
        String((row as { name: string }).name),
      ]),
    ),
    sizeLabels: new Map(
      (sizes ?? []).map((row) => [
        String((row as { id: string }).id),
        String((row as { label: string }).label),
      ]),
    ),
    collectionNames: new Map(
      (collections ?? []).map((row) => [
        String((row as { id: string }).id),
        String((row as { name?: string }).name ?? "Catalogue"),
      ]),
    ),
  };
}

export async function listAvailabilityOverview(
  fromParam: string | null | undefined,
  todayYmd: string,
): Promise<AvailabilityOverviewWindow> {
  const from = parseAvailabilityOverviewFrom(fromParam, todayYmd);
  const dates = availabilityOverviewDates(from);
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) {
    return { from, to: from, dates: [], days: [] };
  }

  const [closedDates, rawRows, lines] = await Promise.all([
    loadClosedPickupDates(first, last),
    loadCapacityRows(first, last),
    loadCommittedLines(first, last),
  ]);

  const cakeIds = [
    ...new Set(rawRows.map((row) => asId(row.library_cake_id)).filter(Boolean)),
  ];
  const sizeIds = [
    ...new Set(
      rawRows
        .map((row) => asOptionalId(row.library_cake_size_id) ?? "")
        .filter(Boolean),
    ),
  ];
  const collectionIds = [
    ...new Set(
      rawRows
        .map((row) => asOptionalId(row.collection_id) ?? "")
        .filter(Boolean),
    ),
  ];
  const labels = await loadLabels({ cakeIds, sizeIds, collectionIds });

  const rows: AvailabilityOverviewCapacityRow[] = rawRows.map((row) => {
    const pickupDate = String(row.pickup_date ?? "").slice(0, 10);
    const cakeId = asId(row.library_cake_id);
    const sizeId = asOptionalId(row.library_cake_size_id);
    const collectionId = asOptionalId(row.collection_id);
    return {
      pickupDate,
      cakeId,
      cakeName: labels.cakeNames.get(cakeId) ?? "Cake",
      sizeId,
      sizeLabel: sizeId ? (labels.sizeLabels.get(sizeId) ?? "Size") : null,
      collectionId,
      collectionLabel: collectionId
        ? (labels.collectionNames.get(collectionId) ?? "Catalogue")
        : null,
      capacityQuantity: Number(row.capacity_quantity ?? 0),
      committedQuantity: committedQuantityForOverviewRow(lines, {
        pickupDate,
        cakeId,
        sizeId,
        collectionId,
      }),
    };
  });

  return {
    from,
    to: last,
    dates,
    days: buildAvailabilityOverviewDays({
      dates,
      closedDates,
      rows,
    }),
  };
}
