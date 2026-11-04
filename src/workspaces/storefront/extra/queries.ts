import {
  extraActionableFreshPickDays,
  freshPickCustomerStatusLabel,
  freshPickProductDescription,
  groupCustomerFreshPickOfferings,
  isPublishedFreshPick,
  sortCustomerFreshPicksByAvailabilityDay,
  type FreshPickDay,
} from "@/engines/extra/customer-fresh-picks";
import { extraCustomerVisibleFulfilmentDates } from "@/engines/extra/fresh-picks-fulfilment";
import type { FreshPicksPreparationConfig } from "@/engines/extra/fresh-picks-preparation";
import { isExtraWalkInHeld } from "@/engines/extra/walk-in-hold";
import { resolveCakePhoto } from "@/engines/menu/cake-photos";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import { toBusinessDateKey } from "@/lib/dates";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { createPublicClient } from "@/lib/supabase/server";
import { isMissingCakePhotoSchema } from "@/workspaces/library/cakes/photo-storage";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import {
  mapStorefrontCakePhoto,
  STOREFRONT_CAKE_PHOTO_SELECT,
  STOREFRONT_CAKE_PHOTO_SELECT_LEGACY,
  type StorefrontCakePhotoRow,
} from "@/workspaces/storefront/catalog/cake-photo-map";
import { loadFreshPicksPreparationConfig } from "@/workspaces/storefront/extra/config";
import { STOREFRONT_PUBLISHED_CAKES_CACHE_TAG } from "@/workspaces/storefront/catalog/published-cake-cache";

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
  readyForCollection: boolean;
  day: FreshPickDay;
  days: FreshPickDay[];
  extraStockIds: string[];
  walkInHeld: boolean;
  availabilityLabel: string;
  imageUrl: string | null;
  imageAlt: string | null;
  imageLookupFailed: boolean;
  unitPrice: number | null;
  description: string | null;
};

export type StorefrontExtraListing = {
  picks: StorefrontExtraPick[];
  temporarilyUnavailable: boolean;
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
  order_id?: string | null;
  cut_into_slices_at?: string | null;
  ready_for_collection?: boolean | null;
  walk_in_held_until?: string | null;
};

type PhotoRow = StorefrontCakePhotoRow & {
  cake_id: string;
};

type CakeDescriptionRow = {
  id: string;
  description: string | null;
};

const FRESH_PICK_DIAGNOSTICS_ENABLED = process.env.VERCEL_ENV === "preview" && process.env.FLOUR_CATALOG_DIAGNOSTICS === "1";

async function freshPickPlatformRequestId(): Promise<string | null> {
  if (!FRESH_PICK_DIAGNOSTICS_ENABLED) return null;
  const value = (await headers()).get("x-vercel-id");
  return value && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value) ? value : null;
}

function extraErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[0-9A-Z_]{1,16}$/.test(code) ? code : null;
}

function isFreshPickTimeout(error: unknown): boolean {
  if (extraErrorCode(error) === "57014") return true;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && /timeout|timed out|query canceled|query cancelled/i.test(message);
}

function logFreshPickDiagnostic(input: { operation: string; stage: string; correlationId: string | null; requestId?: string | null; durationMs: number; inputCount?: number; resultCount?: number | null; fanout?: number; cacheEvent?: string | null; error?: unknown }): void {
  if (!FRESH_PICK_DIAGNOSTICS_ENABLED) return;
  console.info("[FRESH_PICK_READ_DIAGNOSTIC]", JSON.stringify({
    operation: input.operation,
    stage: input.stage,
    correlationId: input.correlationId,
    requestId: input.requestId ?? null,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    inputCount: input.inputCount ?? null,
    resultCount: input.resultCount == null ? null : Math.max(0, Math.trunc(input.resultCount)),
    fanout: input.fanout ?? null,
    cacheEvent: input.cacheEvent ?? null,
    status: input.error === undefined ? "ok" : "error",
    errorCode: input.error === undefined ? null : extraErrorCode(input.error),
    timeout: input.error === undefined ? false : isFreshPickTimeout(input.error),
  }));
}

