import {
  isExtraAvailable,
  isExtraConfirmedOnOffer,
  type ExtraLifecycle,
} from "@/engines/extra/availability";
import { compareHomeFreshPickUnits } from "@/engines/extra/home-fresh-picks";
import { isExtraWalkInHeld } from "@/engines/extra/walk-in-hold";
import { resolveCakePhoto, type ResolvableCakePhoto } from "@/engines/menu/cake-photos";
import { sortCakeSizesByNumericLabel } from "@/engines/menu/cake-size-order";
import { createClient } from "@/lib/supabase/server";
import { isMissingCakePhotoSchema } from "@/workspaces/library/cakes/photo-storage";
import type { ExtraCakeOption, ExtraStockUnit } from "@/workspaces/extra/types";

type ExtraStockRow = {
  id: string;
  lifecycle: ExtraLifecycle;
  cake_name: string;
  size_label: string;
  library_cake_id: string | null;
  library_cake_size_id: string | null;
  prepared_on: string | null;
  pickup_available_from_at: string | null;
  pickup_through_at: string | null;
  sold_at: string | null;
  cut_into_slices_at: string | null;
  walk_in_held_at: string | null;
  walk_in_held_until: string | null;
  walk_in_held_by: string | null;
  walk_in_hold_extended_at: string | null;
  walk_in_hold_reminder_sent_at: string | null;
  note: string | null;
  proposed_at: string;
  proposed_by: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  reject_reason: string | null;
  proposer?: { display_name: string | null } | null;
  confirmer?: { display_name: string | null } | null;
  rejecter?: { display_name: string | null } | null;
  holder?: { display_name: string | null } | null;
};

const EXTRA_SELECT = `
  id,
  lifecycle,
  cake_name,
  size_label,
  library_cake_id,
  library_cake_size_id,
  prepared_on,
  pickup_available_from_at,
  pickup_through_at,
  sold_at,
  cut_into_slices_at,
  walk_in_held_at,
  walk_in_held_until,
  walk_in_held_by,
  walk_in_hold_extended_at,
  walk_in_hold_reminder_sent_at,
  note,
  proposed_at,
  proposed_by,
  confirmed_at,
  confirmed_by,
  rejected_at,
  rejected_by,
  reject_reason,
  proposer:staff_profiles!proposed_by ( display_name ),
  confirmer:staff_profiles!confirmed_by ( display_name ),
  rejecter:staff_profiles!rejected_by ( display_name ),
  holder:staff_profiles!walk_in_held_by ( display_name )
`;

function staffName(
  embed: { display_name: string | null } | { display_name: string | null }[] | null | undefined,
): string | null {
  if (!embed) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.display_name ?? null;
}

export function mapExtraStockRow(
  row: ExtraStockRow,
  now = new Date(),
): ExtraStockUnit {
  return {
    id: row.id,
    lifecycle: row.lifecycle,
    cakeName: row.cake_name,
    sizeLabel: row.size_label,
    libraryCakeId: row.library_cake_id,
    libraryCakeSizeId: row.library_cake_size_id,
    preparedOn: row.prepared_on,
    pickupAvailableFromAt: row.pickup_available_from_at,
    pickupThroughAt: row.pickup_through_at,
    soldAt: row.sold_at,
    cutIntoSlicesAt: row.cut_into_slices_at,
    walkInHeldAt: row.walk_in_held_at,
    walkInHeldUntil: row.walk_in_held_until,
    walkInHeldBy: row.walk_in_held_by,
    walkInHeldByName: staffName(row.holder),
    walkInHoldExtendedAt: row.walk_in_hold_extended_at,
    walkInHoldReminderSentAt: row.walk_in_hold_reminder_sent_at,
    walkInHeld: isExtraWalkInHeld({
      walkInHeldUntil: row.walk_in_held_until,
      now,
    }),
    assignedOrderId: null,
    assignedOrderNumber: null,
    assignedGuestName: null,
    note: row.note,
    proposedAt: row.proposed_at,
    proposedBy: row.proposed_by,
    proposedByName: staffName(row.proposer),
    confirmedAt: row.confirmed_at,
    confirmedBy: row.confirmed_by,
    confirmedByName: staffName(row.confirmer),
    rejectedAt: row.rejected_at,
    rejectedBy: row.rejected_by,
    rejectedByName: staffName(row.rejecter),
    rejectReason: row.reject_reason,
    available: isExtraAvailable({
      lifecycle: row.lifecycle,
      pickupThroughAt: row.pickup_through_at,
      soldAt: row.sold_at,
      cutIntoSlicesAt: row.cut_into_slices_at,
      walkInHeldUntil: row.walk_in_held_until,
      now,
    }),
  };
}

