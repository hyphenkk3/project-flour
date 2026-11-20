import assert from "node:assert/strict";
import {
  fulfilmentDayPresentation,
  isFreshPickActionDueToday,
  isFreshPickBakeryActionRequired,
  isFreshPickOrder,
  orderFulfilmentDate,
} from "@/engines/orders/staff-presentation";
import {
  DEFAULT_OPERATIONS_QUERY,
  buildOperationsBoardPath,
  filterAndSortOperationsOrders,
  matchesOperationsPickupFilter,
  parseOperationsBoardSearchParams,
  type OperationsBoardOrder,
} from "@/engines/operations/order-board";
import { mapCollectionBoardOrder } from "@/workspaces/collection/map-order";
import { COLLECTION_ORDER_SELECT } from "@/workspaces/collection/select";
import { mapBakeryBoardOrder } from "@/workspaces/bakery/map-order";
import { BAKERY_ORDER_SELECT } from "@/workspaces/bakery/select";

const nowBeforeMalaysiaMidnight = new Date("2026-11-08T15:59:59.000Z");
const nowAtMalaysiaMidnight = new Date("2026-11-08T16:00:00.000Z");

assert.equal(isFreshPickOrder("stock-1"), true);
assert.equal(isFreshPickOrder("   "), false);
assert.equal(isFreshPickOrder(null), false);

assert.deepEqual(
  fulfilmentDayPresentation("2026-11-08", nowBeforeMalaysiaMidnight),
  { label: "TODAY", kind: "today" },
);
assert.deepEqual(
  fulfilmentDayPresentation("2026-11-09", nowBeforeMalaysiaMidnight),
  { label: "TOMORROW", kind: "tomorrow" },
);
assert.deepEqual(
  fulfilmentDayPresentation("2026-11-09", nowAtMalaysiaMidnight),
  { label: "TODAY", kind: "today" },
);
assert.deepEqual(
  fulfilmentDayPresentation("2026-11-10", nowAtMalaysiaMidnight),
  { label: "TOMORROW", kind: "tomorrow" },
);

assert.equal(
  orderFulfilmentDate({
    fulfilmentMethod: "pickup",
    pickupDate: "2026-11-08",
  }),
  "2026-11-08",
);
assert.equal(
  orderFulfilmentDate({
    fulfilmentMethod: "delivery",
    pickupDate: "2026-11-09",
  }),
  "2026-11-09",
);
for (const fulfilmentMethod of ["pickup", "delivery"] as const) {
  assert.equal(
    fulfilmentDayPresentation(
      orderFulfilmentDate({
        fulfilmentMethod,
        pickupDate: "2026-11-08",
      }),
      nowBeforeMalaysiaMidnight,
    ).kind,
    "today",
  );
  assert.equal(
    fulfilmentDayPresentation(
      orderFulfilmentDate({
        fulfilmentMethod,
        pickupDate: "2026-11-09",
      }),
      nowBeforeMalaysiaMidnight,
    ).kind,
    "tomorrow",
  );
}
for (const reservationDate of ["2026-11-08", "2026-11-09"] as const) {
  assert.equal(
    fulfilmentDayPresentation(
      orderFulfilmentDate({
        fulfilmentMethod: "dine_in",
        pickupDate: "2026-11-10",
        dineInReservationDate: reservationDate,
      }),
      nowBeforeMalaysiaMidnight,
    ).kind,
    reservationDate === "2026-11-08" ? "today" : "tomorrow",
  );
}
assert.equal(
  orderFulfilmentDate({
    fulfilmentMethod: "dine_in",
    pickupDate: "2026-11-09",
    dineInReservationDate: "2026-11-08",
  }),
  "2026-11-08",
);
assert.equal(
  orderFulfilmentDate({
    fulfilmentMethod: "dine_in",
    pickupDate: "2026-11-09",
  }),
  "2026-11-09",
);

const dueToday = {
  extraStockId: "stock-1",
  fulfilmentDate: "2026-11-08",
  actionRequired: true,
  terminal: false,
  now: nowBeforeMalaysiaMidnight,
};
assert.equal(isFreshPickActionDueToday(dueToday), true);
assert.equal(
  isFreshPickActionDueToday({ ...dueToday, fulfilmentDate: "2026-11-09" }),
  false,
);
assert.equal(
  isFreshPickActionDueToday({ ...dueToday, extraStockId: null }),
  false,
);
assert.equal(
  isFreshPickActionDueToday({ ...dueToday, terminal: true }),
  false,
);
assert.equal(
  isFreshPickActionDueToday({ ...dueToday, actionRequired: false }),
  false,
);