async function measureFreshPickStage<T>(operation: string, stage: string, correlationId: string | null, inputCount: number, task: () => PromiseLike<T>, options: { cacheEvent?: string | null; fanout?: number; requestId?: string | null; countResult?: (result: T) => number | null } = {}): Promise<T> {
  if (!FRESH_PICK_DIAGNOSTICS_ENABLED) return task();
  const started = Date.now();
  try {
    const result = await task();
    const queryError = result && typeof result === "object" && "error" in result ? (result as { error?: unknown }).error : undefined;
    const data = result && typeof result === "object" && "data" in result ? (result as { data?: unknown }).data : undefined;
    logFreshPickDiagnostic({ operation, stage, correlationId, requestId: options.requestId, durationMs: Date.now() - started, inputCount, resultCount: options.countResult ? options.countResult(result) : Array.isArray(data) ? data.length : Array.isArray(result) ? result.length : null, fanout: options.fanout, cacheEvent: options.cacheEvent, error: queryError ?? undefined });
    return result;
  } catch (error) {
    logFreshPickDiagnostic({ operation, stage, correlationId, requestId: options.requestId, durationMs: Date.now() - started, inputCount, fanout: options.fanout, cacheEvent: options.cacheEvent, error });
    throw error;
  }
}

function publishedNow(row: ExtraRow, now: Date): boolean {
  return !row.order_id && isPublishedFreshPick({
    lifecycle: row.lifecycle,
    pickupThroughAt: row.pickup_through_at,
    confirmedAt: row.confirmed_at,
    soldAt: row.sold_at,
    cutIntoSlicesAt: row.cut_into_slices_at,
    walkInHeldUntil: row.walk_in_held_until,
    now,
  });
}

function daysFromRemainingPickup(
  pickupAvailableFromAt: string | null,
  pickupThroughAt: string | null,
  readyForCollection: boolean,
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
    readyForCollection,
  });
}

const readCachedExtraPhotoRows = unstable_cache(
  async (cakeIds: string[]): Promise<PhotoRow[]> => {
    const cacheFillId = FRESH_PICK_DIAGNOSTICS_ENABLED ? randomUUID() : null;
    const cacheStarted = Date.now();
    logFreshPickDiagnostic({ operation: "fresh_pick_photos", stage: "cache_fill_start", correlationId: cacheFillId, durationMs: 0, inputCount: cakeIds.length, cacheEvent: "cache_fill_or_revalidation" });
    const supabase = createPublicClient();
    const run = (photoSelect: string) =>
      measureFreshPickStage("fresh_pick_photos", "library_cake_photos_metadata", cacheFillId, cakeIds.length, () => supabase
        .from("library_cake_photos")
        .select(`cake_id, ${photoSelect}`)
        .in("cake_id", cakeIds)
        .order("sort_order", { ascending: true }), { cacheEvent: "cache_fill_or_revalidation" });

    try {
      let result = await run(STOREFRONT_CAKE_PHOTO_SELECT);
      if (result.error && isMissingCakePhotoSchema(result.error.message)) {
        result = await run(STOREFRONT_CAKE_PHOTO_SELECT_LEGACY);
      }
      if (result.error) {
        if (isMissingCakePhotoSchema(result.error.message)) {
          logFreshPickDiagnostic({ operation: "fresh_pick_photos", stage: "cache_fill_end", correlationId: cacheFillId, durationMs: Date.now() - cacheStarted, inputCount: cakeIds.length, resultCount: 0, cacheEvent: "cache_fill_or_revalidation" });
          return [];
        }
        // Throw so a transient read failure is never cached as "no photo".
        throw new Error("Public cake photos are temporarily unavailable.");
      }
      const rows = (result.data ?? []) as unknown as PhotoRow[];
      logFreshPickDiagnostic({ operation: "fresh_pick_photos", stage: "cache_fill_end", correlationId: cacheFillId, durationMs: Date.now() - cacheStarted, inputCount: cakeIds.length, resultCount: rows.length, cacheEvent: "cache_fill_or_revalidation" });
      return rows;
    } catch (error) {
      logFreshPickDiagnostic({ operation: "fresh_pick_photos", stage: "cache_fill_end", correlationId: cacheFillId, durationMs: Date.now() - cacheStarted, inputCount: cakeIds.length, cacheEvent: "cache_fill_or_revalidation", error });
      throw error;
    }
  },
  ["storefront-extra-photos-v1"],
  {
    revalidate: 60,
    tags: [STOREFRONT_PUBLISHED_CAKES_CACHE_TAG],
  },
);

