import {
  extraActionableFreshPickDay,
  isPublishedFreshPick,
  selectCustomerFreshPickOfferings,
  freshPickAvailabilityLabel,
  type FreshPickDay,
} from "@/engines/extra/customer-fresh-picks";
import { resolveCakePhoto } from "@/engines/menu/cake-photos";
import { extraOrderablePickupDates } from "@/engines/extra/extra-pickup";
import { toBusinessDateKey } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { isMissingCakePhotoSchema } from "@/workspaces/library/cakes/photo-storage";
import {
  mapStorefrontCakePhoto,
  STOREFRONT_CAKE_PHOTO_SELECT,
  STOREFRONT_CAKE_PHOTO_SELECT_LEGACY,
  type StorefrontCakePhotoRow,
} from "@/workspaces/storefront/catalog/cake-photo-map";

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
  availabilityLabel: string;
  imageUrl: string | null;
  imageAlt: string | null;
  unitPrice: number | null;
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
};

type PhotoRow = StorefrontCakePhotoRow & {
  cake_id: string;
};

type SizePriceRow = {
  id: string;
  price: number | string;
};

function publishedNow(row: ExtraRow, now: Date): boolean {
  return isPublishedFreshPick({
    lifecycle: row.lifecycle,
    pickupThroughAt: row.pickup_through_at,
    confirmedAt: row.confirmed_at,
    soldAt: row.sold_at,
    now,
  });
}

function dayFromRemainingPickup(
  pickupAvailableFromAt: string | null,
  pickupThroughAt: string | null,
  todayYmd: string,
  now: Date,
): FreshPickDay | null {
  return extraActionableFreshPickDay({
    pickupAvailableFromAt,
    orderCutoffAt: pickupThroughAt,
    todayYmd,
    now,
  });
}

async function extraPhotosByCake(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

function mapPick(
  row: ExtraRow,
  todayYmd: string,
  now: Date,
  photosByCake: Map<string, ReturnType<typeof mapStorefrontCakePhoto>[]>,
  unitPrice: number | null,
): StorefrontExtraPick | null {
  const day = dayFromRemainingPickup(
    row.pickup_available_from_at,
    row.pickup_through_at,
    todayYmd,
    now,
  );
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
    availabilityLabel: freshPickAvailabilityLabel(day),
    imageUrl: image?.url ?? null,
    imageAlt: image?.altText ?? null,
    unitPrice,
  };
}

/**
 * Bakery-confirmed Extra currently orderable, one card per cake offering.
 * Independent of monthly catalogues. Never invents extra stock.
 */
export async function listStorefrontAvailableExtra(): Promise<
  StorefrontExtraPick[]
> {
  try {
    const todayYmd = toBusinessDateKey();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("extra_stock")
      .select(
        "id, lifecycle, cake_name, size_label, library_cake_id, library_cake_size_id, prepared_on, pickup_available_from_at, pickup_through_at, confirmed_at, sold_at",
      )
      .eq("lifecycle", "confirmed")
      .is("sold_at", null);

    if (error) {
      return [];
    }

    const now = new Date();
    const live = ((data ?? []) as ExtraRow[]).filter((row) =>
      publishedNow(row, now),
    );
    const cakeIds = [
      ...new Set(
        live
          .map((row) => row.library_cake_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const photosByCake = await extraPhotosByCake(supabase, cakeIds);
    const picks = live
      .map((row) => mapPick(row, todayYmd, now, photosByCake, null))
      .filter((pick): pick is StorefrontExtraPick => pick != null);
    return selectCustomerFreshPickOfferings(picks);
  } catch {
    return [];
  }
}

export async function getStorefrontExtraById(
  extraId: string,
): Promise<StorefrontExtraPick | null> {
  const id = extraId.trim();
  if (!id) return null;
  try {
    const todayYmd = toBusinessDateKey();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("extra_stock")
      .select(
        "id, lifecycle, cake_name, size_label, library_cake_id, library_cake_size_id, prepared_on, pickup_available_from_at, pickup_through_at, confirmed_at, sold_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const now = new Date();
    const row = data as ExtraRow;
    if (!publishedNow(row, now)) return null;
    if (!row.pickup_available_from_at || !row.pickup_through_at) return null;
    if (
      extraOrderablePickupDates({
        pickupAvailableFromAt: row.pickup_available_from_at,
        orderCutoffAt: row.pickup_through_at,
      }).length === 0
    ) {
      return null;
    }

    const photosByCake = await extraPhotosByCake(
      supabase,
      row.library_cake_id ? [row.library_cake_id] : [],
    );
    let unitPrice: number | null = null;
    if (row.library_cake_size_id) {
      const { data: size } = await supabase
        .from("library_cake_sizes")
        .select("id, price")
        .eq("id", row.library_cake_size_id)
        .maybeSingle();
      const price = (size as SizePriceRow | null)?.price;
      if (price != null) unitPrice = Number(price);
    }
    return mapPick(row, todayYmd, now, photosByCake, unitPrice);
  } catch {
    return null;
  }
}
