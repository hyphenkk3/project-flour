const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(
  "src/engines/extra/sold-stock-lifecycle.ts",
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports });

const order = (overrides = {}) => ({
  id: "order-1",
  status: "paid",
  orderSource: "customer_website",
  customerId: null,
  extraStockId: "stock-1",
  fulfilmentMethod: "pickup",
  pickedUpAt: null,
  deliveredAt: null,
  outForDeliveryAt: null,
  readyAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...overrides,
});
const readyInput = (overrides = {}) => ({
  lifecycle: "confirmed",
  soldAt: "2026-10-01T00:00:00Z",
  orderId: "order-1",
  cutIntoSlicesAt: null,
  walkInHeld: false,
  readyForCollection: false,
  readinessLinkVerified: true,
  order: order(),
  ...overrides,
});

assert.equal(moduleExports.classifySoldExtra(order()), "active");
assert.equal(
  moduleExports.classifySoldExtra(
    order({ fulfilmentMethod: "pickup", pickedUpAt: "2026-10-02T00:00:00Z" }),
  ),
  "history",
);
const paidPickupAlreadyCollected = order({
  status: "paid",
  fulfilmentMethod: "pickup",
  pickedUpAt: "2026-10-19T06:22:43.092758Z",
});
assert.equal(
  moduleExports.classifySoldExtra(paidPickupAlreadyCollected),
  "history",
  "sold stock linked to a paid pickup with a recorded handoff belongs in Sold History",
);
assert.equal(
  moduleExports.soldExtraCompletedAt(
    paidPickupAlreadyCollected,
    "2026-10-19T06:21:03Z",
  ),
  "2026-10-19T06:22:43.092758Z",
  "history records the pickup handoff rather than leaving the cake in attention work",
);
assert.equal(
  moduleExports.classifySoldExtra(
    order({ fulfilmentMethod: "dine_in", pickedUpAt: "2026-10-02T00:00:00Z" }),
  ),
  "history",
);
assert.equal(
  moduleExports.classifySoldExtra(
    order({
      fulfilmentMethod: "delivery",
      deliveredAt: "2026-10-02T00:00:00Z",
    }),
  ),
  "history",
);
assert.equal(
  moduleExports.classifySoldExtra(
    order({
      fulfilmentMethod: "delivery",
      outForDeliveryAt: "2026-10-02T00:00:00Z",
    }),
  ),
  "active",
);
assert.equal(
  moduleExports.classifySoldExtra(order({ orderSource: "walk_in" })),
  "history",
);
assert.equal(
  moduleExports.classifySoldExtra(order({ status: "cancelled" })),
  "review",
);
assert.equal(moduleExports.classifySoldExtra(null), "review");
assert.equal(
  moduleExports.classifySoldExtra(order({ fulfilmentMethod: null })),
  "review",
);
// Scheduled dates are deliberately not classifier inputs: overdue, uncollected work remains active.
assert.equal(
  moduleExports.classifySoldExtra(order({ pickedUpAt: null })),
  "active",
);

assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(readyInput()),
  true,
);
assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(
    readyInput({ order: order({ pickedUpAt: "2026-10-02T00:00:00Z" }) }),
  ),
  false,
);
assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(
    readyInput({
      order: order({
        fulfilmentMethod: "delivery",
        outForDeliveryAt: "2026-10-02T00:00:00Z",
      }),
    }),
  ),
  false,
);
assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(
    readyInput({
      order: order({
        fulfilmentMethod: "delivery",
        deliveredAt: "2026-10-02T00:00:00Z",
      }),
    }),
  ),
  false,
);
assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(
    readyInput({ order: order({ status: "cancelled" }) }),
  ),
  false,
);
assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(
    readyInput({ order: order({ customerId: "customer-1" }) }),
  ),
  false,
);
assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(
    readyInput({ readinessLinkVerified: false }),
  ),
  false,
);
assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(
    readyInput({ walkInHeld: true }),
  ),
  false,
);
assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(
    readyInput({ cutIntoSlicesAt: "2026-10-02T00:00:00Z" }),
  ),
  false,
);
assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(
    readyInput({ readyForCollection: true }),
  ),
  false,
);
assert.equal(
  moduleExports.canMarkAssignedPhysicalStockReady(
    readyInput({ order: order({ status: "awaiting_payment" }) }),
  ),
  true,
  "physical readiness remains separate from the full-payment order-level gate",
);

