import {
  isExtraAvailable,
  isExtraConfirmedOnOffer,
  type ExtraLifecycle,
} from "@/engines/extra/availability";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  extraCustomerVisibleFulfilmentDates,
  freshPickTodayOrderability,
} from "@/engines/extra/fresh-picks-fulfilment";
import { compareHomeFreshPickUnits } from "@/engines/extra/home-fresh-picks";
import type { FreshPicksPreparationConfig } from "@/engines/extra/fresh-picks-preparation";
import { isExtraWalkInHeld } from "@/engines/extra/walk-in-hold";
import {
  canMarkAssignedPhysicalStockReady,
  classifySoldExtra,
  type SoldExtraOrderSnapshot,
} from "@/engines/extra/sold-stock-lifecycle";
import { resolveCakePhoto, type ResolvableCakePhoto } from "@/engines/menu/cake-photos";
import { sortCakeSizesByNumericLabel } from "@/engines/menu/cake-size-order";
import { createClient } from "@/lib/supabase/server";
import { isMissingCakePhotoSchema } from "@/workspaces/library/cakes/photo-storage";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import { loadFreshPicksPreparationConfig } from "@/workspaces/storefront/extra/config";
import { mapAssignedOrderSummariesByStock } from "@/workspaces/extra/assigned-order-links";
import type { ExtraCakeOption, ExtraStockUnit } from "@/workspaces/extra/types";
import type { AssignedOrderSummary } from "@/workspaces/extra/assigned-order-links";