const readyAllocatedFreshPick = {
  extraStockId: "stock-1",
  status: "paid",
  needsBakeryAttention: false,
  readyAt: null,
  pickedUpAt: null,
  outForDeliveryAt: null,
  deliveredAt: null,
  allocationStatus: "verified",
  fullyCovered: true,
  totalRemainingQuantity: 0,
  totalAssignedQuantity: 1,
  assignedStockCount: 1,
  allAssignedStocksReady: true,
};
assert.equal(
  isFreshPickBakeryActionRequired({
    ...readyAllocatedFreshPick,
    extraStockId: null,
    allAssignedStocksReady: false,
  }),
  false,
);
assert.equal(isFreshPickBakeryActionRequired(readyAllocatedFreshPick), false);
const pendingBakeryAction = isFreshPickBakeryActionRequired({
  ...readyAllocatedFreshPick,
  needsBakeryAttention: true,
});
assert.equal(pendingBakeryAction, true);
assert.equal(
  isFreshPickActionDueToday({
    ...dueToday,
    actionRequired: pendingBakeryAction,
  }),
  true,
);
assert.equal(
  isFreshPickActionDueToday({
    ...dueToday,
    actionRequired: isFreshPickBakeryActionRequired(readyAllocatedFreshPick),
  }),
  false,
  "completing the outstanding action clears the today cue",
);
assert.equal(
  isFreshPickBakeryActionRequired({
    ...readyAllocatedFreshPick,
    allAssignedStocksReady: false,
  }),
  true,
);
assert.equal(
  isFreshPickBakeryActionRequired({
    ...readyAllocatedFreshPick,
    totalRemainingQuantity: 1,
    allAssignedStocksReady: false,
  }),
  true,
);
assert.equal(
  isFreshPickBakeryActionRequired({
    ...readyAllocatedFreshPick,
    status: "awaiting_payment",
    allAssignedStocksReady: false,
  }),
  false,
);
assert.equal(
  isFreshPickBakeryActionRequired({
    ...readyAllocatedFreshPick,
    readyAt: "2026-11-08T08:00:00Z",
    allAssignedStocksReady: false,
  }),
  false,
);
assert.equal(
  isFreshPickBakeryActionRequired({
    ...readyAllocatedFreshPick,
    status: "cancelled",
    allAssignedStocksReady: false,
  }),
  false,
);

const orders: OperationsBoardOrder[] = [
  {
    id: "fresh-today",
    orderNumber: "FP-1",
    customerName: "Fresh",
    phone: "",
    pickupDate: "2026-11-08",
    pickupTime: "10:00",
    fulfilmentMethod: "pickup",
    extraStockId: "stock-1",
    status: "paid",
    createdAt: "2026-11-07T10:00:00Z",
  },
  {
    id: "normal-today",
    orderNumber: "NP-1",
    customerName: "Normal",
    phone: "",
    pickupDate: "2026-11-08",
    pickupTime: "11:00",
    fulfilmentMethod: "pickup",
    extraStockId: null,
    status: "paid",
    createdAt: "2026-11-07T11:00:00Z",
  },
  {
    id: "dine-in-reservation-today",
    orderNumber: "FP-2",
    customerName: "Dine In",
    phone: "",
    pickupDate: "2026-11-09",
    pickupTime: "12:00",
    fulfilmentMethod: "dine_in",
    dineInReservationDate: "2026-11-08",
    extraStockId: "stock-2",
    status: "paid",
    createdAt: "2026-11-07T12:00:00Z",
  },
];

