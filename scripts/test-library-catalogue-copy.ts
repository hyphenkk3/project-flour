/**
 * Copy monthly catalogue merchandising membership.
 * Run: npx tsx scripts/test-library-catalogue-copy.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATALOGUE_COPIED_QUERY,
  COPY_FROM_EMPTY_LABEL,
  COPY_FROM_EXPLANATION,
  COPY_FROM_PREVIOUS_LABEL,
  catalogueCopySelectionError,
  catalogueInsertRow,
  copyCatalogueMembershipRows,
  duplicateMonthlyMonthMessage,
  findMonthlyCatalogueForMonth,
  monthlyCopySourceLabel,
  monthlyCopySources,
  parseCatalogueCopyFrom,
  parseCatalogueCopyFromValue,
  parseCatalogueCreateInput,
} from "@/workspaces/library/collections/catalogue";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

const emptyMonthly = parseCatalogueCreateInput(
  form({
    name: "October 2026",
    purpose: "monthly",
    month: "2026-10",
    status: "draft",
  }),
);
assert.deepEqual(emptyMonthly, {
  name: "October 2026",
  purpose: "monthly",
  status: "draft",
  month: "2026-10-01",
  startDate: null,
  endDate: null,
  websiteOverride: false,
});
assert.equal(
  parseCatalogueCopyFrom(form({ name: "October 2026" })).kind,
  "empty",
);
assert.deepEqual(
  typeof emptyMonthly === "string" ? null : catalogueInsertRow(emptyMonthly),
  {
    name: "October 2026",
    purpose: "monthly",
    status: "draft",
    month: "2026-10-01",
  },
);

const copyForm = form({
  name: "October 2026",
  purpose: "monthly",
  month: "2026-10",
  status: "active",
  copy_from: "11111111-1111-4111-8111-111111111111",
});
const copying = parseCatalogueCreateInput(copyForm);
assert.equal(typeof copying === "string" ? copying : copying.status, "active");
assert.deepEqual(parseCatalogueCopyFrom(copyForm), {
  kind: "id",
  id: "11111111-1111-4111-8111-111111111111",
});
assert.equal(
  catalogueCopySelectionError(
    typeof copying === "string" ? "monthly" : copying.purpose,
    parseCatalogueCopyFrom(copyForm),
  ),
  null,
);
assert.equal(
  typeof copying === "string" ? true : copying.websiteOverride,
  false,
);

assert.deepEqual(parseCatalogueCopyFromValue(""), { kind: "empty" });
assert.deepEqual(parseCatalogueCopyFromValue("not-a-uuid"), {
  kind: "invalid",
});
assert.equal(
  catalogueCopySelectionError("monthly", { kind: "invalid" }),
  "Choose a monthly catalogue to copy, or start empty.",
);
assert.equal(
  catalogueCopySelectionError("special", {
    kind: "id",
    id: "11111111-1111-4111-8111-111111111111",
  }),
  "Copy from previous catalogue is only for monthly catalogues.",
);

const sourceMembers = [
  { libraryCakeId: "cake-a", available: true, sortOrder: 0 },
  { libraryCakeId: "cake-b", available: true, sortOrder: 1 },
  { libraryCakeId: "cake-c", available: false, sortOrder: 2 },
  { libraryCakeId: "cake-a", available: false, sortOrder: 9 },
];
const copied = copyCatalogueMembershipRows(sourceMembers);
assert.deepEqual(copied, [
  { libraryCakeId: "cake-a", available: true, sortOrder: 0 },
  { libraryCakeId: "cake-b", available: true, sortOrder: 1 },
  { libraryCakeId: "cake-c", available: false, sortOrder: 2 },
]);
assert.equal(copied.length, 3);
assert.notEqual(copied[0], sourceMembers[0]);
copied[2] = { libraryCakeId: "cake-c", available: true, sortOrder: 2 };
assert.equal(sourceMembers[2]?.available, false);

const catalogues = [
  {
    id: "special-1",
    name: "Mid-Autumn",
    month: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    purpose: "special" as const,
  },
  {
    id: "sep",
    name: "September 2026",
    month: "2026-09-01",
    createdAt: "2026-08-10T00:00:00.000Z",
    purpose: "monthly" as const,
  },
  {
    id: "aug",
    name: "August 2026",
    month: "2026-08-01",
    createdAt: "2026-07-01T00:00:00.000Z",
    purpose: "monthly" as const,
  },
];
const sources = monthlyCopySources(catalogues);
assert.deepEqual(
  sources.map((source) => source.id),
  ["sep", "aug"],
);
assert.ok(!sources.some((source) => source.purpose === "special"));
assert.equal(
  monthlyCopySourceLabel({ name: "September 2026", month: "2026-09-01" }),
  "September 2026",
);

assert.equal(
  findMonthlyCatalogueForMonth("2026-08-01", catalogues)?.id,
  "aug",
);
assert.equal(findMonthlyCatalogueForMonth("2026-10-01", catalogues), null);
assert.match(
  duplicateMonthlyMonthMessage("2026-08-01"),
  /August 2026/,
);

const actionsSrc = readSrc("src/workspaces/library/collections/actions.ts");
assert.match(actionsSrc, /copyCatalogueMembershipRows/);
assert.match(actionsSrc, /library_cake_id: row\.library_cake_id/);
assert.match(actionsSrc, /available: row\.available/);
assert.match(actionsSrc, /sort_order: row\.sort_order/);
assert.match(actionsSrc, /source\.purpose !== "monthly"/);
assert.match(actionsSrc, /eq\("month", createInput\.month\)/);
assert.match(actionsSrc, /status: "draft"/);
assert.match(actionsSrc, /websiteOverride: false/);
assert.equal(COPY_FROM_PREVIOUS_LABEL, "Copy from previous catalogue");
assert.match(
  COPY_FROM_EXPLANATION,
  /Start with the cakes and ordering from an existing monthly catalogue/,
);
assert.equal(COPY_FROM_EMPTY_LABEL, "Start empty");
assert.equal(CATALOGUE_COPIED_QUERY, "copied");
assert.match(actionsSrc, /CATALOGUE_COPIED_QUERY/);
assert.match(actionsSrc, /\$\{CATALOGUE_COPIED_QUERY\}=1/);
assert.doesNotMatch(actionsSrc, /\.from\("library_cakes"\)\.insert/);
assert.doesNotMatch(actionsSrc, /\.from\("library_cake_sizes"\)/);
assert.doesNotMatch(actionsSrc, /\.from\("library_cake_photos"\)/);
assert.doesNotMatch(actionsSrc, /storefront_current_collection\(\)/);

const formSrc = readSrc("src/workspaces/library/collections/CatalogueForm.tsx");
assert.match(formSrc, /COPY_FROM_PREVIOUS_LABEL/);
assert.match(formSrc, /COPY_FROM_EXPLANATION/);
assert.match(formSrc, /COPY_FROM_EMPTY_LABEL/);
assert.match(formSrc, /purpose === "monthly"[\s\S]*name="copy_from"/);
assert.match(formSrc, /Copy catalogue/);

const directorySrc = readSrc(
  "src/workspaces/library/collections/CollectionsDirectory.tsx",
);
assert.match(directorySrc, /Copy catalogue/);
assert.match(directorySrc, /purpose === "monthly"/);
assert.match(directorySrc, /copyFrom=/);

const builderPageSrc = readSrc(
  "src/app/(app)/library/collections/[id]/page.tsx",
);
assert.match(builderPageSrc, /Catalogue copied/);
assert.match(builderPageSrc, /does not replace the[\s\S]*website catalogue/);

console.log("PASS library catalogue copy (static)");