type ExtraStockRow = {
  id: string;
  order_id: string | null;
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
  ready_for_collection?: boolean | null;
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
  order_id,
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
  ready_for_collection,
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
    readyForCollection: row.ready_for_collection === true,
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
    assignedOrderStatus: null,
    assignedOrderSource: null,
    assignedOrderCustomerId: null,
    assignedOrderFulfilmentMethod: null,
    assignedOrderPickupDate: null,
    assignedOrderReadyAt: null,
    assignedOrderPickedUpAt: null,
    assignedOrderOutForDeliveryAt: null,
    assignedOrderDeliveredAt: null,
    assignedOrderCreatedAt: null,
    assignedStockReadinessAllowed: false,
    assignedStockReadyActionAllowed: false,
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

function attachTodayOrderability(
  units: ExtraStockUnit[],
  input: {
    now: Date;
    snapshot: OperatingHoursSnapshot;
    config: FreshPicksPreparationConfig;
  },
): ExtraStockUnit[] {
  return units.map((unit) => {
    if (
      unit.lifecycle !== "confirmed" ||
      unit.soldAt ||
      unit.cutIntoSlicesAt ||
      !unit.pickupAvailableFromAt ||
      !unit.pickupThroughAt
    ) {
      return { ...unit, todayOrderability: null };
    }

    return {
      ...unit,
      todayOrderability: freshPickTodayOrderability({
        window: {
          pickupAvailableFromAt: unit.pickupAvailableFromAt,
          orderCutoffAt: unit.pickupThroughAt,
        },
        readyForCollection: unit.readyForCollection,
        now: input.now,
        snapshot: input.snapshot,
        config: input.config,
      }),
    };
  });
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

async function attachHomeFreshPickPresentation(
  units: ExtraStockUnit[],
  input: {
    now: Date;
    snapshot: OperatingHoursSnapshot;
    config: FreshPicksPreparationConfig;
  },
): Promise<ExtraStockUnit[]> {
  const cakeIds = [
    ...new Set(
      units
        .map((unit) => unit.libraryCakeId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [photosByCake, supabase] = await Promise.all([
    extraPhotosByCake(cakeIds),
    createClient(),
  ]);
  const pricesBySizeAndDate = new Map<string, Promise<number | null>>();
  const priceByUnitId = new Map<string, number | null>();
  await Promise.all(
    units.map(async (unit) => {
      const sizeId = unit.libraryCakeSizeId;
      if (!sizeId || !unit.pickupAvailableFromAt || !unit.pickupThroughAt) {
        priceByUnitId.set(unit.id, null);
        return;
      }
      const pickupDate = extraCustomerVisibleFulfilmentDates({
        window: {
          pickupAvailableFromAt: unit.pickupAvailableFromAt,
          orderCutoffAt: unit.pickupThroughAt,
        },
        now: input.now,
        snapshot: input.snapshot,
        config: input.config,
      })[0];
      if (!pickupDate) {
        priceByUnitId.set(unit.id, null);
        return;
      }

      const priceKey = `${sizeId}|${pickupDate}`;
      let pricePromise = pricesBySizeAndDate.get(priceKey);
      if (!pricePromise) {
        pricePromise = Promise.resolve(
          supabase
            .rpc("library_cake_size_price_on", {
              p_cake_size_id: sizeId,
              p_pickup_date: pickupDate,
            })
            .then(({ data, error }) => {
              if (error || data == null) return null;
              const price = Number(data);
              return Number.isFinite(price) ? price : null;
            }),
        ).catch(() => null);
        pricesBySizeAndDate.set(priceKey, pricePromise);
      }
      priceByUnitId.set(unit.id, await pricePromise);
    }),
  );

  return units.map((unit) => {
    const photos = unit.libraryCakeId
      ? (photosByCake.get(unit.libraryCakeId) ?? [])
      : [];
    const image = resolveCakePhoto(photos, unit.libraryCakeSizeId);
    return {
      ...unit,
      imageUrl: image?.url ?? null,
      imageAlt: image?.altText ?? null,
      unitPrice: priceByUnitId.get(unit.id) ?? null,
    };
  });
}

export async function listExtraStockUnits(): Promise<ExtraStockUnit[]> {
  const supabase = await createClient();
  const { data: unsoldData, error: unsoldError } = await supabase
    .from("extra_stock")
    .select(EXTRA_SELECT)
    .is("sold_at", null)
    .order("proposed_at", { ascending: false });

  if (unsoldError) throw new Error(unsoldError.message);
  const now = new Date();
  const unsoldRows = (unsoldData ?? []) as unknown as ExtraStockRow[];
  const activeOrdersQuery = await supabase
    .from("orders")
    .select(ASSIGNED_ORDER_SELECT)
    .in("status", [
      "submitted",
      "pending_confirmation",
      "confirmed",
      "awaiting_payment",
      "paid",
      "cancelled",
    ])
    .not("extra_stock_id", "is", null)
    .or("order_source.neq.walk_in,order_source.is.null")
    .or(
      "and(fulfilment_method.eq.delivery,delivered_at.is.null),and(fulfilment_method.neq.delivery,picked_up_at.is.null),and(fulfilment_method.is.null,picked_up_at.is.null)",
    );
  if (activeOrdersQuery.error) throw new Error(activeOrdersQuery.error.message);

  const activeOrders = (activeOrdersQuery.data ?? []) as unknown as AssignedOrderSummary[];
  const activeOrderIds = [...new Set(activeOrders.map((order) => order.id))];
  const primaryStockIds = [
    ...new Set(
      activeOrders
        .map((order) => order.extra_stock_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let activeSoldRows: ExtraStockRow[] = [];
  if (activeOrderIds.length || primaryStockIds.length) {
    const relationFilters = [
      ...(activeOrderIds.length ? [`order_id.in.(${activeOrderIds.join(",")})`] : []),
      ...(primaryStockIds.length ? [`id.in.(${primaryStockIds.join(",")})`] : []),
    ];
    const soldQuery = await supabase
      .from("extra_stock")
      .select(EXTRA_SELECT)
      .not("sold_at", "is", null)
      .or(relationFilters.join(","))
      .order("proposed_at", { ascending: false });
    if (soldQuery.error) throw new Error(soldQuery.error.message);
    activeSoldRows = (soldQuery.data ?? []) as unknown as ExtraStockRow[];
  }

  const stockRows = [...unsoldRows, ...activeSoldRows];
  const units = stockRows.map((row) => mapExtraStockRow(row, now));
  const assignedUnits = attachAssignedOrderDetails(
    units,
    stockRows,
    activeOrders,
  );

  const hasOrderabilityCandidates = assignedUnits.some(
    (unit) =>
      unit.lifecycle === "confirmed" &&
      !unit.soldAt &&
      !unit.cutIntoSlicesAt &&
      Boolean(unit.pickupAvailableFromAt && unit.pickupThroughAt),
  );
  if (!hasOrderabilityCandidates) return assignedUnits;

  const [snapshot, config] = await Promise.all([
    loadOperatingHoursSnapshot(),
    loadFreshPicksPreparationConfig(),
  ]);
  return attachTodayOrderability(assignedUnits, { now, snapshot, config });
}

const ASSIGNED_ORDER_SELECT =
  "id, order_number, guest_name, customers(full_name), extra_stock_id, status, order_source, customer_id, fulfilment_method, pickup_date, ready_at, picked_up_at, out_for_delivery_at, delivered_at, created_at";

function orderSnapshot(order: AssignedOrderSummary | null): SoldExtraOrderSnapshot | null {
  if (!order) return null;
  return {
    id: order.id,
    status: order.status ?? "",
    orderSource: order.order_source ?? null,
    customerId: order.customer_id ?? null,
    extraStockId: order.extra_stock_id ?? null,
    fulfilmentMethod: order.fulfilment_method ?? null,
    pickedUpAt: order.picked_up_at ?? null,
    deliveredAt: order.delivered_at ?? null,
    outForDeliveryAt: order.out_for_delivery_at ?? null,
    readyAt: order.ready_at ?? null,
    createdAt: order.created_at ?? null,
  };
}

function attachAssignedOrderDetails(
  units: ExtraStockUnit[],
  stockRows: ExtraStockRow[],
  orders: AssignedOrderSummary[],
): ExtraStockUnit[] {
  if (!stockRows.some((row) => row.sold_at)) return units;
  const byStock = mapAssignedOrderSummariesByStock(
    stockRows
      .filter((row) => row.sold_at)
      .map((row) => ({ id: row.id, order_id: row.order_id })),
    orders,
  );
  return units.map((unit) => {
    const linked = byStock.get(unit.id);
    if (!linked) return unit;
    const snapshot = orderSnapshot(linked);
    return {
      ...unit,
      assignedOrderId: linked.id,
      assignedOrderNumber: linked.order_number || null,
      assignedGuestName:
        linked.guest_name ??
        (Array.isArray(linked.customers)
          ? linked.customers[0]?.full_name
          : linked.customers?.full_name) ??
        null,
      assignedOrderStatus: linked.status ?? null,
      assignedOrderSource: linked.order_source ?? null,
      assignedOrderCustomerId: linked.customer_id ?? null,
      assignedOrderFulfilmentMethod: linked.fulfilment_method ?? null,
      assignedOrderPickupDate: linked.pickup_date ?? null,
      assignedOrderReadyAt: linked.ready_at ?? null,
      assignedOrderPickedUpAt: linked.picked_up_at ?? null,
      assignedOrderOutForDeliveryAt: linked.out_for_delivery_at ?? null,
      assignedOrderDeliveredAt: linked.delivered_at ?? null,
      assignedOrderCreatedAt: linked.created_at ?? null,
      assignedStockReadinessAllowed: linked.readinessLinkVerified,
      assignedStockReadyActionAllowed: canMarkAssignedPhysicalStockReady({
        lifecycle: unit.lifecycle,
        soldAt: unit.soldAt,
        orderId: unit.assignedOrderId ?? linked.id,
        cutIntoSlicesAt: unit.cutIntoSlicesAt,
        walkInHeld: unit.walkInHeld,
        readyForCollection: unit.readyForCollection,
        readinessLinkVerified: linked.readinessLinkVerified,
        order: snapshot,
      }),
    };
  });
}

export type SoldExtraHistoryPage = {
  items: ExtraStockUnit[];
  reviewItems: ExtraStockUnit[];
  nextOffset: number;
  hasMore: boolean;
};

export async function listSoldExtraHistoryPage(input: {
  search: string;
  soldFrom: string;
  soldThrough: string;
  offset: number;
}): Promise<SoldExtraHistoryPage> {
  const supabase = await createClient();
  const pageSize = 20;
  const offset = Math.max(0, Math.min(100_000, Math.trunc(input.offset) || 0));
  const search = input.search.trim().slice(0, 80).replace(/[(),.%*\\"]/g, "");
  let matchingOrderIds: string[] = [];
  let matchingPrimaryStockIds: string[] = [];

  if (search) {
    const customerQuery = await supabase
      .from("customers")
      .select("id")
      .ilike("full_name", `%${search}%`)
      .limit(200);
    if (customerQuery.error) throw new Error(customerQuery.error.message);
    const customerIds = (customerQuery.data ?? []).map((row) => row.id);
    const orderFilters = [
      `order_number.ilike.%${search}%`,
      `guest_name.ilike.%${search}%`,
      ...(customerIds.length ? [`customer_id.in.(${customerIds.join(",")})`] : []),
    ];
    const orderQuery = await supabase
      .from("orders")
      .select("id, extra_stock_id")
      .or(orderFilters.join(","))
      .limit(500);
    if (orderQuery.error) throw new Error(orderQuery.error.message);
    matchingOrderIds = (orderQuery.data ?? []).map((row) => row.id);
    matchingPrimaryStockIds = (orderQuery.data ?? [])
      .map((row) => row.extra_stock_id)
      .filter((id): id is string => Boolean(id));
  }

  let query = supabase
    .from("extra_stock")
    .select(EXTRA_SELECT, { count: "exact" })
    .not("sold_at", "is", null)
    .order("sold_at", { ascending: false })
    .order("id", { ascending: false });
  if (input.soldFrom) {
    query = query.gte("sold_at", `${input.soldFrom}T00:00:00+08:00`);
  }
  if (input.soldThrough) {
    const nextDay = new Date(`${input.soldThrough}T00:00:00.000Z`);
    if (!Number.isNaN(nextDay.getTime())) {
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextYmd = nextDay.toISOString().slice(0, 10);
      query = query.lt("sold_at", `${nextYmd}T00:00:00+08:00`);
    }
  }
  if (search) {
    const filters = [`cake_name.ilike.%${search}%`];
    if (matchingOrderIds.length) {
      filters.push(`order_id.in.(${matchingOrderIds.join(",")})`);
    }
    if (matchingPrimaryStockIds.length) {
      filters.push(`id.in.(${matchingPrimaryStockIds.join(",")})`);
    }
    query = query.or(filters.join(","));
  }
  const result = await query.range(offset, offset + pageSize - 1);
  if (result.error) throw new Error(result.error.message);
  const rows = (result.data ?? []) as unknown as ExtraStockRow[];
  const orderIds = [...new Set(rows.map((row) => row.order_id).filter((id): id is string => Boolean(id)))];
  const stockIds = rows.map((row) => row.id);
  let orders: AssignedOrderSummary[] = [];
  if (orderIds.length || stockIds.length) {
    const filters = [
      ...(orderIds.length ? [`id.in.(${orderIds.join(",")})`] : []),
      ...(stockIds.length ? [`extra_stock_id.in.(${stockIds.join(",")})`] : []),
    ];
    const orderDetails = await supabase
      .from("orders")
      .select(ASSIGNED_ORDER_SELECT)
      .or(filters.join(","));
    if (orderDetails.error) throw new Error(orderDetails.error.message);
    orders = (orderDetails.data ?? []) as unknown as AssignedOrderSummary[];
  }
  const units = attachAssignedOrderDetails(
    rows.map((row) => mapExtraStockRow(row)),
    rows,
    orders,
  );
  const items: ExtraStockUnit[] = [];
  const reviewItems: ExtraStockUnit[] = [];
  for (const unit of units) {
    const linked = orders.find(
      (order) =>
        order.id === unit.assignedOrderId ||
        order.extra_stock_id === unit.id,
    );
    const disposition = classifySoldExtra(orderSnapshot(linked ?? null));
    if (disposition === "history") items.push(unit);
    else if (disposition === "review") reviewItems.push(unit);
  }
  return {
    items,
    reviewItems,
    nextOffset: offset + rows.length,
    hasMore: rows.length === pageSize,
  };
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

export async function getExtraStockUnitById(
  extraStockId: string,
): Promise<ExtraStockUnit | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("extra_stock")
    .select(EXTRA_SELECT)
    .eq("id", extraStockId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapExtraStockRow(data as unknown as ExtraStockRow);
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
    .gt("pickup_through_at", now.toISOString())
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
  const [snapshot, config] = await Promise.all([
    loadOperatingHoursSnapshot(),
    loadFreshPicksPreparationConfig(),
  ]);
  const presented = await attachHomeFreshPickPresentation(units, {
    now,
    snapshot,
    config,
  });
  return attachTodayOrderability(presented, { now, snapshot, config });
}

export type ExtraAssignableOrder = {
  id: string;
  orderNumber: string;
  guestName: string;
  pickupDate: string;
  pickupTime: string;
  extraStockId: string | null;
  itemSummary: string;
  fulfilmentMethod: string;
  status: string;
  matchesStock: boolean;
};

export type AssignableOrderPage = {
  orders: ExtraAssignableOrder[];
  hasMore: boolean;
};

const ASSIGN_ORDER_PAGE_SIZE = 16;

/** Browse unassigned orders without loading the order history into the client. */
export async function listAssignableOrdersForExtra(input: {
  extraStockId: string;
  search: string;
  older: boolean;
  matchingOnly: boolean;
  page: number;
}): Promise<AssignableOrderPage> {
  const supabase = await createClient();
  const { data: stock, error: stockError } = await supabase
    .from("extra_stock")
    .select("id, cake_name, size_label, library_cake_id, library_cake_size_id")
    .eq("id", input.extraStockId)
    .single();
  if (stockError || !stock)
    throw new Error("This Fresh Pick is no longer available.");

  const page = Math.max(0, Math.min(1000, Math.trunc(input.page) || 0));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const filterByCake = Boolean(
    input.matchingOnly && stock.library_cake_id && stock.library_cake_size_id,
  );
  const itemSelection = filterByCake
    ? "order_items!inner ( cake_id, cake_size_id, cake_name, size_label, quantity )"
    : "order_items ( cake_id, cake_size_id, cake_name, size_label, quantity )";
  let query = supabase
    .from("orders")
    .select(
      `id, order_number, guest_name, customer_id, customers ( full_name ), pickup_date, pickup_time, fulfilment_method, extra_stock_id, status, ${itemSelection}`,
    )
    .neq("status", "cancelled")
    .is("extra_stock_id", null);
  if (filterByCake) {
    query = query
      .eq("order_items.cake_id", stock.library_cake_id as string)
      .eq("order_items.cake_size_id", stock.library_cake_size_id as string);
  }

  query = input.older
    ? query.lt("pickup_date", today).order("pickup_date", { ascending: false })
    : query.gte("pickup_date", today).order("pickup_date", { ascending: true });

  // PostgREST's OR expression has its own punctuation grammar. Strip only
  // syntax characters; staff can still search ordinary names and order IDs.
  const search = input.search
    .trim()
    .slice(0, 80)
    .replace(/[(),.%*\\]/g, "");
  if (search) {
    const { data: customers, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .ilike("full_name", `%${search}%`)
      .limit(200);
    if (customerError) throw new Error(customerError.message);
    const ids = (customers ?? []).map((customer) => customer.id);
    const filters = [
      `order_number.ilike.%${search}%`,
      `guest_name.ilike.%${search}%`,
    ];
    if (ids.length) filters.push(`customer_id.in.(${ids.join(",")})`);
    query = query.or(filters.join(","));
  }

  const start = page * ASSIGN_ORDER_PAGE_SIZE;
  const { data, error } = await query
    .order("pickup_time", { ascending: true })
    .order("id", { ascending: true })
    .range(start, start + ASSIGN_ORDER_PAGE_SIZE);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    order_number: string;
    guest_name: string | null;
    customer_id: string | null;
    customers: { full_name: string | null } | null;
    pickup_date: string;
    pickup_time: string;
    fulfilment_method: string;
    extra_stock_id: string | null;
    status: string;
    order_items: Array<{
      cake_id: string | null;
      cake_size_id: string | null;
      cake_name: string;
      size_label: string;
      quantity: number;
    }> | null;
  }>;
  const orders = rows.slice(0, ASSIGN_ORDER_PAGE_SIZE).map((row) => {
    const items = row.order_items ?? [];
    const matchesStock = items.some((item) =>
      stock.library_cake_id && stock.library_cake_size_id
        ? item.cake_id === stock.library_cake_id &&
          item.cake_size_id === stock.library_cake_size_id
        : item.cake_name.trim().toLowerCase() ===
            stock.cake_name.trim().toLowerCase() &&
          item.size_label.trim().toLowerCase() ===
            stock.size_label.trim().toLowerCase(),
    );
    return {
      id: row.id,
      orderNumber: row.order_number,
      guestName: row.guest_name || row.customers?.full_name || "Guest",
      pickupDate: row.pickup_date,
      pickupTime: row.pickup_time,
      extraStockId: row.extra_stock_id,
      itemSummary:
        items
          .map(
            (item) => `${item.cake_name} ${item.size_label} ×${item.quantity}`,
          )
          .join(", ") || "No cake lines",
      fulfilmentMethod: row.fulfilment_method,
      status: row.status,
      matchesStock: Boolean(matchesStock),
    };
  });
  // Preserve date order inside each group while making exact stock matches
  // visible first on each bounded page.
  orders.sort((a, b) => Number(b.matchesStock) - Number(a.matchesStock));
  return { orders, hasMore: rows.length > ASSIGN_ORDER_PAGE_SIZE };
}

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
    fulfilmentMethod: "",
    status: String((row as { status?: string }).status ?? ""),
    matchesStock: false,
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
