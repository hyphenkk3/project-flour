/**
 * Special catalogue website override parsing, overlap, and storefront SQL.
 * Run: npx tsx scripts/test-library-catalogue-website-override.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  WEBSITE_OVERRIDE_EXPLANATION,
  catalogueDateRangesOverlap,
  catalogueInsertRow,
  findOverlappingWebsiteOverride,
  formatCatalogueDateRange,
  isPublishedSpecialWebsiteOverride,
  isStorefrontEligiblePurpose,
  parseCatalogueCreateInput,
  websiteOverrideConflictMessage,
} from "@/workspaces/library/collections/catalogue";
import { formatCollectionAvailabilityLabel } from "@/workspaces/storefront/catalog/pricing";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

assert.match(
  WEBSITE_OVERRIDE_EXPLANATION,
  /temporarily replaces the monthly website catalogue/,
);

const specialDefault = parseCatalogueCreateInput(
  form({
    name: "Mid-Autumn",
    purpose: "special",
    start_date: "2026-09-16",
    end_date: "2026-09-17",
    status: "draft",
  }),
);
assert.deepEqual(specialDefault, {
  name: "Mid-Autumn",
  purpose: "special",
  status: "draft",
  month: null,
  startDate: "2026-09-16",
  endDate: "2026-09-17",
  websiteOverride: false,
});
assert.deepEqual(
  typeof specialDefault === "string"
    ? null
    : catalogueInsertRow(specialDefault),
  {
    name: "Mid-Autumn",
    purpose: "special",
    status: "draft",
    month: null,
    start_date: "2026-09-16",
    end_date: "2026-09-17",
    website_override: false,
  },
);

const specialPublished = parseCatalogueCreateInput(
  form({
    name: "Mid-Autumn",
    purpose: "special",
    start_date: "2026-09-16",
    end_date: "2026-09-17",
    status: "active",
    website_override: "true",
  }),
);
assert.deepEqual(specialPublished, {
  name: "Mid-Autumn",
  purpose: "special",
  status: "active",
  month: null,
  startDate: "2026-09-16",
  endDate: "2026-09-17",
  websiteOverride: true,
});

const monthlyTampered = parseCatalogueCreateInput(
  form({
    name: "September 2026",
    purpose: "monthly",
    month: "2026-09",
    status: "draft",
    website_override: "true",
  }),
);
assert.equal(typeof monthlyTampered === "string", false);
if (typeof monthlyTampered !== "string") {
  assert.equal(monthlyTampered.websiteOverride, false);
  assert.equal(
    "website_override" in catalogueInsertRow(monthlyTampered),
    false,
  );
}

assert.equal(isStorefrontEligiblePurpose("monthly"), true);
assert.equal(isStorefrontEligiblePurpose("special"), false);
assert.equal(
  isPublishedSpecialWebsiteOverride({
    purpose: "special",
    websiteOverride: false,
  }),
  false,
);
assert.equal(
  isPublishedSpecialWebsiteOverride({
    purpose: "special",
    websiteOverride: true,
  }),
  true,
);
assert.equal(
  isPublishedSpecialWebsiteOverride({
    purpose: "monthly",
    websiteOverride: true,
  }),
  false,
);

assert.equal(
  catalogueDateRangesOverlap(
    "2026-09-16",
    "2026-09-17",
    "2026-09-01",
    "2026-09-30",
  ),
  true,
);
assert.equal(
  catalogueDateRangesOverlap(
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
  ),
  false,
);
assert.equal(
  catalogueDateRangesOverlap(
    "2026-09-17",
    "2026-09-17",
    "2026-09-17",
    "2026-09-17",
  ),
  true,
);

const published = [
  {
    id: "a",
    name: "Mid-Autumn",
    startDate: "2026-09-16",
    endDate: "2026-09-17",
  },
];
const overlapping = findOverlappingWebsiteOverride(
  { startDate: "2026-09-15", endDate: "2026-09-16" },
  published,
);
assert.equal(overlapping?.name, "Mid-Autumn");
assert.equal(
  websiteOverrideConflictMessage(overlapping!),
  `Cannot publish as a website override: the date range overlaps “Mid-Autumn” (${formatCatalogueDateRange("2026-09-16", "2026-09-17")}). Turn that override off first.`,
);

const nonOverlapping = findOverlappingWebsiteOverride(
  { startDate: "2026-09-18", endDate: "2026-09-19" },
  published,
);
assert.equal(nonOverlapping, null);

const self = findOverlappingWebsiteOverride(
  { startDate: "2026-09-16", endDate: "2026-09-17", excludeId: "a" },
  published,
);
assert.equal(self, null);

assert.equal(
  formatCollectionAvailabilityLabel({
    id: "1",
    name: "August 2026",
    month: "2026-08-01",
  }),
  "August 2026 Collection",
);
assert.equal(
  formatCollectionAvailabilityLabel({
    id: "2",
    name: "Mid-Autumn",
    month: null,
  }),
  "Mid-Autumn",
);

const sql = readFileSync(
  resolve("supabase/migrations/20260816180000_catalogue_website_override.sql"),
  "utf8",
);
assert.match(sql, /website_override boolean not null default false/);
assert.match(sql, /website_override = false/);
assert.match(sql, /c\.website_override = true/);
assert.match(sql, /c\.purpose = 'special'/);
assert.match(sql, /c\.purpose = 'monthly'/);
assert.match(sql, /timezone\('Asia\/Singapore', now\(\)\)::date/);
assert.match(sql, /storefront_collection_for_date/);
assert.match(sql, /target_date >= c\.start_date/);
assert.match(sql, /target_date <= c\.end_date/);
assert.match(sql, /collections_website_override_no_overlap/);

const formSrc = readFileSync(
  resolve("src/workspaces/library/collections/CatalogueForm.tsx"),
  "utf8",
);
assert.match(formSrc, /purpose === "special"/);
assert.match(formSrc, /Publish as website override during these dates/);
assert.match(formSrc, /WEBSITE_OVERRIDE_EXPLANATION/);

const detailSrc = readFileSync(
  resolve("src/app/(app)/library/collections/[id]/page.tsx"),
  "utf8",
);
assert.match(detailSrc, /CatalogueWebsiteOverridePanel/);
assert.match(detailSrc, /Website Override/);

console.log("library catalogue website override tests passed");
