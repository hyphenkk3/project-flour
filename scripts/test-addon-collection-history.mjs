import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignmentsToPreserve, classifyAddonCollection, getAddonCollectionBusinessRange, getKuchingBusinessDate, partitionAddonCollections, requestedCollectionsAreEditable } from "../src/workspaces/library/addons/collection-dates.mjs";
const root = new URL("../", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");

assert.equal(getKuchingBusinessDate(new Date("2026-11-02T15:59:59.000Z")), "2026-11-02");
assert.equal(getKuchingBusinessDate(new Date("2026-11-02T16:00:00.000Z")), "2026-11-03");

const monthly = (id, month, extra = {}) => ({ id, name: id, status: "active", purpose: "monthly", month, startDate: null, endDate: null, ...extra });
const special = (id, startDate, endDate, extra = {}) => ({ id, name: id, status: "draft", purpose: "special", month: null, startDate, endDate, ...extra });

// Monthly catalogues use the authoritative first-of-month month date; nullable
// start_date/end_date columns are not the monthly schedule.
const september = monthly("september-2026", "2026-09-01");
assert.deepEqual(classifyAddonCollection(september, "2026-11-01"), {
  state: "historical", startDate: "2026-09-01", endDate: "2026-09-30", reason: null,
});
assert.deepEqual(getAddonCollectionBusinessRange(september), { startDate: "2026-09-01", endDate: "2026-09-30" });
assert.equal(classifyAddonCollection(monthly("october-2026", "2026-10-01"), "2026-10-31").state, "editable");
assert.equal(classifyAddonCollection(monthly("october-2026", "2026-10-01"), "2026-11-01").state, "historical");
assert.equal(classifyAddonCollection(monthly("november-2026", "2026-11-01"), "2026-11-01").state, "editable");
assert.equal(classifyAddonCollection(monthly("november-2026", "2026-11-01"), "2026-11-30").state, "editable");
assert.equal(classifyAddonCollection(monthly("november-2026", "2026-11-01"), "2026-12-01").state, "historical");
assert.equal(classifyAddonCollection(monthly("february-2028", "2028-02-01"), "2028-02-29").state, "editable");
assert.deepEqual(getAddonCollectionBusinessRange(monthly("february-2028", "2028-02-01")), { startDate: "2028-02-01", endDate: "2028-02-29" });

// Special occasion ranges are also inclusive and must have two valid dates.
assert.equal(classifyAddonCollection(special("special-today", "2026-11-01", "2026-11-03"), "2026-11-03").state, "editable");
assert.equal(classifyAddonCollection(special("special-ended", "2026-10-01", "2026-10-31"), "2026-11-01").state, "historical");

const ambiguous = [
  monthly("missing-month", null),
  monthly("invalid-month", "2026-13-01"),
  { ...monthly("unknown-purpose", null), purpose: "seasonal" },
  special("missing-special-range", null, null),
  special("reversed-special-range", "2026-11-20", "2026-11-01"),
];
for (const collection of ambiguous) {
  assert.equal(classifyAddonCollection(collection, "2026-11-03").state, "ambiguous", collection.id);
}
assert.equal(classifyAddonCollection(monthly("invalid-business-date", "2026-11-01"), "not-a-date").state, "ambiguous");

const collections = [
  september,
  monthly("november-2026", "2026-11-01"),
  ...ambiguous,
];
const partition = partitionAddonCollections(collections, "2026-11-03");
assert.deepEqual(partition.historical.map((item) => item.id), ["september-2026"]);
assert.deepEqual(partition.editable.map((item) => item.id), ["november-2026"]);
assert.deepEqual(partition.ambiguous.map((item) => item.id), ambiguous.map((item) => item.id));

const byId = new Map(collections.map((item) => [item.id, item]));
assert.equal(requestedCollectionsAreEditable(["november-2026"], byId, "2026-11-03"), true);
assert.equal(requestedCollectionsAreEditable(["september-2026"], byId, "2026-11-03"), false);
assert.equal(requestedCollectionsAreEditable(["missing-month"], byId, "2026-11-03"), false);
assert.equal(requestedCollectionsAreEditable(["not-present"], byId, "2026-11-03"), false);

// The updater preserves historical and ambiguous records exactly, including
// any extra stored fields, while allowing the submitted current row to change.
const savedRows = [
  { collection_id: "september-2026", is_available: true, old_setting: "keep-september" },
  { collection_id: "missing-month", is_available: false, old_setting: "keep-ambiguous" },
  { collection_id: "november-2026", is_available: true, old_setting: "replace-current" },
];
const unchanged = assignmentsToPreserve(savedRows, new Set(["november-2026"]), byId, "2026-11-03");
assert.deepEqual(unchanged, [savedRows[0], savedRows[1]]);
assert.equal(unchanged[0].old_setting, "keep-september");
assert.equal(unchanged[1].old_setting, "keep-ambiguous");

const manager = source("src/workspaces/library/addons/AddonCatalogueManager.tsx");
assert.equal((manager.match(/<details/g) || []).length >= 3, true, "Create, item and historical sections use native keyboard-accessible details");
assert.equal(manager.includes('open={'), false, "accordions are collapsed by default");
assert.equal(manager.includes("Past collection settings"), true);
assert.equal(manager.includes("Collection schedule needs review"), true);
assert.equal(manager.includes("Current and upcoming collections"), true);

const action = source("src/workspaces/library/addons/actions.ts");
assert.equal(action.includes("requestedCollectionsAreEditable"), true, "server rejects historical, ambiguous and unknown submitted collection IDs");
assert.equal(action.includes("assignmentsToPreserve"), true, "server preserves historical and ambiguous assignment rows");
assert.equal(action.includes("getKuchingBusinessDate"), true, "server rechecks the Kuching business date at save time");
const query = source("src/workspaces/library/addons/queries.ts");
assert.equal(query.includes("purpose, month, start_date, end_date"), true, "classification loads purpose/month and special range");
const dateModel = source("supabase/migrations/20260816170000_catalogue_special_dates.sql");
assert.match(dateModel, /comment on column public\.collections\.month is[\s\S]*First day of the Singapore calendar month for monthly catalogues/i);
assert.match(dateModel, /purpose = 'monthly'[\s\S]*month is not null[\s\S]*month = date_trunc\('month', month\)::date[\s\S]*start_date is null[\s\S]*end_date is null/);
console.log("PASS: monthly month-date scheduling (September historical), Kuching and inclusive month-end boundaries, special windows, ambiguous fail-closed behavior, server-side eligibility guard, and exact historical/ambiguous assignment preservation.");
