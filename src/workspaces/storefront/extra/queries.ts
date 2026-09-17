import {
  extraActionableFreshPickDays,
  freshPickAvailabilityLabel,
  freshPickProductDescription,
  groupCustomerFreshPickOfferings,
  isPublishedFreshPick,
  sortCustomerFreshPicksByAvailabilityDay,
  type FreshPickDay,
} from "@/engines/extra/customer-fresh-picks";
import { extraCustomerVisibleFulfilmentDates } from "@/engines/extra/fresh-picks-fulfilment";
import type { FreshPicksPreparationConfig } from "@/engines/extra/fresh-picks-preparation";
import { resolveCakePhoto } from "@/engines/menu/cake-photos";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import { toBusinessDateKey } from "@/lib/dates";
import { createPublicClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import { isMissingCakePhotoSchema } from "@/workspaces/library/cakes/photo-storage";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import {
  mapStorefrontCakePhoto,
  STOREFRONT_CAKE_PHOTO_SELECT,
  STOREFRONT_CAKE_PHOTO_SELECT_LEGACY,
  type StorefrontCakePhotoRow,
} from "@/workspaces/storefront/catalog/cake-photo-map";
import { loadFreshPicksPreparationConfig } from "@/workspaces/storefront/extra/config";

export type StorefrontExtraPick = {
  id: string;
  cakeName: string;
  sizeLabel: string;
  libraryCakeId: string | null;
  libraryCakeSizeId: string | null;
  preparedOn: string | null;
  pickupAvailableFromAt: string | null;
  pickupThroughAt: string | null;
  confirmedAt: string | null;
  soldAt: string | null;
  day: FreshPickDay;
  days: FreshPickDay[];
  extraStockIds: string[];
  availabilityLabel: string;
  imageUrl: string | null;
  imageAlt: string | null;
  unitPrice: number | null;
  description: string | null;
};

type ExtraRow = {
  id: string;
  lifecycle: "proposed" | "confirmed" | "rejected";
  cake_name: string;
  size_label: string;
  library_cake_id: string | null;
  library_cake_size_id: string | null;
  prepared_on: string | null;
  pickup_available_from_at: string | null;
  pickup_through_at: string | null;
  confirmed_at: string | null;
  sold_at: string | null;
  cut_into_slices_at?: string | null;
};

type PhotoRow = StorefrontCakePhotoRow & {
  cake_id: string;
};

type SizePriceRow = {
  id: string;
  price: number | string;
};

type CakeDescriptionRow = {
  id: string;
  description: string | null;
};

function publishedNow(row: ExtraRow, now: Date): boolean {
  return isPublishedFreshPick({
    lifecycle: row.lifecycle,
    pickupThroughAt: row.pickup_through_at,
    confirmedAt: row.confirmed_at,
    soldAt: row.sold_at,
    cutIntoSlicesAt: row.cut_into_slices_at,
    now,
  });
}

function daysFromRemainingPickup(
  pickupAvailableFromAt: string | null,
  pickupThroughAt: string | null,
  todayYmd: string,
  now: Date,
  snapshot: OperatingHoursSnapshot,
  config: FreshPicksPreparationConfig,
): FreshPickDay[] {
  return extraActionableFreshPickDays({
    pickupAvailableFromAt,
    orderCutoffAt: pickupThroughAt,
    todayYmd,
    now,
    snapshot,
    config,
  });
}

async function extraPhotosByCake(
  supabase: ReturnType<typeof createPublicClient>,
  cakeIds: string[],
): Promise<Map<string, ReturnType<typeof mapStorefrontCakePhoto>[]>> {
  const photosByCake = new Map<
    string,
    ReturnType<typeof mapStorefrontCakePhoto>[]
  >();
  if (cakeIds.length === 0) return photosByCake;

  const run = (photoSelect: string) =>
    supabase
      .from("library_cake_photos")
      .select(`cake_id, ${photoSelect}`)
      .in("cake_id", cakeIds)
      .order("sort_order", { ascending: true });

  let result = await run(STOREFRONT_CAKE_PHOTO_SELECT);
  if (result.error && isMissingCakePhotoSchema(result.error.message)) {
    result = await run(STOREFRONT_CAKE_PHOTO_SELECT_LEGACY);
  }
  if (result.error) return photosByCake;

  for (const photo of (result.data ?? []) as unknown as PhotoRow[]) {
    if (!photo.image_url) continue;
    const list = photosByCake.get(photo.cake_id) ?? [];
    list.push(mapStorefrontCakePhoto(photo, list.length));
    photosByCake.set(photo.cake_id, list);
  }
  return photosByCake;
}

async function extraDescriptionsByCake(
  supabase: ReturnType<typeof createPublicClient>,
  cakeIds: string[],
): Promise<Map<string, string | null>> {
  const descriptions = new Map<string, string | null>();
  if (cakeIds.length === 0) return descriptions;
  const { data, error } = await supabase
    .from("library_cakes")
    .select("id, description")
    .in("id", cakeIds);
  if (error) return descriptions;
  for (const row of (data ?? []) as CakeDescriptionRow[]) {
    descriptions.set(row.id, freshPickProductDescription(row.description));
  }
  return descriptions;
}

async function extraPricesBySize(
  supabase: ReturnType<typeof createPublicClient>,
  sizeIds: string[],
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (sizeIds.length === 0) return prices;
  const { data, error } = await supabase
    .from("library_cake_sizes")
    .select("id, price")
    .in("id", sizeIds);
  if (error) return prices;
  for (const row of (data ?? []) as SizePriceRow[]) {
    if (row.price == null) continue;
    const price = Number(row.price);
    if (!Number.isFinite(price)) continue;
    prices.set(row.id, price);
  }
  return prices;
}

async function extraListingDetails(
  supabase: ReturnType<typeof createPublicClient>,
  rows: ExtraRow[],
): Promise<{
  photosByCake: Map<string, ReturnType<typeof mapStorefrontCakePhoto>[]>;
  descriptionByCake: Map<string, string | null>;
  priceBySize: Map<string, number>;
}> {
  const cakeIds = [
    ...new Set(
      rows
        .map((row) => row.library_cake_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const sizeIds = [
    ...new Set(
      rows
        .map((row) => row.library_cake_size_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [photosByCake, descriptionByCake, priceBySize] = await Promise.all([
    extraPhotosByCake(supabase, cakeIds),
    extraDescriptionsByCake(supabase, cakeIds),
    extraPricesBySize(supabase, sizeIds),
  ]);
  return { photosByCake, descriptionByCake, priceBySize };
}

function mapPick(
  row: ExtraRow,
  todayYmd: string,
  now: Date,
  photosByCake: Map<string, ReturnType<typeof mapStorefrontCakePhoto>[]>,
  unitPrice: number | null,
  description: string | null,
  snapshot: OperatingHoursSnapshot,
  config: FreshPicksPreparationConfig,
): StorefrontExtraPick | null {
  const days = daysFromRemainingPickup(
    row.pickup_available_from_at,
    row.pickup_through_at,
    todayYmd,
    now,
    snapshot,
    config,
  );
  const day = days[0];
  if (!day) return null;
  const photos = row.library_cake_id
    ? (photosByCake.get(row.library_cake_id) ?? [])
    : [];
  const image = resolveCakePhoto(photos, row.library_cake_size_id);
  return {
    id: row.id,
    cakeName: row.cake_name,
    sizeLabel: row.size_label,
    libraryCakeId: row.library_cake_id,
    libraryCakeSizeId: row.library_cake_size_id,
    preparedOn: row.prepared_on,
    pickupAvailableFromAt: row.pickup_available_from_at,
    pickupThroughAt: row.pickup_through_at,
    confirmedAt: row.confirmed_at,
    soldAt: row.sold_at,
    day,
    days,
    extraStockIds: [row.id],
    availabilityLabel: freshPickAvailabilityLabel(days),
    imageUrl: image?.url ?? null,
    imageAlt: image?.altText ?? null,
    unitPrice,
    description,
  };
}

/**
 * Bakery-confirmed Extra currently orderable. Matching cake/size/price units
 * share one customer-facing offering; extra_stock.id values stay independent.
 */
export async function listStorefrontAvailableExtra(): Promise<
  StorefrontExtraPick[]
> {
  await connection();
  try {
    const todayYmd = toBusinessDateKey();
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("extra_stock")
      .select(
        "id, lifecycle, cake_name, size_label, library_cake_id, library_cake_size_id, prepared_on, pickup_available_from_at, pickup_through_at, confirmed_at, sold_at, cut_into_slices_at",
      )
      .eq("lifecycle", "confirmed")
      .is("sold_at", null)
      .is("cut_into_slices_at", null);

    if (error) {
      return [];
    }

    const now = new Date();
    const live = ((data ?? []) as ExtraRow[]).filter((row) =>
      publishedNow(row, now),
    );
    const [details, hoursSnapshot, config] = await Promise.all([
      extraListingDetails(supabase, live),
      loadOperatingHoursSnapshot(),
      loadFreshPicksPreparationConfig(),
    ]);
    const units = live
      .map((row) =>
        mapPick(
          row,
          todayYmd,
          now,
          details.photosByCake,
          row.library_cake_size_id
            ? (details.priceBySize.get(row.library_cake_size_id) ?? null)
            : null,
          row.library_cake_id
            ? (details.descriptionByCake.get(row.library_cake_id) ?? null)
            : null,
          hoursSnapshot,
          config,
        ),
      )
      .filter((pick): pick is StorefrontExtraPick => pick != null);
    const picks = groupCustomerFreshPickOfferings(units).map((pick) => ({
      ...pick,
      day: pick.days[0] ?? pick.day,
      availabilityLabel: freshPickAvailabilityLabel(pick.days),
    }));
    return sortCustomerFreshPicksByAvailabilityDay(picks);
  } catch {
    return [];
  }
}

export async function getStorefrontExtraById(
  extraId: string,
): Promise<StorefrontExtraPick | null> {
  const id = extraId.trim();
  if (!id) return null;
  await connection();
  try {
    const todayYmd = toBusinessDateKey();
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("extra_stock")
      .select(
        "id, lifecycle, cake_name, size_label, library_cake_id, library_cake_size_id, prepared_on, pickup_available_from_at, pickup_through_at, confirmed_at, sold_at, cut_into_slices_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const now = new Date();
    const row = data as ExtraRow;
    if (!publishedNow(row, now)) return null;
    if (!row.pickup_available_from_at || !row.pickup_through_at) return null;
    const [hoursSnapshot, config, details] = await Promise.all([
      loadOperatingHoursSnapshot(),
      loadFreshPicksPreparationConfig(),
      extraListingDetails(supabase, [row]),
    ]);
    if (
      extraCustomerVisibleFulfilmentDates({
        window: {
          pickupAvailableFromAt: row.pickup_available_from_at,
          orderCutoffAt: row.pickup_through_at,
        },
        now,
        snapshot: hoursSnapshot,
        config,
      }).length === 0
    ) {
      return null;
    }

    return mapPick(
      row,
      todayYmd,
      now,
      details.photosByCake,
      row.library_cake_size_id
        ? (details.priceBySize.get(row.library_cake_size_id) ?? null)
        : null,
      row.library_cake_id
        ? (details.descriptionByCake.get(row.library_cake_id) ?? null)
        : null,
      hoursSnapshot,
      config,
    );
  } catch {
    return null;
  }
}