const querySource = fs.readFileSync("src/workspaces/extra/queries.ts", "utf8");
const queryCompiled = ts.transpileModule(querySource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const stockRow = (id, orderId) => ({
  id,
  order_id: orderId,
  lifecycle: "confirmed",
  cake_name: `Cake ${id}`,
  size_label: "6 inch",
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
});
const historyRows = [
  stockRow("collected", "order-collected"),
  stockRow("active", "order-active"),
  stockRow("walk-in", "order-walk-in"),
  stockRow("unlinked", null),
  ...Array.from({ length: 18 }, (_, index) =>
    stockRow(`history-${index}`, `order-history-${index}`),
  ),
];
const orderRows = [
  {
    id: "order-collected",
    order_number: "ORD-C",
    guest_name: "Collected Customer",
    extra_stock_id: null,
    status: "paid",
    order_source: "customer_website",
    customer_id: null,
    fulfilment_method: "pickup",
    pickup_date: "2026-10-01",
    ready_at: null,
    picked_up_at: "2026-10-02T00:00:00Z",
    out_for_delivery_at: null,
    delivered_at: null,
    created_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "order-active",
    order_number: "ORD-A",
    guest_name: "Active Customer",
    extra_stock_id: null,
    status: "paid",
    order_source: "customer_website",
    customer_id: null,
    fulfilment_method: "pickup",
    pickup_date: "2020-01-01",
    ready_at: null,
    picked_up_at: null,
    out_for_delivery_at: null,
    delivered_at: null,
    created_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "order-walk-in",
    order_number: "ORD-W",
    guest_name: "Counter Customer",
    extra_stock_id: "walk-in",
    status: "paid",
    order_source: "walk_in",
    customer_id: null,
    fulfilment_method: "pickup",
    pickup_date: "2026-10-01",
    ready_at: null,
    picked_up_at: null,
    out_for_delivery_at: null,
    delivered_at: null,
    created_at: "2026-10-01T00:00:00Z",
  },
  ...Array.from({ length: 18 }, (_, index) => ({
    id: `order-history-${index}`,
    order_number: `ORD-H${index}`,
    guest_name: `History ${index}`,
    extra_stock_id: null,
    status: "paid",
    order_source: "walk_in",
    customer_id: null,
    fulfilment_method: "pickup",
    pickup_date: "2026-10-01",
    ready_at: null,
    picked_up_at: null,
    out_for_delivery_at: null,
    delivered_at: null,
    created_at: "2026-10-01T00:00:00Z",
  })),
];
function resultBuilder(tableName) {
  const state = { first: 0, last: Number.MAX_SAFE_INTEGER };
  const builder = {
    select() {
      return this;
    },
    not() {
      return this;
    },
    order() {
      return this;
    },
    or() {
      return this;
    },
    gte() {
      return this;
    },
    lt() {
      return this;
    },
    range(first, last) {
      state.first = first;
      state.last = last;
      return this;
    },
    then(resolve, reject) {
      const data =
        tableName === "extra_stock"
          ? historyRows.slice(state.first, state.last + 1)
          : orderRows;
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return builder;
}
const queryExports = {};
const assignmentHelper = {};
const assignmentHelperSource = fs.readFileSync("src/engines/extra/assignment-eligibility.ts", "utf8");
vm.runInNewContext(ts.transpileModule(assignmentHelperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: assignmentHelper, Map, Math, String });
vm.runInNewContext(queryCompiled, {
  exports: queryExports,
  require: (id) => {
    if (id === "@/lib/supabase/server")
      return { createClient: async () => ({ from: resultBuilder }) };
    if (id === "@/engines/extra/availability")
      return {
        isExtraAvailable: () => false,
        isExtraConfirmedOnOffer: () => false,
      };
    if (id === "@/engines/extra/assignment-eligibility") return assignmentHelper;
    if (id === "@/engines/extra/fresh-picks-fulfilment")
      return {
        extraCustomerVisibleFulfilmentDates: () => [],
        freshPickTodayOrderability: () => null,
      };
    if (id === "@/engines/extra/home-fresh-picks")
      return { compareHomeFreshPickUnits: () => 0 };
    if (id === "@/engines/extra/walk-in-hold")
      return { isExtraWalkInHeld: () => false };
    if (id === "@/engines/extra/sold-stock-lifecycle") return moduleExports;
    if (id === "@/workspaces/extra/assigned-order-links") {
      return {
        mapAssignedOrderSummariesByStock: (stocks, orders) => {
          const byId = new Map(orders.map((row) => [row.id, row]));
          return new Map(
            stocks.flatMap((stock) => {
              const order = stock.order_id ? byId.get(stock.order_id) : null;
              return order
                ? [[stock.id, { ...order, readinessLinkVerified: true }]]
                : [];
            }),
          );
        },
      };
    }
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
    throw new Error(`Unexpected import in isolated query test: ${id}`);
  },
  Date,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Map,
  Set,
  Error,
});

const board = fs.readFileSync("src/workspaces/extra/ExtraBoard.tsx", "utf8");
assert.match(
  board,
  /classifySoldExtra\(soldOrderSnapshot\(unit\)\) !== "history"/,
);
assert.match(board, /Active \/ Needs Attention/);
assert.match(board, /assignedStockReadyActionAllowed/);
assert.match(board, /SoldExtraHistoryPanel/);
const history = fs.readFileSync(
  "src/workspaces/extra/SoldExtraHistoryPanel.tsx",
  "utf8",
);
assert.match(history, /Load more history/);
assert.match(history, /type="date"/);
assert.match(history, /Search history/);
const queries = fs.readFileSync("src/workspaces/extra/queries.ts", "utf8");
assert.match(queries, /\.range\(offset, offset \+ pageSize - 1\)/);
assert.match(queries, /ASSIGNED_ORDER_SELECT[\s\S]*?picked_up_at/);
assert.match(queries, /picked_up_at\.is\.null/);
const actions = fs.readFileSync("src/workspaces/extra/actions.ts", "utf8");
assert.match(
  actions,
  /export async function listSoldExtraHistoryAction[\s\S]*?await requireExtraStaff\(\)/,
);
const orderCard = fs.readFileSync(
  "src/workspaces/owner/orders/OwnerOrderCard.tsx",
  "utf8",
);
assert.match(orderCard, /className="shrink-0 whitespace-nowrap"/);

(async () => {
  const page = await queryExports.listSoldExtraHistoryPage({
    search: "",
    soldFrom: "",
    soldThrough: "",
    offset: 0,
  });
  assert.deepEqual(
    Array.from(page.items, (unit) => unit.id).sort(),
    [
      "collected",
      "walk-in",
      ...Array.from({ length: 16 }, (_, index) => `history-${index}`),
    ].sort(),
  );
  assert.equal(page.reviewItems.length, 1);
  assert.equal(page.reviewItems[0].id, "unlinked");
  assert.equal(page.nextOffset, 20);
  assert.equal(page.hasMore, true);
  const finalPage = await queryExports.listSoldExtraHistoryPage({
    search: "",
    soldFrom: "",
    soldThrough: "",
    offset: page.nextOffset,
  });
  assert.deepEqual(
    Array.from(finalPage.items, (unit) => unit.id),
    ["history-16", "history-17"],
  );
  assert.equal(finalPage.hasMore, false);
  console.log("sold_stock_lifecycle_and_history_query=PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