type ExtraPhotoRow = {
  id?: string | null;
  cake_id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  cake_size_id?: string | null;
  is_default?: boolean | null;
};

const EXTRA_PHOTO_SELECT =
  "id, image_url, alt_text, sort_order, cake_size_id, is_default";
const EXTRA_PHOTO_SELECT_LEGACY = "image_url, alt_text, sort_order";

function mapExtraCakePhoto(
  photo: ExtraPhotoRow,
  index: number,
): ResolvableCakePhoto & { cakeId: string } {
  return {
    id: photo.id?.trim() || `photo-${index}-${photo.sort_order}`,
    url: photo.image_url,
    altText: photo.alt_text,
    sortOrder: photo.sort_order,
    cakeSizeId: photo.cake_size_id ?? null,
    isDefault: Boolean(photo.is_default),
    cakeId: photo.cake_id,
  };
}

async function extraPhotosByCake(
  cakeIds: string[],
): Promise<Map<string, ResolvableCakePhoto[]>> {
  const photosByCake = new Map<string, ResolvableCakePhoto[]>();
  if (cakeIds.length === 0) return photosByCake;
  const supabase = await createClient();
  const run = (photoSelect: string) =>
    supabase
      .from("library_cake_photos")
      .select(`cake_id, ${photoSelect}`)
      .in("cake_id", cakeIds)
      .order("sort_order", { ascending: true });

  let result = await run(EXTRA_PHOTO_SELECT);
  if (result.error && isMissingCakePhotoSchema(result.error.message)) {
    result = await run(EXTRA_PHOTO_SELECT_LEGACY);
  }
  if (result.error) return photosByCake;

  for (const photo of (result.data ?? []) as unknown as ExtraPhotoRow[]) {
    if (!photo.image_url) continue;
    const mapped = mapExtraCakePhoto(photo, photosByCake.get(photo.cake_id)?.length ?? 0);
    const list = photosByCake.get(photo.cake_id) ?? [];
    list.push(mapped);
    photosByCake.set(photo.cake_id, list);
  }
  return photosByCake;
}

async function extraPricesBySize(sizeIds: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (sizeIds.length === 0) return prices;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cake_sizes")
    .select("id, price")
    .in("id", sizeIds);
  if (error) return prices;
  for (const row of (data ?? []) as Array<{ id: string; price: number | string | null }>) {
    if (row.price == null) continue;
    const price = Number(row.price);
    if (!Number.isFinite(price)) continue;
    prices.set(row.id, price);
  }
  return prices;
}

