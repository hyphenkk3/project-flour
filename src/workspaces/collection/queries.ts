/**
 * Live Collection board/detail queries.
 * Ready: pickup Ready queue. Completed / History: Picked Up + Delivered.
 */

import { createClient } from "@/lib/supabase/server";
import {
  COLLECTION_ACTIVE_PREORDER_STATUSES,
  COLLECTION_HISTORY_LOOKBACK_DAYS,
  isActiveOnCollectionBoard,
  isCompletedInCollectionHistory,
  isCompletedOnCollectionBoard,
  isVisibleOnCollectionDetail,
  sortCollectionBoardOrders,
  sortCollectionCompletedOrdersDesc,
  type CollectionBoardTab,
} from "@/workspaces/collection/eligibility";
import {
  mapCollectionBoardOrder,
  type CollectionOrderRow,
} from "@/workspaces/collection/map-order";
import { COLLECTION_ORDER_SELECT } from "@/workspaces/collection/select";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";
import { addCalendarDaysYmd } from "@/workspaces/collection/date";

function rowPassesBoard(
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

export async function listCollectionBoardOrders(
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
    .filter((row) => rowPassesBoard(row, selectedPickupDate))
    .map(mapCollectionBoardOrder);

  return sortCollectionBoardOrders(mapped);
}

/** Selected-date completed handoffs (Picked Up + Delivered). */
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
  return listCollectionBoardOrders(selectedPickupDate);
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
    if (!rowPassesBoard(row, selectedPickupDate)) return null;
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
