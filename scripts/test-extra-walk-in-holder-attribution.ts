import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hydrateWalkInHolderNames,
  uniqueWalkInHolderIds,
} from "../src/workspaces/extra/walk-in-holder-names.ts";

const rows = [
  { id: "stock-a", walkInHeldBy: "staff-b", walkInHeldByName: null },
  { id: "stock-b", walkInHeldBy: "staff-b", walkInHeldByName: "legacy" },
  { id: "stock-c", walkInHeldBy: "staff-c", walkInHeldByName: "staff" },
  { id: "stock-d", walkInHeldBy: null, walkInHeldByName: null },
];

assert.deepEqual(uniqueWalkInHolderIds(rows), ["staff-b", "staff-c"]);

let requestedIds: string[] = [];
const resolved = await hydrateWalkInHolderNames(rows, async (ids) => {
  requestedIds = ids;
  return new Map([
    ["staff-b", "Baker B"],
    ["staff-c", "Baker C"],
    ["unrelated-staff", "Must not be exposed"],
  ]);
});
assert.deepEqual(requestedIds, ["staff-b", "staff-c"]);
assert.deepEqual(
  resolved.map(({ id, walkInHeldByName }) => [id, walkInHeldByName]),
  [
    ["stock-a", "Baker B"],
    ["stock-b", "Baker B"],
    ["stock-c", "Baker C"],
    ["stock-d", null],
  ],
);
assert.equal(rows[0].walkInHeldByName, null, "input rows remain unchanged");

const fallbackRows = [
  {
    id: "inactive",
    walkInHeldBy: "inactive-staff",
    walkInHeldByName: "Stale name",
  },
  {
    id: "archived",
    walkInHeldBy: "archived-staff",
    walkInHeldByName: "Former name",
  },
  {
    id: "missing",
    walkInHeldBy: "deleted-staff",
    walkInHeldByName: "Cached name",
  },
  {
    id: "inaccessible",
    walkInHeldBy: "inaccessible-staff",
    walkInHeldByName: "Embedded name",
  },
  { id: "unheld", walkInHeldBy: null, walkInHeldByName: null },
];
const safeFallbacks = await hydrateWalkInHolderNames(
  fallbackRows,
  async (ids) => {
    assert.deepEqual(ids, [
      "inactive-staff",
      "archived-staff",
      "deleted-staff",
      "inaccessible-staff",
    ]);
    // The production query returns no rows for inactive/archived/deleted or
    // inaccessible profiles. A result for an unrelated profile is ignored.
    return new Map([["unrelated-staff", "Must not be exposed"]]);
  },
);
assert.deepEqual(
  safeFallbacks.map(({ id, walkInHeldByName }) => [id, walkInHeldByName]),
  [
    ["inactive", "Staff member"],
    ["archived", "Staff member"],
    ["missing", "Staff member"],
    ["inaccessible", "Staff member"],
    ["unheld", null],
  ],
);

const activeHolder = await hydrateWalkInHolderNames(
  [
    {
      id: "active",
      walkInHeldBy: "active-staff",
      walkInHeldByName: "Stale name",
    },
  ],
  async (ids) => {
    assert.deepEqual(ids, ["active-staff"]);
    return new Map([["active-staff", "Current active name"]]);
  },
);
assert.equal(activeHolder[0].walkInHeldByName, "Current active name");

let emptyLookupCalled = false;
const withoutHolders = await hydrateWalkInHolderNames(
  [{ id: "stock-empty", walkInHeldBy: null, walkInHeldByName: null }],
  async () => {
    emptyLookupCalled = true;
    return new Map();
  },
);
assert.equal(emptyLookupCalled, false);
assert.equal(withoutHolders[0].walkInHeldByName, null);

const failedLookup = await hydrateWalkInHolderNames(rows, async () => {
  throw new Error("simulated lookup failure");
});
assert.deepEqual(
  failedLookup.map(({ id, walkInHeldByName }) => [id, walkInHeldByName]),
  [
    ["stock-a", "Staff member"],
    ["stock-b", "Staff member"],
    ["stock-c", "Staff member"],
    ["stock-d", null],
  ],
  "lookup failure must not preserve potentially stale embedded names",
);

const querySource = readFileSync(
  resolve("src/workspaces/extra/queries.ts"),
  "utf8",
);
const storefrontSource = readFileSync(
  resolve("src/workspaces/storefront/extra/queries.ts"),
  "utf8",
);
assert.match(querySource, /createServiceClient\(\)/);
assert.match(
  querySource,
  /\.from\("staff_profiles"\)[\s\S]*?\.select\("id, display_name"\)[\s\S]*?\.in\("id", batch\)[\s\S]*?\.eq\("is_active", true\)[\s\S]*?\.is\("archived_at", null\)/,
);
assert.match(querySource, /return withWalkInHolderNames\(assignedUnits\)/);
assert.match(
  querySource,
  /return withWalkInHolderNames\([\s\S]*attachTodayOrderability/,
);
assert.doesNotMatch(
  storefrontSource,
  /walk_in_held_by|walkInHeldByName|createServiceClient/,
);

console.log("Extra Walk-in Hold holder attribution checks passed.");
