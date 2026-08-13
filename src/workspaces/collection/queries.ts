/**
 * Live Collection board/detail queries (guest Pickup Ready handoff).
 */

import { createClient } from "@/lib/supabase/server";
import {
  COLLECTION_ACTIVE_PREORDER_STATUSES,
  isActiveOnCollectionBoard,
  isVisibleOnCollectionDetail,
  sortCollectionBoardOrders,
} from "@/workspaces/collection/eligibility";
import {
  mapCollectionBoardOrder,
  type CollectionOrderRow,
} from "@/workspaces/collection/map-order";
import { COLLECTION_ORDER_SELECT } from "@/workspaces/collection/select";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";

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

export async function getCollectionBoardOrderById(
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
  if (!rowPassesBoard(row, selectedPickupDate)) {
    return null;
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
