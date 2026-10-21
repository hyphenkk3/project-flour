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
import {
  summarizeBakeryFreshPickAllocations,
  type BakeryAssignedStockInput,
  type BakeryCakeRequirementInput,
  type BakeryAllocationSummary,
} from "@/engines/bakery/fresh-pick-allocation";

type ExtraStockAllocationRow = {
  id: string;
  order_id: string | null;
  lifecycle: string;
  sold_at: string | null;
  cut_into_slices_at: string | null;
  cake_name: string;
  size_label: string;
  library_cake_id: string | null;
  library_cake_size_id: string | null;
  walk_in_held_until: string | null;
  legacyLinkConflict?: boolean;
};

function mapAllocationStock(row: ExtraStockAllocationRow): BakeryAssignedStockInput {
  return {
    id: row.id,
    orderId: row.order_id,
    lifecycle: row.lifecycle,
    soldAt: row.sold_at,
    cutIntoSlicesAt: row.cut_into_slices_at,
    cakeId: row.library_cake_id,
    cakeName: row.cake_name,
    sizeId: row.library_cake_size_id,
    sizeLabel: row.size_label,
    walkInHeldUntil: row.walk_in_held_until,
    legacyLinkConflict: row.legacyLinkConflict ?? false,
  };
}

async function loadAllocationRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orders: Array<Pick<BakeryOrderRow, "id" | "extra_stock_id">>,
): Promise<Map<string, BakeryAssignedStockInput[]>> {
  const orderIds = [...new Set(orders.map((row) => row.id))];
  const primaryIds = [...new Set(
    orders.map((row) => row.extra_stock_id).filter((id): id is string => Boolean(id)),
  )];
  if (orderIds.length === 0) return new Map();

  const columns =
    "id,order_id,lifecycle,sold_at,cut_into_slices_at,cake_name,size_label,library_cake_id,library_cake_size_id,walk_in_held_until";
  const [linkedResult, primaryResult] = await Promise.all([
    supabase.from("extra_stock").select(columns).in("order_id", orderIds),
    primaryIds.length
      ? supabase.from("extra_stock").select(columns).in("id", primaryIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (linkedResult.error) throw new Error(linkedResult.error.message);
  if (primaryResult.error) throw new Error(primaryResult.error.message);

  const rowById = new Map<string, BakeryAssignedStockInput>();
  for (const row of [
    ...((linkedResult.data ?? []) as ExtraStockAllocationRow[]),
    ...((primaryResult.data ?? []) as ExtraStockAllocationRow[]),
  ]) {
    rowById.set(row.id, mapAllocationStock(row));
  }

  const stockIds = [...rowById.keys()];
  let pointerRows: Array<{ id: string; extra_stock_id: string | null }> = [];
  if (stockIds.length > 0) {
    const { data, error: pointerError } = await supabase
      .from("orders")
      .select("id,extra_stock_id")
      .in("extra_stock_id", stockIds);
    if (pointerError) throw new Error(pointerError.message);
    pointerRows = data ?? [];
  }

  const byOrder = new Map<string, BakeryAssignedStockInput[]>();
  for (const order of orders) {
    const assigned = [...rowById.values()].filter(
      (stock) => stock.orderId === order.id || stock.id === order.extra_stock_id,
    ).map((stock) => ({
      ...stock,
      legacyLinkConflict: pointerRows.some(
        (pointer) => pointer.extra_stock_id === stock.id && pointer.id !== order.id,
      ),
    }));
    byOrder.set(order.id, assigned);
  }
  return byOrder;
}

export async function getBakeryFreshPickAllocationSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  order: {
    id: string;
    extra_stock_id: string | null;
    order_items?: BakeryCakeRequirementInput[] | null;
  },
): Promise<BakeryAllocationSummary> {
  const allocationRows = await loadAllocationRows(supabase, [order]);
  return summarizeBakeryFreshPickAllocations({
    orderId: order.id,
    primaryStockId: order.extra_stock_id,
    cakeRequirements: order.order_items ?? [],
    stockRows: allocationRows.get(order.id) ?? [],
  });
}

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

  const activeRows = ((data ?? []) as BakeryOrderRow[]).filter((row) =>
    rowPassesBoard(row, selectedPickupDate),
  );
  const allocationRows = await loadAllocationRows(supabase, activeRows);
  const mapped = activeRows.map((row) =>
    mapBakeryBoardOrder(row, allocationRows.get(row.id) ?? []),
  );

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
  const allocationRows = await loadAllocationRows(supabase, [row]);
  return mapBakeryBoardOrder(row, allocationRows.get(row.id) ?? []);
}

export async function getBakeryOrderDetail(
  orderId: string,
  selectedPickupDate: string,
): Promise<BakeryBoardOrder | null> {
  return getBakeryBoardOrderById(orderId, selectedPickupDate);
}