assert.equal(
  matchesOperationsPickupFilter(
    orders[2],
    "today",
    null,
    nowBeforeMalaysiaMidnight,
  ),
  true,
  "Dine-in filters use reservation date, not the cake pickup date",
);
const allTypes = filterAndSortOperationsOrders(
  orders,
  { ...DEFAULT_OPERATIONS_QUERY, pickupFilter: "all" },
  nowBeforeMalaysiaMidnight,
);
assert.deepEqual(allTypes.map((order) => order.id).sort(), [
  "dine-in-reservation-today",
  "fresh-today",
  "normal-today",
]);
const fulfilmentSorted = filterAndSortOperationsOrders(
  orders,
  {
    ...DEFAULT_OPERATIONS_QUERY,
    pickupFilter: "all",
    sort: "pickup_asc",
  },
  nowBeforeMalaysiaMidnight,
);
assert.deepEqual(fulfilmentSorted.map((order) => order.id), [
  "fresh-today",
  "normal-today",
  "dine-in-reservation-today",
]);
const freshOnly = filterAndSortOperationsOrders(
  orders,
  {
    ...DEFAULT_OPERATIONS_QUERY,
    pickupFilter: "all",
    orderTypeFilter: "fresh_pick",
  },
  nowBeforeMalaysiaMidnight,
);
assert.deepEqual(freshOnly.map((order) => order.id).sort(), [
  "dine-in-reservation-today",
  "fresh-today",
]);
const normalOnly = filterAndSortOperationsOrders(
  orders,
  {
    ...DEFAULT_OPERATIONS_QUERY,
    pickupFilter: "all",
    orderTypeFilter: "normal_preorder",
  },
  nowBeforeMalaysiaMidnight,
);
assert.deepEqual(normalOnly.map((order) => order.id), ["normal-today"]);

const queryWithFreshPickFilter = {
  ...DEFAULT_OPERATIONS_QUERY,
  orderTypeFilter: "fresh_pick" as const,
};
assert.equal(
  buildOperationsBoardPath(queryWithFreshPickFilter),
  "/owner?type=fresh_pick",
);
assert.deepEqual(
  parseOperationsBoardSearchParams({ type: "fresh_pick" }),
  queryWithFreshPickFilter,
);
assert.equal(
  parseOperationsBoardSearchParams({ type: "unexpected" }).orderTypeFilter,
  "all",
);

assert.match(COLLECTION_ORDER_SELECT, /\bextra_stock_id\b/);
assert.match(BAKERY_ORDER_SELECT, /order_dine_in_reservations\s*\(\s*reservation_date\s*\)/);
const collectionMapped = mapCollectionBoardOrder({
  id: "collection-fresh",
  order_number: "FP-C1",
  guest_name: "Fresh Collection",
  guest_phone: null,
  customer_id: null,
  pickup_date: "2026-11-09",
  pickup_time: "12:00",
  fulfilment_method: "dine_in",
  extra_stock_id: "stock-1",
  status: "paid",
  customer_notes: null,
  internal_notes: null,
  production_started_at: null,
  ready_at: null,
  picked_up_at: null,
  out_for_delivery_at: null,
  delivered_at: null,
  include_receipt: false,
  order_dine_in_reservations: {
    reservation_date: "2026-11-08",
    reservation_time: "12:00",
    venue: "whitebird",
    guest_count: 2,
    adult_count: 2,
    kid_count: 0,
    toddler_count: 0,
    reservation_note: null,
    status: "confirmed",
  },
});
assert.equal(collectionMapped.extraStockId, "stock-1");
assert.equal(collectionMapped.dineIn?.reservationDate, "2026-11-08");
const bakeryMapped = mapBakeryBoardOrder({
  id: "bakery-fresh",
  order_number: "FP-B1",
  guest_name: "Fresh Bakery",
  customer_id: null,
  pickup_date: "2026-11-09",
  pickup_time: "12:00",
  fulfilment_method: "dine_in",
  status: "paid",
  customer_notes: null,
  needs_bakery_attention: false,
  bakery_attention_note: null,
  production_started_at: null,
  production_started_by: null,
  ready_at: null,
  picked_up_at: null,
  out_for_delivery_at: null,
  delivered_at: null,
  include_receipt: false,
  extra_stock_id: "stock-2",
  order_dine_in_reservations: { reservation_date: "2026-11-08" },
});
assert.equal(bakeryMapped.extraStockId, "stock-2");
assert.equal(bakeryMapped.dineInReservationDate, "2026-11-08");

console.log("Fresh Pick staff presentation, urgency, date boundaries, and filtering: PASS");
