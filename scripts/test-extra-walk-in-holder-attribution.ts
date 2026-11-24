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
assert.deepEqual(failedLookup, rows, "lookup failure preserves safe fallback");

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
  /\.from\("staff_profiles"\)[\s\S]*?\.select\("id, display_name"\)[\s\S]*?\.in\("id", batch\)/,
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
