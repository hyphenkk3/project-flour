/**
 * Live Collection board/detail queries.
 * Ready: combined ready queue. Pickup / Delivery: focused ready queues.
 * Completed / History: Picked Up + Delivered (+ dine-in completed).
 */

import { createClient } from "@/lib/supabase/server";
import {
  COLLECTION_ACTIVE_PREORDER_STATUSES,
  COLLECTION_HISTORY_LOOKBACK_DAYS,
  isActiveOnCollectionBoard,
  isActiveOnCollectionDeliveryBoard,
  isActiveOnCollectionDineInBoard,
  isActiveOnCollectionReadyQueue,
  isCompletedInCollectionHistory,
  isCompletedOnCollectionBoard,
  isVisibleOnCollectionDetail,
  sortCollectionBoardOrders,
  sortCollectionCompletedOrdersDesc,
  sortCollectionDineInBoardOrders,
  type CollectionBoardTab,
} from "@/workspaces/collection/eligibility";
import {
  mapCollectionBoardOrder,
  type CollectionOrderRow,
} from "@/workspaces/collection/map-order";
import { COLLECTION_ORDER_SELECT } from "@/workspaces/collection/select";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";
import { addCalendarDaysYmd } from "@/workspaces/collection/date";

function rowPassesPickupBoard(
  row: CollectionOrderRow,
  selectedPickupDate: string,
): boolean {
  return isActiveOnCollectionBoard({
    customerId: row.customer_id,
    pickupDate: row.pickup_date,
    selectedPickupDate,
    status: row.status,
    fulfilmentMethod: row.fulfilment_method,
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
  });
}

function rowPassesDeliveryBoard(
  row: CollectionOrderRow,
  selectedPickupDate: string,
): boolean {
  return isActiveOnCollectionDeliveryBoard({
    customerId: row.customer_id,
    pickupDate: row.pickup_date,
    selectedPickupDate,
    status: row.status,
    fulfilmentMethod: row.fulfilment_method,
    readyAt: row.ready_at,
    deliveredAt: row.delivered_at,
  });
}

function rowPassesReadyQueue(
  row: CollectionOrderRow,
  selectedPickupDate: string,
): boolean {
  const reservation = Array.isArray(row.order_dine_in_reservations)
    ? row.order_dine_in_reservations[0] ?? null
    : row.order_dine_in_reservations ?? null;

  return isActiveOnCollectionReadyQueue({
    customerId: row.customer_id,
    pickupDate: row.pickup_date,
    reservationDate: reservation?.reservation_date ?? null,
    selectedPickupDate,
    status: row.status,
    fulfilmentMethod: row.fulfilment_method,
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
  });
}

function rowPassesCompleted(
  row: CollectionOrderRow,
  selectedPickupDate: string,
): boolean {
  return isCompletedOnCollectionBoard({
    customerId: row.customer_id,
    pickupDate: row.pickup_date,
    selectedPickupDate,
    status: row.status,
    fulfilmentMethod: row.fulfilment_method,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
  });
}

function rowPassesHistory(
  row: CollectionOrderRow,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  return isCompletedInCollectionHistory({
    customerId: row.customer_id,
    pickupDate: row.pickup_date,
    rangeStart,
    rangeEnd,
    status: row.status,
    fulfilmentMethod: row.fulfilment_method,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
  });
}

function rowPassesDineIn(
  row: CollectionOrderRow,
  selectedPickupDate: string,
): boolean {
  const reservation = Array.isArray(row.order_dine_in_reservations)
    ? row.order_dine_in_reservations[0] ?? null
    : row.order_dine_in_reservations ?? null;

  return isActiveOnCollectionDineInBoard({
    customerId: row.customer_id,
    pickupDate: row.pickup_date,
    reservationDate: reservation?.reservation_date ?? null,
    selectedPickupDate,
    status: row.status,
    fulfilmentMethod: row.fulfilment_method,
    pickedUpAt: row.picked_up_at,
  });
}

