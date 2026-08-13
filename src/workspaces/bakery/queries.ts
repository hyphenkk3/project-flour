/**
 * M5-P1 — slim Bakery board/detail queries (guest production read model).
 */

import { createClient } from "@/lib/supabase/server";
import {
  BAKERY_ACTIVE_PREORDER_STATUSES,
  isActiveOnBakeryBoard,
  sortBakeryBoardOrders,
} from "@/workspaces/bakery/eligibility";
import {
  mapBakeryBoardOrder,
  type BakeryOrderRow,
} from "@/workspaces/bakery/map-order";
import { BAKERY_ORDER_SELECT } from "@/workspaces/bakery/select";
import type { BakeryBoardOrder } from "@/workspaces/bakery/types";

function rowPassesBoard(
  row: BakeryOrderRow,
  selectedPickupDate: string,
): boolean {
  return isActiveOnBakeryBoard({
    customerId: row.customer_id,
    pickupDate: row.pickup_date,
    selectedPickupDate,
    status: row.status,
    productionStartedAt: row.production_started_at,
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
    outForDeliveryAt: row.out_for_delivery_at,
    fulfilmentMethod: row.fulfilment_method,
  });
}

/**
 * Live Bakery board for one fulfilment date.
 * All active guest preorders for the date (secured and unsecured).
 */
export async function listBakeryBoardOrders(
  selectedPickupDate: string,
): Promise<BakeryBoardOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(BAKERY_ORDER_SELECT)
    .is("customer_id", null)
    .eq("pickup_date", selectedPickupDate)
    .or(
      [
        `status.in.(${BAKERY_ACTIVE_PREORDER_STATUSES.join(",")})`,
        "production_started_at.not.is.null",
        "ready_at.not.is.null",
      ].join(","),
    )
    .order("pickup_time", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const mapped = ((data ?? []) as BakeryOrderRow[])
    .filter((row) => rowPassesBoard(row, selectedPickupDate))
    .map(mapBakeryBoardOrder);

  return sortBakeryBoardOrders(mapped);
}

export async function getBakeryBoardOrderById(
  orderId: string,
  selectedPickupDate: string,
): Promise<BakeryBoardOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(BAKERY_ORDER_SELECT)
    .eq("id", orderId)
    .is("customer_id", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const row = data as BakeryOrderRow;
  if (!rowPassesBoard(row, selectedPickupDate)) {
    return null;
  }
  return mapBakeryBoardOrder(row);
}

export async function getBakeryOrderDetail(
  orderId: string,
  selectedPickupDate: string,
): Promise<BakeryBoardOrder | null> {
  return getBakeryBoardOrderById(orderId, selectedPickupDate);
}
