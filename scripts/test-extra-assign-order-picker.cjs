const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const dialogSource = fs.readFileSync("src/workspaces/extra/AssignExtraToOrderDialog.tsx", "utf8");

const source = fs.readFileSync("src/workspaces/extra/queries.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
const stock = {
  id: "stock-1", cake_name: "Cocoa", size_label: "6 inch", library_cake_id: "cake-1", library_cake_size_id: "size-1",
  lifecycle: "confirmed", pickup_through_at: `${tomorrow}T23:00:00Z`, sold_at: null,
  cut_into_slices_at: null, walk_in_held_until: null,
};
const item = (cakeId, sizeId, cakeName = "Cocoa", sizeLabel = "6 inch", quantity = 1) => ({
  cake_id: cakeId, cake_size_id: sizeId, cake_name: cakeName, size_label: sizeLabel, quantity,
});
const order = (id, date, name, number, items, extraId = null, status = "paid", extra = {}) => ({
  id, pickup_date: date, pickup_time: "12:00:00", guest_name: name,
  order_number: number, customer_id: null, customers: null,
  fulfilment_method: "pickup", extra_stock_id: extraId, status,
  picked_up_at: null, out_for_delivery_at: null, delivered_at: null,
  order_items: items, ...extra,
});
const rows = [
  order("1", today, "Amy", "ORD-1", [item("cake-2", "size-2", "Vanilla")]),
  order("2", tomorrow, "Ben", "ORD-2", [item("cake-1", "size-1")]),
  order("3", yesterday, "Cara", "ORD-3", [item("cake-1", "size-1")]),
  order("4", today, "Dina", "ORD-4", [item("cake-1", "size-1")], "assigned-4"),
  order("5", today, "Evan", "ORD-5", [item("cake-1", "size-1")], null, "cancelled"),
  order("6", today, null, "ORD-6", [item("cake-1", "size-1")], null, "paid", {
    customer_id: "customer-1", customers: { full_name: "Farah Lee" },
  }),
  order("7", today, "Grace", "ORD-7", [item("cake-1", "size-1")], null, "completed"),
  order("8", today, "Hana", "ORD-8", [item("cake-1", "size-1")], null, "paid", {
    delivered_at: "2026-10-20T03:00:00Z",
  }),
];
const customers = [{ id: "customer-1", full_name: "Farah Lee" }];
const allocations = [{
  id: "assigned-4", order_id: null, lifecycle: "confirmed", sold_at: "2026-10-20T03:00:00Z",
  cut_into_slices_at: null, cake_name: "Cocoa", size_label: "6 inch",
  library_cake_id: "cake-1", library_cake_size_id: "size-1",
}];

function table(name) {
  const state = { filters: [], sorts: [], range: null, search: null };
  const builder = {
    select() { return this; },
    eq(key, value) {
      state.filters.push((r) => key.startsWith("order_items.")
        ? (r.order_items ?? []).some((item) => item[key.slice("order_items.".length)] === value)
        : r[key] === value);
      return this;
    },
    neq(key, value) { state.filters.push((r) => r[key] !== value); return this; },
    not(key, operator, value) {
      if (operator === "in") {
        const excluded = value.slice(1, -1).split(",");
        state.filters.push((r) => !excluded.includes(String(r[key])));
      }
      return this;
    },
    is(key, value) { state.filters.push((r) => r[key] === value); return this; },
    in(key, values) { state.filters.push((r) => values.includes(r[key])); return this; },
    lt(key, value) { state.filters.push((r) => r[key] < value); return this; },
    gte(key, value) { state.filters.push((r) => r[key] >= value); return this; },
    ilike(key, value) {
      state.filters.push((r) => {
        const field = key.startsWith("order_items.") ? key.slice("order_items.".length) : key;
        return key.startsWith("order_items.")
          ? (r.order_items ?? []).some((item) => String(item[field] ?? "").toLowerCase() === value.replaceAll("%", "").toLowerCase())
          : String(r[field] ?? "").toLowerCase().includes(value.replaceAll("%", "").toLowerCase());
      });
      return this;
    },
    or(value) { state.search = value; return this; },
    order(key, options) { state.sorts.push([key, options.ascending]); return this; },
    range(first, last) { state.range = [first, last]; return this; },
    limit(count) { state.range = [0, count - 1]; return this; },
    async single() { return { data: stock, error: null }; },
    then(resolve, reject) {
      let sourceRows = name === "orders" ? rows : name === "customers" ? customers : allocations;
      let result = sourceRows.filter((r) => state.filters.every((predicate) => predicate(r)));
      if (state.search) {
        const term = state.search.match(/order_number\.ilike\.%(.*?)%/)?.[1]?.toLowerCase() ?? "";
        result = result.filter((r) => r.order_number?.toLowerCase().includes(term) ||
          String(r.guest_name ?? "").toLowerCase().includes(term) ||
          (state.search.includes("customer_id.in.") && r.customer_id === "customer-1"));
      }
      result.sort((a, b) => {
        for (const [key, ascending] of state.sorts) {
          if (a[key] === b[key]) continue;
          return (a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      if (state.range) result = result.slice(state.range[0], state.range[1] + 1);
      return Promise.resolve({ data: result, error: null }).then(resolve, reject);
    },
  };
  return builder;
}

const moduleExports = {};
const eligibilitySource = fs.readFileSync("src/engines/extra/assignment-eligibility.ts", "utf8");
const eligibilityModule = {};
vm.runInNewContext(ts.transpileModule(eligibilitySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: eligibilityModule, Map, Math, String });
vm.runInNewContext(compiled, {
  exports: moduleExports,
  require: (id) => id === "@/lib/supabase/server"
    ? { createClient: async () => ({ from: table }) }
    : id === "@/engines/extra/availability"
      ? { isExtraAvailable: ({ lifecycle, pickupThroughAt, soldAt, cutIntoSlicesAt, walkInHeldUntil }) =>
          lifecycle === "confirmed" && Boolean(pickupThroughAt) && Date.parse(pickupThroughAt) > Date.now() && !soldAt && !cutIntoSlicesAt && (!walkInHeldUntil || Date.parse(walkInHeldUntil) < Date.now()) }
      : id === "@/engines/extra/assignment-eligibility"
        ? eligibilityModule
      : {},
  Intl, Date, Math, Number, String, Boolean, Array, Error, Map,
});

(async () => {
  const list = moduleExports.listAssignableOrdersForExtra;
  const base = { extraStockId: "stock-1", search: "", older: false, matchingOnly: true, page: 0 };
  const upcoming = await list(base);
  assert.deepEqual(upcoming.orders.map((o) => o.orderNumber), ["ORD-4", "ORD-6", "ORD-2"]);
  assert.equal(upcoming.orders[1].guestName, "Farah Lee");
  assert.equal(upcoming.orders.find((o) => o.orderNumber === "ORD-4").canAssign, false);
  assert.equal(upcoming.orders.some((o) => ["ORD-5", "ORD-7", "ORD-8"].includes(o.orderNumber)), false);
  const allOrders = await list({ ...base, matchingOnly: false });
  assert.deepEqual(allOrders.orders.map((o) => o.orderNumber), ["ORD-4", "ORD-6", "ORD-2", "ORD-1", "ORD-5", "ORD-7", "ORD-8"]);
  assert.equal(allOrders.orders.find((o) => o.orderNumber === "ORD-1").canAssign, false);
  assert.match(allOrders.orders.find((o) => o.orderNumber === "ORD-1").unavailableReason, /does not contain/);
  assert.equal(allOrders.orders.find((o) => o.orderNumber === "ORD-4").canAssign, false, "allocated quantity disables duplicate assignment");
  assert.equal(allOrders.orders.find((o) => o.orderNumber === "ORD-5").canAssign, false, "cancelled order cannot be selected");
  assert.equal(allOrders.orders.find((o) => o.orderNumber === "ORD-7").canAssign, false, "completed order cannot be selected");
  assert.equal(allOrders.orders.find((o) => o.orderNumber === "ORD-8").canAssign, false, "delivered order cannot be selected");
  assert.deepEqual((await list({ ...base, older: true })).orders.map((o) => o.orderNumber), ["ORD-3"]);
  assert.deepEqual((await list({ ...base, search: "Farah" })).orders.map((o) => o.orderNumber), ["ORD-6"]);
  assert.deepEqual((await list({ ...base, search: "ORD-2" })).orders.map((o) => o.orderNumber), ["ORD-2"]);
  assert.equal((await list({ ...base, search: "Nobody" })).orders.length, 0);
  assert.match(dialogSource, /disabled={!order\.canAssign}/, "All Orders results that fail eligibility cannot be selected");
  assert.match(dialogSource, /if \(!selected\)/, "confirmation requires explicit order selection");
  assert.match(dialogSource, /submitting\.current\) return/, "double submission is blocked");
  assert.match(dialogSource, /setRefreshVersion\(\(value\) => value \+ 1\)/, "stale assignment results reload after RPC failure");
  console.log("assign_order_picker=PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
