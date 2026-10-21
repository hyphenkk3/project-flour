const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

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
  id: "stock-1", cake_name: "Cocoa", size_label: "6 inch",
  library_cake_id: "cake-1", library_cake_size_id: "size-1",
};
const item = (cakeId, sizeId, cakeName = "Cocoa") => ({
  cake_id: cakeId, cake_size_id: sizeId, cake_name: cakeName,
  size_label: "6 inch", quantity: 1,
});
const order = (id, date, name, number, items, extraId = null, status = "pending") => ({
  id, pickup_date: date, pickup_time: "12:00:00", guest_name: name,
  order_number: number, customer_id: null, customers: null,
  fulfilment_method: "pickup", extra_stock_id: extraId, status,
  order_items: items,
});
const rows = [
  order("1", today, "Amy", "ORD-1", [item("cake-2", "size-2", "Vanilla")]),
  order("2", tomorrow, "Ben", "ORD-2", [item("cake-1", "size-1")]),
  order("3", yesterday, "Cara", "ORD-3", [item("cake-1", "size-1")]),
  order("4", today, "Dina", "ORD-4", [item("cake-1", "size-1")], "already-assigned"),
  order("5", today, "Evan", "ORD-5", [item("cake-1", "size-1")], null, "cancelled"),
  { ...order("6", today, null, "ORD-6", [item("cake-1", "size-1")]),
    customer_id: "customer-1", customers: { full_name: "Farah Lee" } },
];
const customers = [{ id: "customer-1", full_name: "Farah Lee" }];

function table(name) {
  const state = { filters: [], sorts: [], range: null, search: null };
  const builder = {
    select() { return this; },
    eq(key, value) {
      state.filters.push((r) => key.startsWith("order_items.")
        ? r.order_items.some((item) => item[key.slice("order_items.".length)] === value)
        : r[key] === value);
      return this;
    },
    neq(key, value) { state.filters.push((r) => r[key] !== value); return this; },
    is(key, value) { state.filters.push((r) => r[key] === value); return this; },
    lt(key, value) { state.filters.push((r) => r[key] < value); return this; },
    gte(key, value) { state.filters.push((r) => r[key] >= value); return this; },
    ilike(key, value) {
      state.filters.push((r) => String(r[key] ?? "").toLowerCase().includes(value.replaceAll("%", "").toLowerCase()));
      return this;
    },
    or(value) { state.search = value; return this; },
    order(key, options) { state.sorts.push([key, options.ascending]); return this; },
    range(first, last) { state.range = [first, last]; return this; },
    limit(count) { state.range = [0, count - 1]; return this; },
    async single() { return { data: stock, error: null }; },
    then(resolve, reject) {
      let result = (name === "orders" ? rows : customers).filter((r) =>
        state.filters.every((predicate) => predicate(r)));
      if (state.search) {
        const term = state.search.match(/order_number\.ilike\.%(.*?)%/)?.[1]?.toLowerCase() ?? "";
        result = result.filter((r) =>
          r.order_number.toLowerCase().includes(term) ||
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
vm.runInNewContext(compiled, {
  exports: moduleExports,
  require: (id) => id === "@/lib/supabase/server"
    ? { createClient: async () => ({ from: table }) }
    : {},
  Intl, Date, Math, Number, String, Boolean, Array, Error,
});

(async () => {
  const list = moduleExports.listAssignableOrdersForExtra;
  const base = { extraStockId: "stock-1", search: "", older: false, matchingOnly: true, page: 0 };
  const upcoming = await list(base);
  assert.deepEqual(upcoming.orders.map((o) => o.orderNumber), ["ORD-6", "ORD-2"]);
  assert.equal(upcoming.orders[0].guestName, "Farah Lee");
  const allOrders = await list({ ...base, matchingOnly: false });
  assert.deepEqual(allOrders.orders.map((o) => o.orderNumber), ["ORD-6", "ORD-2", "ORD-1"]);
  assert.equal(allOrders.orders[2].matchesStock, false);
  assert.equal(upcoming.orders.some((o) => o.orderNumber === "ORD-4" || o.orderNumber === "ORD-5"), false);
  assert.deepEqual((await list({ ...base, older: true })).orders.map((o) => o.orderNumber), ["ORD-3"]);
  assert.deepEqual((await list({ ...base, search: "Farah" })).orders.map((o) => o.orderNumber), ["ORD-6"]);
  assert.deepEqual((await list({ ...base, search: "ORD-2" })).orders.map((o) => o.orderNumber), ["ORD-2"]);
  assert.equal((await list({ ...base, search: "Nobody" })).orders.length, 0);
  console.log("assign_order_picker=PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