async function extraPhotosByCake(
  cakeIds: string[],
  correlationId: string | null,
  requestId: string | null,
): Promise<{
  photosByCake: Map<string, ReturnType<typeof mapStorefrontCakePhoto>[]>;
  lookupFailed: boolean;
}> {
  const photosByCake = new Map<
    string,
    ReturnType<typeof mapStorefrontCakePhoto>[]
  >();
  if (cakeIds.length === 0) return { photosByCake, lookupFailed: false };

  let rows: PhotoRow[];
  try {
    // Stable input order lets an unchanged public photo set share the cache.
    rows = await measureFreshPickStage("fresh_pick_photos", "cached_photo_metadata_lookup", correlationId, cakeIds.length, () => readCachedExtraPhotoRows([...cakeIds].sort()), { cacheEvent: "cached_call_outcome_unavailable", requestId });
  } catch {
    return { photosByCake, lookupFailed: true };
  }

  for (const photo of rows) {
    if (!photo.image_url) continue;
    const list = photosByCake.get(photo.cake_id) ?? [];
    list.push(mapStorefrontCakePhoto(photo, list.length));
    photosByCake.set(photo.cake_id, list);
  }
  const imageUrlCount = [...photosByCake.values()].reduce((count, photos) => count + photos.length, 0);
  logFreshPickDiagnostic({ operation: "fresh_pick_photos", stage: "photo_urls_resolved", correlationId, requestId, durationMs: 0, inputCount: cakeIds.length, resultCount: imageUrlCount });
  return { photosByCake, lookupFailed: false };
}

async function extraDescriptionsByCake(
  supabase: ReturnType<typeof createPublicClient>,
  cakeIds: string[],
  correlationId: string | null,
  requestId: string | null,
): Promise<Map<string, string | null>> {
  const descriptions = new Map<string, string | null>();
  if (cakeIds.length === 0) return descriptions;
  const { data, error } = await measureFreshPickStage("fresh_pick_description", "library_cakes_description", correlationId, cakeIds.length, () => supabase
    .from("library_cakes")
    .select("id, description")
    .in("id", cakeIds), { requestId });
  if (error) return descriptions;
  for (const row of (data ?? []) as CakeDescriptionRow[]) {
    descriptions.set(row.id, freshPickProductDescription(row.description));
  }
  return descriptions;
}

async function extraPriceOn(
  supabase: ReturnType<typeof createPublicClient>,
  sizeId: string | null,
  pickupDate: string | null,
  operation: string,
  correlationId: string | null,
  requestId: string | null,
): Promise<number | null> {
  if (!sizeId || !pickupDate) return null;
  const { data, error } = await measureFreshPickStage(operation, "library_cake_size_price_on", correlationId, 1, () => supabase.rpc("library_cake_size_price_on", {
    p_cake_size_id: sizeId,
    p_pickup_date: pickupDate,
  }), { requestId });
  if (error || data == null) return null;
  const price = Number(data);
  return Number.isFinite(price) ? price : null;
}

