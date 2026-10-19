/** Executes the real Server Action and form parser; mocks only external I/O.
 * No environment files, database connections, or network requests are used.
 * Database rollback/audit integration is covered by test-cake-size-amendment-db.py.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const cache = new Map();
function compile(source, dependencies) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText,
    { exports, require: dependencies, FormData, Date, console },
  );
  return exports;
}
function pure(name) {
  if (!name.startsWith("@/")) return require(name);
  if (cache.has(name)) return cache.get(name);
  const stem = path.join(process.cwd(), "src", name.slice(2));
  const file = [stem + ".ts", stem + "/index.ts"].find(existsSync);
  assert.ok(file, name);
  const result = {};
  cache.set(name, result);
  Object.assign(result, compile(readFileSync(file, "utf8"), pure));
  return result;
}
const original = [
  {
    id: "row-one",
    cakeId: "cake",
    cakeSizeId: "four",
    quantity: 1,
    unitPrice: 1,
    cakeName: "Historical cake",
    sizeLabel: "Historical four",
  },
  {
    id: "row-two",
    cakeId: "cake",
    cakeSizeId: "four",
    quantity: 1,
    unitPrice: 2,
    cakeName: "Second historical cake",
    sizeLabel: "Second historical four",
  },
];
let before, calls, reprices, scheduled, rpcError;
const cake = {
  id: "cake",
  name: "Current cake",
  sizes: [
    { id: "four", size: '4"', price: 999 },
    { id: "six", size: '6"', price: 888 },
  ],
};
const client = {
  from() {
    throw new Error("Unexpected non-atomic application write");
  },
  async rpc(name, payload) {
    if (name === "library_cake_size_price_on") {
      reprices++;
      return { data: 17, error: null };
    }
    assert.equal(name, "save_guest_order_workspace_atomic");
    // Capture the JSON actually sent over the RPC wire (undefined new IDs disappear).
    calls.push(JSON.parse(JSON.stringify(payload)));
    return { error: rpcError ? { message: rpcError } : null };
  },
};
let source = readFileSync("src/workspaces/owner/orders/actions.ts", "utf8");
// Baseline mode demonstrates the original bug without changing any worktree file.
if (process.argv.includes("--baseline"))
  source = source.replace("          item_id: item.itemId,\n", "");
const actions = compile(source, (name) => {
  if (name === "next/cache") return { revalidatePath() {} };
  if (name === "next/navigation")
    return {
      redirect() {
        throw new Error("Unauthorized redirect");
      },
    };
  if (name.endsWith("/auth/session"))
    return {
      requireStaff: async () => ({
        id: "authenticated-owner",
        role: { code: "owner" },
      }),
    };
  if (name.endsWith("/supabase/server"))
    return { createClient: async () => client };
  if (name.endsWith("/orders/queries"))
    return { getGuestOrderById: async () => before };
  if (name.endsWith("/catalog/queries"))
    return {
      listOfferableLibraryCakes: async () => [cake],
      getAvailableCakeById: async () => cake,
    };
  if (name.endsWith("/collection-date-guard"))
    return { assertStaffCollectionDateAllowed: async () => ({ error: null }) };
  if (name.endsWith("/operating-hours/queries"))
    return { loadOperatingHoursSnapshot: async () => ({}) };
  if (name.endsWith("/schedule-staff-notification-dispatch"))
    return {
      scheduleStaffNotificationDispatch() {
        scheduled++;
      },
    };
  if (name.endsWith("/operations/approvals"))
    return { isWithinTwoDayChangeCutoff: () => false };
  if (
    [
      "@/engines/orders/fulfilment",
      "@/workspaces/owner/orders/staff-preorder-form",
      "@/workspaces/owner/orders/labels",
      "@/engines/orders/post-payment-customer-change",
      "@/engines/business-calendar/pickup-slots",
      "@/lib/dates",
    ].includes(name)
  )
    return pure(name);
  return {};
});
function reset(rows = original) {
  before = {
    id: "order",
    status: "paid",
    pickupDate: "2026-11-10",
    pickupTime: "12:00",
    orderSource: "walk_in",
    fulfilmentMethod: "pickup",
    customerName: "Synthetic customer",
    phone: "",
    email: "",
    notes: null,
    delivery: null,
    items: structuredClone(rows),
    complimentaryItems: [],
    paidAddons: [],
    postPaymentCustomerChangeCount: 0,
  };
  calls = [];
  reprices = 0;
  scheduled = 0;
  rpcError = null;
}
function draft(rows = before.items) {
  return rows.map((r) => ({
    itemId: r.id,
    cakeId: r.cakeId,
    cakeSizeId: r.cakeSizeId,
    quantity: r.quantity,
  }));
}
async function save(items = draft(), fields = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    guest_name: before.customerName,
    order_source: "walk_in",
    pickup_date: before.pickupDate,
    pickup_time: before.pickupTime,
    fulfilment_method: "pickup",
    internal_notes: "Notes-only amendment",
    post_payment_change_override: "1",
    pickup_month_override: "1",
    ...fields,
  }))
    form.set(key, value);
  form.set("items_json", JSON.stringify(items));
  const result = await actions.saveOrderWorkspaceAction("order", {}, form);
  return { result, payload: calls.at(-1), items: calls.at(-1)?.p_plan.items };
}
let count = 0;
async function test(name, fn) {
  reset();
  await fn();
  count++;
  console.log(`PASS ${name}`);
}
await test("1 equal-price historical rows remain distinct", async () => {
  before.items[1].unitPrice = 1;
  const { items, result } = await save();
  assert.equal(result.success, true);
  assert.deepEqual(
    items.map((i) => i.item_id),
    ["row-one", "row-two"],
  );
  assert.deepEqual(
    items.map((i) => i.unit_price),
    [1, 1],
  );
});
await test("2 notes-only save sends unchanged selections in one atomic call", async () => {
  const { payload } = await save();
  assert.equal(payload.p_plan.order.internal_notes, "Notes-only amendment");
  assert.equal(calls.length, 1);
  assert.equal(reprices, 0);
});
await test("3 form parser to RPC preserves original row IDs", async () => {
  const { items } = await save();
  assert.deepEqual(
    items.map((i) => i.item_id),
    original.map((i) => i.id),
  );
});
await test("4 duplicate cake-size rows retain separate prices and quantities", async () => {
  const { items } = await save();
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => i.unit_price),
    [1, 2],
  );
  assert.deepEqual(
    items.map((i) => i.quantity),
    [1, 1],
  );
});
await test("5 exact-row quantity change retains both identities", async () => {
  const input = draft();
  input[1].quantity = 3;
  const { items } = await save(input);
  assert.deepEqual(
    items.map((i) => [i.item_id, i.quantity, i.unit_price]),
    [
      ["row-one", 1, 1],
      ["row-two", 3, 2],
    ],
  );
});
await test("6 new selection has no fabricated ID and uses date-specific price", async () => {
  before.status = "submitted";
  const { items } = await save([
    ...draft(),
    { cakeId: "cake", cakeSizeId: "six", quantity: 1 },
  ]);
  assert.equal(items.length, 3);
  assert.equal("item_id" in items[2], false);
  assert.equal(items[2].unit_price, 17);
  assert.equal(reprices, 1);
});
await test("7 removed row is omitted; retained row keeps its identity", async () => {
  const { items } = await save(draft().slice(1));
  assert.equal(items.length, 1);
  assert.equal(items[0].item_id, "row-two");
});
await test("8 pickup-date change retains row IDs and historical prices", async () => {
  const { payload, items } = await save(draft(), { pickup_date: "2026-11-11" });
  assert.equal(payload.p_plan.expected_pickup_date, "2026-11-10");
  assert.equal(payload.p_plan.order.pickup_date, "2026-11-11");
  assert.deepEqual(
    items.map((i) => i.item_id),
    ["row-one", "row-two"],
  );
  assert.equal(reprices, 0);
});
await test("9 size amendment retains target ID and resolves changed-size price", async () => {
  before.status = "submitted";
  const input = draft();
  input[1].cakeSizeId = "six";
  const { items } = await save(input);
  assert.equal(items[1].item_id, "row-two");
  assert.equal(items[1].cake_size_id, "six");
  assert.equal(items[1].unit_price, 17);
  assert.equal(items[0].unit_price, 1);
});
await test("10 historical prices are never taken from current catalogue", async () => {
  const { items } = await save();
  assert.deepEqual(
    items.map((i) => i.unit_price),
    [1, 2],
  );
  assert.equal(reprices, 0);
});
await test("11 historical name and size snapshots survive unchanged save", async () => {
  const { items } = await save();
  assert.deepEqual(
    items.map((i) => [i.cake_name, i.size_label]),
    original.map((i) => [i.cakeName, i.sizeLabel]),
  );
});
await test("12 RPC validation error propagates without fallback or partial application writes", async () => {
  rpcError = "Available from 1 Nov 2026";
  const snapshot = JSON.stringify(before);
  const { result } = await save(draft(), { pickup_date: "2026-10-31" });
  assert.equal(result.success, false);
  assert.equal(result.error, rpcError);
  assert.equal(calls.length, 1);
  assert.equal(scheduled, 0);
  assert.equal(JSON.stringify(before), snapshot);
});
await test("13 audit actor comes from authenticated staff, not submitted form", async () => {
  const { payload } = await save(draft(), { actor_staff_id: "forged-actor" });
  assert.equal(payload.p_actor_staff_id, "authenticated-owner");
  assert.equal(payload.p_order_id, "order");
});
await test("14 foreign item ID rejected before RPC submission", async () => {
  const input = draft();
  input[1].itemId = "foreign-row";
  const { result } = await save(input);
  assert.equal(result.success, false);
  assert.match(result.error, /no longer belongs/);
  assert.equal(calls.length, 0);
});
await test("15 unchanged historical pickup date stays valid while new dates keep the standard minimum", async () => {
  const form = readFileSync(
    "src/workspaces/owner/orders/OrderWorkspaceForm.tsx",
    "utf8",
  );
  const fulfilment = readFileSync(
    "src/workspaces/owner/orders/OrderFulfilmentCreateFields.tsx",
    "utf8",
  );
  const pickupFields = readFileSync(
    "src/components/ui/PickupSlotFields.tsx",
    "utf8",
  );
  assert.match(
    form,
    /editPickupDate === order\.pickupDate \? order\.pickupDate : undefined/,
  );
  assert.match(fulfilment, /minDate=\{minDate\}/);
  assert.match(pickupFields, /minDateProp\?\.trim\(\) \|\| earliest/);
});
console.log(
  `${count}/${count} real amendment action payload scenarios passed (external I/O mocked).`,
);