function rowPassesDetail(
  row: CollectionOrderRow,
  selectedPickupDate: string,
): boolean {
  return isVisibleOnCollectionDetail({
    customerId: row.customer_id,
    pickupDate: row.pickup_date,
    selectedPickupDate,
    status: row.status,
    fulfilmentMethod: row.fulfilment_method,
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
  });
}

/** Pickup Ready queue (pickup-only). Also used by Home View Pickup. */
export async function listCollectionBoardOrders(
  selectedPickupDate: string,
): Promise<CollectionBoardOrder[]> {
  return listCollectionPickupReadyOrders(selectedPickupDate);
}

export async function listCollectionPickupReadyOrders(
  selectedPickupDate: string,
): Promise<CollectionBoardOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(COLLECTION_ORDER_SELECT)
    .is("customer_id", null)
    .eq("pickup_date", selectedPickupDate)
    .in("status", [...COLLECTION_ACTIVE_PREORDER_STATUSES])
    .not("ready_at", "is", null)
    .is("picked_up_at", null)
    .order("pickup_time", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const mapped = ((data ?? []) as CollectionOrderRow[])
    .filter((row) => rowPassesPickupBoard(row, selectedPickupDate))
    .map(mapCollectionBoardOrder);

  return sortCollectionBoardOrders(mapped);
}

export async function listCollectionDeliveryReadyOrders(
  selectedPickupDate: string,
): Promise<CollectionBoardOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(COLLECTION_ORDER_SELECT)
    .is("customer_id", null)
    .eq("pickup_date", selectedPickupDate)
    .eq("fulfilment_method", "delivery")
    .in("status", [...COLLECTION_ACTIVE_PREORDER_STATUSES])
    .not("ready_at", "is", null)
    .is("delivered_at", null)
    .order("pickup_time", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const mapped = ((data ?? []) as CollectionOrderRow[])
    .filter((row) => rowPassesDeliveryBoard(row, selectedPickupDate))
    .map(mapCollectionBoardOrder);

  return sortCollectionBoardOrders(mapped);
}

/** Combined Ready tab: pickup + delivery + dine-in ready. */
export async function listCollectionReadyQueueOrders(
  selectedPickupDate: string,
): Promise<CollectionBoardOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(COLLECTION_ORDER_SELECT)
    .is("customer_id", null)
    .eq("pickup_date", selectedPickupDate)
    .in("status", [...COLLECTION_ACTIVE_PREORDER_STATUSES])
    .not("ready_at", "is", null)
    .order("pickup_time", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const mapped = ((data ?? []) as CollectionOrderRow[])
    .filter((row) => rowPassesReadyQueue(row, selectedPickupDate))
    .map(mapCollectionBoardOrder);

  return sortCollectionBoardOrders(mapped);
}

/** Selected-date completed handoffs (Picked Up + Delivered + dine-in). */
export async function listCollectionCompletedOrders(
  selectedPickupDate: string,
): Promise<CollectionBoardOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(COLLECTION_ORDER_SELECT)
    .is("customer_id", null)
    .eq("pickup_date", selectedPickupDate)
    .in("status", [...COLLECTION_ACTIVE_PREORDER_STATUSES])
    .or("picked_up_at.not.is.null,delivered_at.not.is.null");

  if (error) {
    throw new Error(error.message);
  }

  const mapped = ((data ?? []) as CollectionOrderRow[])
    .filter((row) => rowPassesCompleted(row, selectedPickupDate))
    .map(mapCollectionBoardOrder);

  return sortCollectionCompletedOrdersDesc(mapped);
}

/**
 * Longer lookback of completed handoffs ending at selectedDate
 * (inclusive), newest completion first.
 */
