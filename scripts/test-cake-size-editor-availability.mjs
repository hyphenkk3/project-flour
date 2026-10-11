/** Local-only editor lifecycle tests: real components and save functions, mocked I/O. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = process.cwd();
const cache = new Map();
const noop = () => {};
function compile(source, dependencies = load) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require: dependencies,
      crypto: globalThis.crypto,
      FormData,
      console,
    },
  );
  return exports;
}
function load(name) {
  if (name === "react")
    return { ...React, useActionState: () => [{}, noop, false] };
  if (name === "next/link")
    return {
      default: ({ children, ...props }) =>
        React.createElement("a", props, children),
      __esModule: true,
    };
  if (name.endsWith("/cakes/actions"))
    return { createCakeAction: noop, updateCakeAction: noop };
  if (name.endsWith("/cakes/price-schedule-actions"))
    return {
      createCakeSizePriceAction: noop,
      deleteCakeSizePriceAction: noop,
      updateCakeSizePriceAction: noop,
    };
  if (!name.startsWith("@/")) return require(name);
  if (cache.has(name)) return cache.get(name);
  const stem = path.join(root, "src", name.slice(2));
  const file = [stem + ".ts", stem + ".tsx", stem + "/index.ts"].find(
    existsSync,
  );
  assert.ok(file, `Missing local module ${name}`);
  const loaded = compile(readFileSync(file, "utf8"));
  cache.set(name, loaded);
  return loaded;
}
const availability = load("@/engines/menu/cake-size-availability");
const labels = load("@/workspaces/library/labels");
const lead = load("@/engines/preorder/lead");
const actionSource = readFileSync(
  "src/workspaces/library/cakes/actions.ts",
  "utf8",
);
let rows = [];
let writes = [];
const createClient = async () => ({
  from(table) {
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      update(payload) {
        writes.push({ table, payload });
        return query;
      },
      insert(payload) {
        writes.push({ table, payload });
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve({
          data: rows.map((row) => ({ id: row.id })),
          error: null,
        }).then(resolve, reject);
      },
    };
    return query;
  },
});
// Helpers are lexical dependencies in the extracted production functions.
function productionFunction(source, names, context) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      source + "\n" + names.map((n) => `exports.${n}=${n};`).join("\n"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
        },
      },
    ).outputText,
    { exports, ...context },
  );
  return exports;
}
const { parseSizes } = productionFunction(
  actionSource.slice(
    actionSource.indexOf("function parseSizes("),
    actionSource.indexOf("async function parseCakeInput("),
  ),
  ["parseSizes"],
  {
    parsePreorderDays: lead.parsePreorderDays,
    parseNonNegativeNumber: labels.parseNonNegativeNumber,
    cakeSizeAvailabilityRangeError: availability.cakeSizeAvailabilityRangeError,
  },
);
const { reconcileCakeSizes } = productionFunction(
  actionSource.slice(
    actionSource.indexOf("async function reconcileCakeSizes("),
    actionSource.indexOf("async function saveCakeChildren("),
  ),
  ["reconcileCakeSizes"],
  { createClient },
);
const querySource = readFileSync(
  "src/workspaces/library/cakes/queries.ts",
  "utf8",
);
const { mapSize } = productionFunction(
  querySource
    .slice(
      querySource.indexOf("export function mapSize("),
      querySource.indexOf("export function mapPhoto("),
    )
    .replace("export function", "function"),
  ["mapSize"],
  { readPreorderDays: lead.readPreorderDays },
);
const { CakeForm } = load("@/workspaces/library/cakes/CakeForm");
const cakeId = "local-cake";
function size(id, from, until) {
  return {
    id,
    cake_id: cakeId,
    label: '4"',
    price: 1,
    sort_order: 0,
    preorder_days: 3,
    available_from: from,
    available_until: until,
  };
}
function html(dbRows) {
  return renderToStaticMarkup(
    React.createElement(CakeForm, {
      mode: "edit",
      cancelHref: "/local",
      categories: [],
      tags: [],
      cake: {
        id: cakeId,
        name: "Local fixture",
        sizes: dbRows.map(mapSize),
        allergens: [],
        categories: [],
        tags: [],
        status: "active",
        showInPopularCakes: false,
      },
    }),
  );
}
function decode(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'");
}
function form(dbRows) {
  const markup = html(dbRows);
  const data = new FormData();
  for (const tag of markup.matchAll(/<input\b[^>]*>/g)) {
    const name = tag[0].match(/\bname="([^"]*)"/);
    if (!name || !name[1].startsWith("size_")) continue;
    const value = tag[0].match(/\bvalue="([^"]*)"/);
    data.append(name[1], decode(value?.[1] ?? ""));
  }
  for (const tag of markup.matchAll(
    /<select\b[^>]*name="(size_[^"]*)"[^>]*>([\s\S]*?)<\/select>/g,
  )) {
    const selected = tag[2].match(
      /<option\b(?=[^>]*selected="")(?=[^>]*value="([^"]*)")[^>]*>/,
    );
    assert.ok(selected);
    data.append(tag[1], decode(selected[1]));
  }
  return data;
}
async function save(dbRows, data) {
  rows = dbRows;
  writes = [];
  const parsed = parseSizes(data, dbRows.map(mapSize));
  if (typeof parsed === "string") return parsed;
  await reconcileCakeSizes(cakeId, parsed);
  assert.equal(writes.length, dbRows.length);
  return writes.map((write, index) => ({ ...dbRows[index], ...write.payload }));
}
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log(`PASS ${name}`);
}
const restricted = [size("r", "2026-11-01", null)];
const bounded = [size("b", "2026-11-01", "2026-11-30")];
await test("1 restricted initialization through actual CakeForm and database mapper", () => {
  assert.equal(form(restricted).get("size_available_from"), "2026-11-01");
  assert.equal(form(restricted).get("size_available_until"), "");
});
await test("2 unrestricted initialization", () => {
  const d = form([size("u", null, null)]);
  assert.equal(d.get("size_available_from"), "");
  assert.equal(d.get("size_available_until"), "");
});
await test("3 bounded initialization", () => {
  const d = form(bounded);
  assert.equal(d.get("size_available_from"), "2026-11-01");
  assert.equal(d.get("size_available_until"), "2026-11-30");
});
await test("4 unchanged save payload", async () => {
  const saved = await save(bounded, form(bounded));
  assert.equal(saved[0].available_from, "2026-11-01");
  assert.equal(saved[0].available_until, "2026-11-30");
  assert.equal(saved[0].price, 1);
});
await test("5 unrelated label, price and cake-field edits preserve dates", async () => {
  for (const [key, value] of [
    ["size_label", "Test label"],
    ["size_price", "2"],
    ["description", "Unrelated edit"],
  ]) {
    const d = form(bounded);
    d.set(key, value);
    const saved = await save(bounded, d);
    assert.equal(saved[0].available_from, "2026-11-01");
    assert.equal(saved[0].available_until, "2026-11-30");
  }
});
await test("6 explicitly clearing From saves NULL and retains Until", async () => {
  const d = form(bounded);
  d.set("size_available_from", "");
  const saved = await save(bounded, d);
  assert.equal(saved[0].available_from, null);
  assert.equal(saved[0].available_until, "2026-11-30");
});
await test("7 explicitly clearing Until saves NULL and retains From", async () => {
  const d = form(bounded);
  d.set("size_available_until", "");
  const saved = await save(bounded, d);
  assert.equal(saved[0].available_until, null);
  assert.equal(saved[0].available_from, "2026-11-01");
});
await test("8 updating one date preserves the other", async () => {
  const d = form(bounded);
  d.set("size_available_from", "2026-11-02");
  const saved = await save(bounded, d);
  assert.equal(saved[0].available_from, "2026-11-02");
  assert.equal(saved[0].available_until, "2026-11-30");
});
await test("9 invalid range rejected before save", async () => {
  const d = form(bounded);
  d.set("size_available_from", "2026-12-01");
  assert.match(await save(bounded, d), /until.*earlier|until.*before/i);
  assert.equal(writes.length, 0);
});
await test("10 multiple differently restricted sizes retain row alignment", async () => {
  const db = [...restricted, size("u", null, null), ...bounded];
  const saved = await save(db, form(db));
  assert.deepEqual(
    saved.map((s) => [s.id, s.available_from, s.available_until]),
    db.map((s) => [s.id, s.available_from, s.available_until]),
  );
});
await test("11 reopen saved editor round trip", async () => {
  const d = form(bounded);
  d.set("size_available_until", "2026-12-01");
  const saved = await save(bounded, d);
  assert.equal(form(saved).get("size_available_until"), "2026-12-01");
  assert.equal(form(saved).get("size_available_from"), "2026-11-01");
});
await test("12 date-only timezone safety", async () => {
  const previous = process.env.TZ;
  try {
    for (const tz of [
      "UTC",
      "Asia/Kuching",
      "America/Los_Angeles",
      "Pacific/Kiritimati",
    ]) {
      process.env.TZ = tz;
      const saved = await save(bounded, form(bounded));
      assert.equal(saved[0].available_from, "2026-11-01");
      assert.equal(saved[0].available_until, "2026-11-30");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
await test("13 omitted fields preserve dates; explicit sibling clear stays independent", async () => {
  const d = form(bounded);
  d.delete("size_available_from");
  d.delete("size_available_until");
  let saved = await save(bounded, d);
  assert.equal(saved[0].available_from, "2026-11-01");
  assert.equal(saved[0].available_until, "2026-11-30");
  d.set("size_available_until", "");
  saved = await save(bounded, d);
  assert.equal(saved[0].available_from, "2026-11-01");
  assert.equal(saved[0].available_until, null);
});
await test("14 partial arrays rejected rather than assigned to wrong size", () => {
  const db = [...restricted, ...bounded];
  const d = form(db);
  d.set("size_available_from", "2026-11-03");
  assert.match(parseSizes(d, db.map(mapSize)), /Reload/);
});
// Exercise the public Server Action too, including its current-size fallback wiring.
let liveCake;
const actionClient = async () => ({
  from(table) {
    let payload;
    let rowId;
    const query = {
      select() {
        return query;
      },
      eq(key, value) {
        if (key === "id") rowId = value;
        return query;
      },
      delete() {
        return query;
      },
      update(value) {
        payload = value;
        return query;
      },
      then(resolve, reject) {
        if (payload) writes.push({ table, id: rowId, payload });
        return Promise.resolve({
          data:
            table === "library_cake_sizes"
              ? rows.map((r) => ({ id: r.id }))
              : [],
          error: null,
        }).then(resolve, reject);
      },
    };
    return query;
  },
});
const actions = compile(actionSource, (name) => {
  if (name === "next/cache") return { revalidatePath: noop };
  if (name === "next/navigation")
    return {
      redirect: () => {
        throw new Error("LOCAL_REDIRECT");
      },
    };
  if (name.endsWith("/auth/session"))
    return {
      requireStaff: async () => ({
        id: "local-owner",
        role: { code: "owner" },
      }),
    };
  if (name.endsWith("/navigation/access"))
    return { canManageLibrary: () => true };
  if (name.endsWith("/supabase/server")) return { createClient: actionClient };
  if (name.endsWith("/published-cake-cache"))
    return { revalidateStorefrontPublishedCakeCache: noop };
  if (name.endsWith("/cakes/queries"))
    return {
      getCakeById: async () => liveCake,
      listCakeCategories: async () => [],
      listCakeTags: async () => [],
    };
  return load(name);
});
function serverForm(db) {
  const d = form(db);
  d.set("name", "Unrelated cake name edit");
  d.set("status", "active");
  return d;
}
await test("15 full update Server Action preserves missing dates for unrelated cake edit", async () => {
  rows = bounded;
  writes = [];
  liveCake = { sizes: rows.map(mapSize), categories: [], tags: [] };
  const d = serverForm(rows);
  d.delete("size_available_from");
  d.delete("size_available_until");
  await assert.rejects(
    actions.updateCakeAction(cakeId, {}, d),
    /LOCAL_REDIRECT/,
  );
  const update = writes.find((w) => w.table === "library_cake_sizes");
  assert.equal(update.payload.available_from, "2026-11-01");
  assert.equal(update.payload.available_until, "2026-11-30");
  assert.equal(update.payload.price, 1);
  assert.equal(
    writes.find((w) => w.table === "library_cakes").payload.name,
    "Unrelated cake name edit",
  );
});
await test("16 full update Server Action validates changed date against omitted saved boundary", async () => {
  rows = bounded;
  writes = [];
  liveCake = { sizes: rows.map(mapSize), categories: [], tags: [] };
  const d = serverForm(rows);
  d.set("size_available_from", "2026-12-01");
  d.delete("size_available_until");
  const result = await actions.updateCakeAction(cakeId, {}, d);
  assert.match(result.error, /until.*earlier|until.*before/i);
  assert.equal(writes.length, 0);
});
console.log(
  `${count}/${count} focused editor lifecycle scenarios passed; mocked persistence only.`,
);
