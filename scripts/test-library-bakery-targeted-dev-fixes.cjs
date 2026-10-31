const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadTsModule(path) {
  const source = fs.readFileSync(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleExports = {};
  vm.runInNewContext(output, { exports: moduleExports, Map, Set });
  return moduleExports;
}

const historyUi = fs.readFileSync(
  "src/workspaces/library/order-availability/OrderAvailabilityHistory.tsx",
  "utf8",
);
assert.match(
  historyUi,
  /<details[\s\S]*?aria-labelledby="order-availability-history-heading"/,
);
assert.doesNotMatch(
  historyUi.match(/<details([^>]*)>/)?.[1] ?? "",
  /\bopen(?:\s|=|>)/,
);
assert.match(historyUi, /aria-level=\{2\}[\s\S]*?role="heading"/);
assert.match(historyUi, /group-open:hidden[\s\S]*?Expand/);
assert.match(historyUi, /group-open:inline[\s\S]*?Collapse/);
assert.match(historyUi, /events\.map\(\(event\)/);
assert.match(historyUi, /formatDateTime\(event\.createdAt\)/);
assert.match(historyUi, /event\.actorName \? ` · \$\{event\.actorName\}`/);

const { missingAssignedDirectOrderIds, mapAssignedOrderSummariesByStock } =
  loadTsModule("src/workspaces/extra/assigned-order-links.ts");
const { classifySoldExtra, canMarkAssignedPhysicalStockReady } = loadTsModule(
  "src/engines/extra/sold-stock-lifecycle.ts",
);
const completedPickup = {
  id: "completed-pickup",
  order_number: "ORD-PICKUP",
  status: "paid",
  order_source: "customer_website",
  customer_id: null,
  extra_stock_id: null,
  fulfilment_method: "pickup",
  picked_up_at: "2026-10-02T12:00:00Z",
  out_for_delivery_at: null,
  delivered_at: null,
  ready_at: "2026-10-02T10:00:00Z",
  created_at: "2026-10-01T00:00:00Z",
};
const completedDelivery = {
  ...completedPickup,
  id: "completed-delivery",
  order_number: "ORD-DELIVERY",
  fulfilment_method: "delivery",
  picked_up_at: null,
  delivered_at: "2026-10-03T12:00:00Z",
};
const activeOrder = {
  ...completedPickup,
  id: "active-order",
  order_number: "ORD-ACTIVE",
  picked_up_at: null,
};
const cancelledOrder = {
  ...completedPickup,
  id: "cancelled-order",
  order_number: "ORD-CANCELLED",
  status: "cancelled",
};
const cancelledLegacyOrder = {
  ...cancelledOrder,
  id: "cancelled-legacy-order",
  extra_stock_id: "s1",
};
const stockRows = [
  { id: "s1", order_id: completedPickup.id },
  { id: "s2", order_id: completedDelivery.id },
  { id: "s3", order_id: activeOrder.id },
  { id: "s4", order_id: cancelledOrder.id },
  { id: "s5", order_id: "missing-order" },
  { id: "s6", order_id: null },
];
const initialCandidates = [activeOrder, cancelledOrder, cancelledLegacyOrder];
assert.deepEqual(
  Array.from(missingAssignedDirectOrderIds(stockRows, initialCandidates)),
  [completedPickup.id, completedDelivery.id, "missing-order"],
  "only unique direct order IDs missing from the candidate set are fetched",
);
const lookup = mapAssignedOrderSummariesByStock(stockRows, [
  ...initialCandidates,
  completedPickup,
  completedDelivery,
]);
assert.equal(lookup.get("s1")?.id, completedPickup.id);
assert.equal(lookup.get("s2")?.id, completedDelivery.id);
assert.equal(lookup.get("s3")?.id, activeOrder.id);
assert.equal(lookup.get("s4")?.id, cancelledOrder.id);
assert.equal(
  lookup.has("s5"),
  false,
  "an unresolved direct pointer stays unresolved",
);
assert.equal(lookup.has("s6"), false, "an unlinked row is not cross-mapped");
const snapshot = (order) =>
  order
    ? {
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
      }
    : null;
assert.equal(classifySoldExtra(snapshot(lookup.get("s1"))), "history");
assert.equal(classifySoldExtra(snapshot(lookup.get("s2"))), "history");
assert.equal(classifySoldExtra(snapshot(lookup.get("s3"))), "active");
assert.equal(classifySoldExtra(snapshot(lookup.get("s4"))), "review");
assert.equal(classifySoldExtra(snapshot(null)), "review");
assert.equal(
  canMarkAssignedPhysicalStockReady({
    lifecycle: "confirmed",
    soldAt: "2026-10-01T00:00:00Z",
    orderId: completedPickup.id,
    cutIntoSlicesAt: null,
    walkInHeld: false,
    readyForCollection: false,
    readinessLinkVerified: true,
    order: snapshot(lookup.get("s1")),
  }),
  false,
  "a completed historical sale cannot re-enter actionable stock controls",
);

const queryExports = {};
const querySource = fs.readFileSync("src/workspaces/extra/queries.ts", "utf8");
const queryCompiled = ts.transpileModule(querySource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const physicalStock = {
  id: "s1",
  order_id: completedPickup.id,
  lifecycle: "confirmed",
  cake_name: "Pistachio Chocolate (Less Sweet)",
  size_label: '6"',
  library_cake_id: null,
  library_cake_size_id: null,
  prepared_on: "2026-10-01",
  pickup_available_from_at: null,
  pickup_through_at: null,
  sold_at: "2026-10-01T02:00:00Z",
  cut_into_slices_at: null,
  ready_for_collection: false,
  walk_in_held_at: null,
  walk_in_held_until: null,
  walk_in_held_by: null,
  walk_in_hold_extended_at: null,
  walk_in_hold_reminder_sent_at: null,
  note: null,
  proposed_at: "2026-10-01T01:00:00Z",
  proposed_by: "staff-1",
  confirmed_at: "2026-10-01T01:00:00Z",
  confirmed_by: "staff-1",
  rejected_at: null,
  rejected_by: null,
  reject_reason: null,
};
let reconciliationIds = [];
function makeBuilder(table, calls = []) {
  const builder = {
    select() {
      return this;
    },
    is(...args) {
      calls.push(["is", ...args]);
      return this;
    },
    not(...args) {
      calls.push(["not", ...args]);
      return this;
    },
    order() {
      return this;
    },
    in(column, values) {
      calls.push(["in", column, values]);
      return this;
    },
    or() {
      return this;
    },
    then(resolve, reject) {
      let data = [];
      if (table === "extra_stock" && calls.some((call) => call[0] === "not")) {
        data = [physicalStock];
      } else if (
        table === "orders" &&
        calls.some((call) => call[0] === "in" && call[1] === "status")
      ) {
        data = [cancelledLegacyOrder];
      } else if (
        table === "orders" &&
        calls.some((call) => call[0] === "in" && call[1] === "id")
      ) {
        reconciliationIds = calls.find(
          (call) => call[0] === "in" && call[1] === "id",
        )[2];
        data = [completedPickup];
      }
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return builder;
}
const helperModule = loadTsModule(
  "src/workspaces/extra/assigned-order-links.ts",
);
vm.runInNewContext(queryCompiled, {
  exports: queryExports,
  require: (id) => {
    if (id === "@/lib/supabase/server")
      return {
        createClient: async () => ({ from: (table) => makeBuilder(table) }),
      };
    if (id === "@/engines/extra/availability")
      return {
        isExtraAvailable: () => false,
        isExtraConfirmedOnOffer: () => false,
      };
    if (id === "@/engines/extra/fresh-picks-fulfilment")
      return {
        extraCustomerVisibleFulfilmentDates: () => [],
        freshPickTodayOrderability: () => null,
      };
    if (id === "@/engines/extra/home-fresh-picks")
      return { compareHomeFreshPickUnits: () => 0 };
    if (id === "@/engines/extra/walk-in-hold")
      return { isExtraWalkInHeld: () => false };
    if (id === "@/engines/extra/sold-stock-lifecycle")
      return loadTsModule("src/engines/extra/sold-stock-lifecycle.ts");
    if (id === "@/engines/extra/assignment-eligibility") return {};
    if (id === "@/engines/menu/cake-photos")
      return { resolveCakePhoto: () => null };
    if (id === "@/engines/menu/cake-size-order")
      return { sortCakeSizesByNumericLabel: (rows) => rows };
    if (id === "@/workspaces/library/cakes/photo-storage")
      return { isMissingCakePhotoSchema: () => false };
    if (id === "@/workspaces/library/operating-hours/queries")
      return { loadOperatingHoursSnapshot: async () => null };
    if (id === "@/workspaces/storefront/extra/config")
      return { loadFreshPicksPreparationConfig: async () => null };
    if (id === "@/workspaces/extra/assigned-order-links") return helperModule;
    throw new Error(`Unexpected import in isolated read-model test: ${id}`);
  },
  Date,
  Map,
  Set,
  Boolean,
  String,
  Number,
  Math,
  Error,
});

assert.match(
  querySource,
  /missingAssignedDirectOrderIds\([\s\S]*?activeSoldRows[\s\S]*?activeOrders/,
);
assert.match(
  querySource,
  /\.select\(ASSIGNED_ORDER_SELECT\)[\s\S]*?\.in\("id", directOrderIdsToResolve\)/,
);

(async () => {
  const units = await queryExports.listExtraStockUnits();
  assert.deepEqual(Array.from(reconciliationIds), [completedPickup.id]);
  assert.equal(units.length, 1);
  assert.equal(units[0].assignedOrderId, completedPickup.id);
  assert.equal(units[0].assignedOrderNumber, completedPickup.order_number);
  assert.equal(units[0].assignedOrderPickedUpAt, completedPickup.picked_up_at);
  assert.equal(units[0].assignedStockReadinessAllowed, true);
  assert.equal(units[0].assignedStockReadyActionAllowed, false);
  console.log(
    "PASS: Bakery read model resolves the direct completed sale and does not expose completed stock as actionable.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
assert.match(
  querySource,
  /attachAssignedOrderDetails\(units, stockRows, \[\s*\.\.\.activeOrders,\s*\.\.\.directOrderDetails/,
);

console.log("PASS: Library disclosure is collapsed and accessible by default.");
console.log(
  "PASS: completed direct pickup/delivery links resolve Sold History without overriding cancelled or unresolved records.",
);
console.log(
  "PASS: active, cancelled, missing and multi-stock mappings retain their intended classifications and safeguards.",
);