export async function listCollectionHistoryOrders(
  selectedPickupDate: string,
  lookbackDays: number = COLLECTION_HISTORY_LOOKBACK_DAYS,
): Promise<CollectionBoardOrder[]> {
  const rangeEnd = selectedPickupDate;
  const rangeStart = addCalendarDaysYmd(selectedPickupDate, -lookbackDays);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(COLLECTION_ORDER_SELECT)
    .is("customer_id", null)
    .gte("pickup_date", rangeStart)
    .lte("pickup_date", rangeEnd)
    .in("status", [...COLLECTION_ACTIVE_PREORDER_STATUSES])
    .or("picked_up_at.not.is.null,delivered_at.not.is.null");

  if (error) {
    throw new Error(error.message);
  }

  const mapped = ((data ?? []) as CollectionOrderRow[])
    .filter((row) => rowPassesHistory(row, rangeStart, rangeEnd))
    .map(mapCollectionBoardOrder);

  return sortCollectionCompletedOrdersDesc(mapped);
}

/** Today's dine-in guest preorders not yet completed. Ready is optional. */
export async function listCollectionDineInOrders(
  selectedPickupDate: string,
): Promise<CollectionBoardOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(COLLECTION_ORDER_SELECT)
    .is("customer_id", null)
    .eq("fulfilment_method", "dine_in")
    .eq("order_dine_in_reservations.reservation_date", selectedPickupDate)
    .in("status", [...COLLECTION_ACTIVE_PREORDER_STATUSES])
    .is("picked_up_at", null)
    .order("pickup_time", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const mapped = ((data ?? []) as CollectionOrderRow[])
    .filter((row) => rowPassesDineIn(row, selectedPickupDate))
    .map(mapCollectionBoardOrder);

  return sortCollectionDineInBoardOrders(mapped);
}

export async function listCollectionOrdersForTab(
  tab: CollectionBoardTab,
  selectedPickupDate: string,
): Promise<CollectionBoardOrder[]> {
  if (tab === "completed") {
    return listCollectionCompletedOrders(selectedPickupDate);
  }
  if (tab === "history") {
    return listCollectionHistoryOrders(selectedPickupDate);
  }
  if (tab === "dine_in") {
    return listCollectionDineInOrders(selectedPickupDate);
  }
  if (tab === "pickup") {
    return listCollectionPickupReadyOrders(selectedPickupDate);
  }
  if (tab === "delivery") {
    return listCollectionDeliveryReadyOrders(selectedPickupDate);
  }
  return listCollectionReadyQueueOrders(selectedPickupDate);
}

export async function getCollectionBoardOrderById(
  orderId: string,
  selectedPickupDate: string,
  tab: CollectionBoardTab = "ready",
): Promise<CollectionBoardOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(COLLECTION_ORDER_SELECT)
    .eq("id", orderId)
    .is("customer_id", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const row = data as CollectionOrderRow;
  if (tab === "ready") {
    if (!rowPassesReadyQueue(row, selectedPickupDate)) return null;
  } else if (tab === "pickup") {
    if (!rowPassesPickupBoard(row, selectedPickupDate)) return null;
  } else if (tab === "delivery") {
    if (!rowPassesDeliveryBoard(row, selectedPickupDate)) return null;
  } else if (tab === "dine_in") {
    if (!rowPassesDineIn(row, selectedPickupDate)) return null;
  } else if (tab === "completed") {
    if (!rowPassesCompleted(row, selectedPickupDate)) return null;
  } else {
    const rangeStart = addCalendarDaysYmd(
      selectedPickupDate,
      -COLLECTION_HISTORY_LOOKBACK_DAYS,
    );
    if (!rowPassesHistory(row, rangeStart, selectedPickupDate)) return null;
  }
  return mapCollectionBoardOrder(row);
}

export async function getCollectionOrderDetail(
  orderId: string,
  selectedPickupDate: string,
): Promise<CollectionBoardOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(COLLECTION_ORDER_SELECT)
    .eq("id", orderId)
    .is("customer_id", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const row = data as CollectionOrderRow;
  if (!rowPassesDetail(row, selectedPickupDate)) {
    return null;
  }
  return mapCollectionBoardOrder(row);
}