async function extraListingDetails(
  supabase: ReturnType<typeof createPublicClient>,
  rows: ExtraRow[],
  correlationId: string | null,
  requestId: string | null,
): Promise<{
  photosByCake: Map<string, ReturnType<typeof mapStorefrontCakePhoto>[]>;
  photoLookupFailed: boolean;
  descriptionByCake: Map<string, string | null>;
}> {
  const cakeIds = [
    ...new Set(
      rows
        .map((row) => row.library_cake_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [photoLookup, descriptionByCake] = await measureFreshPickStage(
    "fresh_pick_details",
    "photo_and_description_fanout",
    correlationId,
    cakeIds.length,
    () => Promise.all([
      extraPhotosByCake(cakeIds, correlationId, requestId),
      extraDescriptionsByCake(supabase, cakeIds, correlationId, requestId),
    ]),
    { fanout: 2, requestId, countResult: (result) => result[0].photosByCake.size },
  );
  return {
    photosByCake: photoLookup.photosByCake,
    photoLookupFailed: photoLookup.lookupFailed,
    descriptionByCake,
  };
}

function mapPick(
  row: ExtraRow,
  todayYmd: string,
  now: Date,
  photosByCake: Map<string, ReturnType<typeof mapStorefrontCakePhoto>[]>,
  photoLookupFailed: boolean,
  unitPrice: number | null,
  description: string | null,
  snapshot: OperatingHoursSnapshot,
  config: FreshPicksPreparationConfig,
): StorefrontExtraPick | null {
  const days = daysFromRemainingPickup(
    row.pickup_available_from_at,
    row.pickup_through_at,
    row.ready_for_collection === true,
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
  const walkInHeld = isExtraWalkInHeld({
    walkInHeldUntil: row.walk_in_held_until,
    now,
  });
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
    readyForCollection: row.ready_for_collection === true,
    day,
    days,
    extraStockIds: [row.id],
    walkInHeld,
    availabilityLabel: freshPickCustomerStatusLabel({ walkInHeld, days }),
    imageUrl: image?.url ?? null,
    imageAlt: image?.altText ?? null,
    imageLookupFailed: photoLookupFailed && Boolean(row.library_cake_id),
    unitPrice,
    description,
  };
}

/**
 * Bakery-confirmed Extra currently visible to customers, including active
 * walk-in holds. Matching cake/size/price units share one offering; extra_stock.id
 * values stay independent. Held units are listed but not orderable.
 */
export async function listStorefrontAvailableExtra(): Promise<
  StorefrontExtraListing
> {
  await connection();
  const correlationId = FRESH_PICK_DIAGNOSTICS_ENABLED ? randomUUID() : null;
  const requestId = await freshPickPlatformRequestId();
  const requestStarted = Date.now();
  let resultCount = 0;
  let requestFailure: unknown;
  logFreshPickDiagnostic({ operation: "fresh_pick_listing", stage: "request_start", correlationId, requestId, durationMs: 0 });
  try {
    const todayYmd = toBusinessDateKey();
    const supabase = createPublicClient();
    const { data, error } = await measureFreshPickStage("fresh_pick_listing", "extra_stock_query", correlationId, 0, () => supabase
      .from("extra_stock")
      .select(
        "id, lifecycle, cake_name, size_label, library_cake_id, library_cake_size_id, prepared_on, pickup_available_from_at, pickup_through_at, confirmed_at, sold_at, order_id, cut_into_slices_at, walk_in_held_until, ready_for_collection",
      )
      .eq("lifecycle", "confirmed")
      .is("sold_at", null)
      .is("cut_into_slices_at", null), { requestId });

    if (error) {
      requestFailure = error;
      return { picks: [], temporarilyUnavailable: true };
    }

    const now = new Date();
    const live = ((data ?? []) as ExtraRow[]).filter((row) =>
      publishedNow(row, now),
    );
    const [details, hoursSnapshot, config] = await Promise.all([
      measureFreshPickStage("fresh_pick_listing", "photo_description_details", correlationId, live.length, () => extraListingDetails(supabase, live, correlationId, requestId), { fanout: 2, requestId, countResult: (result) => result.photosByCake.size }),
      measureFreshPickStage("fresh_pick_listing", "operating_hours_snapshot", correlationId, 0, () => loadOperatingHoursSnapshot(), { requestId }),
      measureFreshPickStage("fresh_pick_listing", "preparation_config", correlationId, 0, () => loadFreshPicksPreparationConfig(), { requestId }),
    ]);
    const priceByExtraId = new Map<string, number | null>();
    await measureFreshPickStage("fresh_pick_listing", "price_rpc_fanout", correlationId, live.length, () => Promise.all(
      live.map(async (row) => {
        const pickupDate = extraCustomerVisibleFulfilmentDates({
          window: {
            pickupAvailableFromAt: row.pickup_available_from_at ?? "",
            orderCutoffAt: row.pickup_through_at ?? "",
          },
          readyForCollection: row.ready_for_collection === true,
          now,
          snapshot: hoursSnapshot,
          config,
        })[0];
        priceByExtraId.set(
          row.id,
          await extraPriceOn(supabase, row.library_cake_size_id, pickupDate ?? null, "fresh_pick_listing", correlationId, requestId),
        );
      }),
    ), { fanout: live.length, requestId });
    const units = live
      .map((row) =>
        mapPick(
          row,
          todayYmd,
          now,
          details.photosByCake,
          details.photoLookupFailed,
          priceByExtraId.get(row.id) ?? null,
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
      availabilityLabel: freshPickCustomerStatusLabel({
        walkInHeld: pick.walkInHeld,
        days: pick.days,
      }),
    }));
    resultCount = picks.length;
    return {
      picks: sortCustomerFreshPicksByAvailabilityDay(picks),
      temporarilyUnavailable: false,
    };
  } catch (error) {
    requestFailure = error;
    return { picks: [], temporarilyUnavailable: true };
  } finally {
    logFreshPickDiagnostic({ operation: "fresh_pick_listing", stage: "request_end", correlationId, requestId, durationMs: Date.now() - requestStarted, resultCount, error: requestFailure });
  }
}

export async function getStorefrontExtraById(
  extraId: string,
): Promise<StorefrontExtraPick | null> {
  const id = extraId.trim();
  if (!id) return null;
  await connection();
  const correlationId = FRESH_PICK_DIAGNOSTICS_ENABLED ? randomUUID() : null;
  const requestId = await freshPickPlatformRequestId();
  const requestStarted = Date.now();
  let resultCount = 0;
  let requestFailure: unknown;
  logFreshPickDiagnostic({ operation: "fresh_pick_detail", stage: "request_start", correlationId, requestId, durationMs: 0 });
  try {
    const todayYmd = toBusinessDateKey();
    const supabase = createPublicClient();
    const { data, error } = await measureFreshPickStage("fresh_pick_detail", "extra_stock_query", correlationId, 1, () => supabase
      .from("extra_stock")
      .select(
        "id, lifecycle, cake_name, size_label, library_cake_id, library_cake_size_id, prepared_on, pickup_available_from_at, pickup_through_at, confirmed_at, sold_at, order_id, cut_into_slices_at, walk_in_held_until, ready_for_collection",
      )
      .eq("id", id)
      .maybeSingle(), { requestId });
    if (error || !data) {
      requestFailure = error;
      return null;
    }
    const now = new Date();
    const row = data as ExtraRow;
    if (!publishedNow(row, now)) return null;
    if (!row.pickup_available_from_at || !row.pickup_through_at) return null;
    const [hoursSnapshot, config, details] = await Promise.all([
      measureFreshPickStage("fresh_pick_detail", "operating_hours_snapshot", correlationId, 0, () => loadOperatingHoursSnapshot(), { requestId }),
      measureFreshPickStage("fresh_pick_detail", "preparation_config", correlationId, 0, () => loadFreshPicksPreparationConfig(), { requestId }),
      measureFreshPickStage("fresh_pick_detail", "photo_description_details", correlationId, Number(Boolean(row.library_cake_id)), () => extraListingDetails(supabase, [row], correlationId, requestId), { fanout: 2, requestId, countResult: (result) => result.photosByCake.size }),
    ]);
    const pickupDates = extraCustomerVisibleFulfilmentDates({
        window: {
          pickupAvailableFromAt: row.pickup_available_from_at,
          orderCutoffAt: row.pickup_through_at,
        },
        readyForCollection: row.ready_for_collection === true,
        now,
        snapshot: hoursSnapshot,
        config,
      });
    if (pickupDates.length === 0) {
      return null;
    }
    const unitPrice = await extraPriceOn(supabase, row.library_cake_size_id, pickupDates[0] ?? null, "fresh_pick_detail", correlationId, requestId);

    const pick = mapPick(
      row,
      todayYmd,
      now,
      details.photosByCake,
      details.photoLookupFailed,
      unitPrice,
      row.library_cake_id
        ? (details.descriptionByCake.get(row.library_cake_id) ?? null)
        : null,
      hoursSnapshot,
      config,
    );
    resultCount = pick ? 1 : 0;
    return pick;
  } catch (error) {
    requestFailure = error;
    return null;
  } finally {
    logFreshPickDiagnostic({ operation: "fresh_pick_detail", stage: "request_end", correlationId, requestId, durationMs: Date.now() - requestStarted, resultCount, error: requestFailure });
  }
}