async function attachHomeFreshPickPresentation(
  units: ExtraStockUnit[],
): Promise<ExtraStockUnit[]> {
  const cakeIds = [
    ...new Set(
      units
        .map((unit) => unit.libraryCakeId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const sizeIds = [
    ...new Set(
      units
        .map((unit) => unit.libraryCakeSizeId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [photosByCake, priceBySize] = await Promise.all([
    extraPhotosByCake(cakeIds),
    extraPricesBySize(sizeIds),
  ]);

  return units.map((unit) => {
    const photos = unit.libraryCakeId
      ? (photosByCake.get(unit.libraryCakeId) ?? [])
      : [];
    const image = resolveCakePhoto(photos, unit.libraryCakeSizeId);
    return {
      ...unit,
      imageUrl: image?.url ?? null,
      imageAlt: image?.altText ?? null,
      unitPrice: unit.libraryCakeSizeId
        ? (priceBySize.get(unit.libraryCakeSizeId) ?? null)
        : null,
    };
  });
}

export async function listExtraStockUnits(): Promise<ExtraStockUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("extra_stock")
    .select(EXTRA_SELECT)
    .order("proposed_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const now = new Date();
  const units = ((data ?? []) as unknown as ExtraStockRow[]).map((row) =>
    mapExtraStockRow(row, now),
  );
  const soldIds = units.filter((unit) => unit.soldAt).map((unit) => unit.id);
  if (soldIds.length === 0) return units;

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, guest_name, extra_stock_id")
    .in("extra_stock_id", soldIds);
  if (orderError) {
    throw new Error(orderError.message);
  }

  const byExtra = new Map<
    string,
    { id: string; order_number: string; guest_name: string | null }
  >();
  for (const order of orders ?? []) {
    const extraId = (order as { extra_stock_id?: string | null }).extra_stock_id;
    if (!extraId) continue;
    byExtra.set(extraId, {
      id: (order as { id: string }).id,
      order_number: String((order as { order_number?: string }).order_number ?? ""),
      guest_name: (order as { guest_name?: string | null }).guest_name ?? null,
    });
  }

  return units.map((unit) => {
    const linked = byExtra.get(unit.id);
    if (!linked) return unit;
    return {
      ...unit,
      assignedOrderId: linked.id,
      assignedOrderNumber: linked.order_number || null,
      assignedGuestName: linked.guest_name,
    };
  });
}

/**
 * Lightweight count of EXTRA awaiting Bakery review.
 * Canonical: lifecycle === "proposed" (same as ExtraBoard Proposed).
 */
export async function countExtraStockProposed(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("extra_stock")
    .select("id", { count: "exact", head: true })
    .eq("lifecycle", "proposed");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

/**
 * Home operational Fresh Picks: confirmed, unsold, uncut, still within
 * order cutoff — including active walk-in holds. Same extra_stock source.
 */
export async function listHomeFreshPickUnits(): Promise<ExtraStockUnit[]> {
  const supabase = await createClient();
  const now = new Date();
  const { data, error } = await supabase
    .from("extra_stock")
    .select(EXTRA_SELECT)
    .eq("lifecycle", "confirmed")
    .is("sold_at", null)
    .is("cut_into_slices_at", null)
    .gte("pickup_through_at", now.toISOString())
    .order("pickup_through_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const units = ((data ?? []) as unknown as ExtraStockRow[])
    .map((row) => mapExtraStockRow(row, now))
    .filter((unit) =>
      isExtraConfirmedOnOffer({
        lifecycle: unit.lifecycle,
        pickupThroughAt: unit.pickupThroughAt,
        soldAt: unit.soldAt,
        cutIntoSlicesAt: unit.cutIntoSlicesAt,
        now,
      }),
    );

  units.sort(compareHomeFreshPickUnits);
  return attachHomeFreshPickPresentation(units);
}

export type ExtraAssignableOrder = {
  id: string;
  orderNumber: string;
  guestName: string;
  pickupDate: string;
  pickupTime: string;
  extraStockId: string | null;
  itemSummary: string;
};

export async function findAssignableOrderForExtra(
  query: string,
): Promise<ExtraAssignableOrder | null> {
  const raw = query.trim();
  if (!raw) return null;
  const supabase = await createClient();
  let lookup = supabase
    .from("orders")
    .select(
      "id, order_number, guest_name, pickup_date, pickup_time, extra_stock_id, status, order_items ( cake_name, size_label, quantity )",
    )
    .neq("status", "cancelled")
    .limit(2);

  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw,
    );
  lookup = uuid
    ? lookup.eq("id", raw)
    : lookup.ilike("order_number", raw);

  const { data, error } = await lookup;
  if (error) {
    throw new Error(error.message);
  }
  const row = (data ?? [])[0];
  if (!row || (data ?? []).length !== 1) return null;

  const items = (
    (row as { order_items?: Array<{ cake_name: string; size_label: string; quantity: number }> })
      .order_items ?? []
  )
    .map((item) => `${item.cake_name} ${item.size_label} ×${item.quantity}`)
    .join(", ");

  return {
    id: (row as { id: string }).id,
    orderNumber: String((row as { order_number?: string }).order_number ?? ""),
    guestName: String((row as { guest_name?: string | null }).guest_name ?? "Guest"),
    pickupDate: String((row as { pickup_date?: string }).pickup_date ?? ""),
    pickupTime: String((row as { pickup_time?: string }).pickup_time ?? ""),
    extraStockId: (row as { extra_stock_id?: string | null }).extra_stock_id ?? null,
    itemSummary: items || "No cake lines",
  };
}

export async function listExtraCakeOptions(): Promise<ExtraCakeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cakes")
    .select(
      "id, name, status, library_cake_sizes ( id, label, sort_order )",
    )
    .in("status", ["active", "seasonal"])
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  type SizeRow = { id: string; label: string; sort_order: number };
  type CakeRow = {
    id: string;
    name: string;
    library_cake_sizes?: SizeRow[] | null;
  };

  return ((data ?? []) as CakeRow[]).map((cake) => ({
    id: cake.id,
    name: cake.name,
    sizes: sortCakeSizesByNumericLabel(
      cake.library_cake_sizes ?? [],
      (size) => size.label,
    ).map((size) => ({ id: size.id, label: size.label })),
  }));
}
