/**
 * Catalogue monthly vs special-occasion date model.
 * Run: npx tsx scripts/test-library-catalogue-dates.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toBusinessDateKey, businessYearMonth } from "@/lib/dates";
import {
  CATALOGUE_MONTH_OPTION_COUNT,
  catalogueDateLine,
  catalogueDisplayTitle,
  catalogueInsertRow,
  catalogueMonthOptions,
  formatCatalogueCalendarDate,
  formatCatalogueDateRange,
  isStorefrontEligiblePurpose,
  parseCatalogueCreateInput,
  parseCatalogueMonthDate,
} from "@/workspaces/library/collections/catalogue";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

assert.equal(formatCatalogueCalendarDate("2026-09-16"), "16 Sep 2026");
assert.doesNotMatch(formatCatalogueCalendarDate("2026-09-16"), /Sept/);
assert.equal(
  formatCatalogueDateRange("2026-09-16", "2026-09-17"),
  "16 Sep 2026 → 17 Sep 2026",
);
assert.equal(formatCatalogueCalendarDate("2026-12-20"), "20 Dec 2026");
assert.doesNotMatch(
  formatCatalogueCalendarDate("2026-12-20"),
  /\d{4}-\d{2}-\d{2}/,
);
assert.equal(
  formatCatalogueDateRange("2026-12-20", "2026-12-25"),
  "20 Dec 2026 → 25 Dec 2026",
);
assert.equal(
  formatCatalogueDateRange("2027-02-14", "2027-02-14"),
  "14 Feb 2027",
);

const monthly = parseCatalogueCreateInput(
  form({
    name: "September 2026",
    purpose: "monthly",
    month: "2026-09",
    status: "draft",
  }),
);
assert.deepEqual(monthly, {
  name: "September 2026",
  purpose: "monthly",
  status: "draft",
  month: "2026-09-01",
  startDate: null,
  endDate: null,
  websiteOverride: false,
});
assert.equal(typeof monthly === "string" ? "" : monthly.month, "2026-09-01");
assert.deepEqual(
  typeof monthly === "string" ? null : catalogueInsertRow(monthly),
  {
    name: "September 2026",
    purpose: "monthly",
    status: "draft",
    month: "2026-09-01",
  },
);
assert.equal(
  catalogueDateLine({
    name: "September 2026",
    purpose: "monthly",
    month: "2026-09-01",
    startDate: null,
    endDate: null,
  }),
  "Month: September 2026",
);
assert.equal(
  catalogueDisplayTitle({
    name: "September 2026",
    purpose: "monthly",
    month: "2026-09-01",
    startDate: null,
    endDate: null,
  }),
  "September 2026",
);

const christmas = parseCatalogueCreateInput(
  form({
    name: "Christmas 2026",
    purpose: "special",
    start_date: "2026-12-20",
    end_date: "2026-12-25",
    status: "draft",
  }),
);
assert.deepEqual(christmas, {
  name: "Christmas 2026",
  purpose: "special",
  status: "draft",
  month: null,
  startDate: "2026-12-20",
  endDate: "2026-12-25",
  websiteOverride: false,
});
assert.deepEqual(
  typeof christmas === "string" ? null : catalogueInsertRow(christmas),
  {
    name: "Christmas 2026",
    purpose: "special",
    status: "draft",
    month: null,
    start_date: "2026-12-20",
    end_date: "2026-12-25",
    website_override: false,
  },
);

const oneDay = parseCatalogueCreateInput(
  form({
    name: "Valentine's Day 2027",
    purpose: "special",
    start_date: "2027-02-14",
    end_date: "2027-02-14",
    status: "draft",
  }),
);
assert.deepEqual(oneDay, {
  name: "Valentine's Day 2027",
  purpose: "special",
  status: "draft",
  month: null,
  startDate: "2027-02-14",
  endDate: "2027-02-14",
  websiteOverride: false,
});

assert.equal(
  parseCatalogueCreateInput(
    form({
      name: "Christmas 2026",
      purpose: "special",
      end_date: "2026-12-25",
      status: "draft",
    }),
  ),
  "Start date is required.",
);
assert.equal(
  parseCatalogueCreateInput(
    form({
      name: "Christmas 2026",
      purpose: "special",
      start_date: "2026-12-20",
      status: "draft",
    }),
  ),
  "End date is required.",
);
assert.equal(
  parseCatalogueCreateInput(
    form({
      name: "Christmas 2026",
      purpose: "special",
      start_date: "2026-12-25",
      end_date: "2026-12-20",
      status: "draft",
    }),
  ),
  "End date must not be before start date.",
);

assert.equal(isStorefrontEligiblePurpose("monthly"), true);
assert.equal(isStorefrontEligiblePurpose("special"), false);

const fromAugust = catalogueMonthOptions("2026-08-16");
assert.equal(fromAugust[0]?.value, "2026-08");
assert.equal(fromAugust[0]?.label, "August 2026");
assert.equal(fromAugust.length, CATALOGUE_MONTH_OPTION_COUNT);
assert.ok(fromAugust.some((option) => option.value === "2026-09"));
assert.ok(fromAugust.some((option) => option.value === "2027-08"));
assert.equal(
  fromAugust.some((option) => option.value === "2026-07"),
  false,
);
assert.equal(
  fromAugust.some((option) => option.value === "2025-01"),
  false,
);
assert.equal(parseCatalogueMonthDate(fromAugust[0]?.value ?? ""), "2026-08-01");

const fromFebruary = catalogueMonthOptions("2027-02-03");
assert.equal(fromFebruary[0]?.value, "2027-02");
assert.equal(fromFebruary[0]?.label, "February 2027");
assert.ok(fromFebruary.some((option) => option.value === "2027-03"));
assert.equal(
  fromFebruary.some((option) => option.value === "2027-01"),
  false,
);
assert.equal(
  fromFebruary.some((option) => option.value === "2026-08"),
  false,
);

const singaporeNow = toBusinessDateKey();
const liveOptions = catalogueMonthOptions();
assert.equal(liveOptions[0]?.value, businessYearMonth(singaporeNow));
assert.equal(
  liveOptions.some((option) => option.value < (businessYearMonth(singaporeNow) ?? "")),
  false,
);

const catalogueSrc = readFileSync(
  resolve("src/workspaces/library/collections/catalogue.ts"),
  "utf8",
);
assert.match(catalogueSrc, /toBusinessDateKey/);
assert.match(catalogueSrc, /formatBusinessCalendarDate/);
assert.doesNotMatch(catalogueSrc, /DateTimeFormat/);
assert.doesNotMatch(catalogueSrc, /year = 2025; year <= 2028/);

const rpc = readFileSync(
  resolve("supabase/migrations/20260816170000_catalogue_special_dates.sql"),
  "utf8",
);
assert.match(rpc, /c\.purpose = 'monthly'/);
assert.doesNotMatch(rpc, /c\.purpose = 'special'/);
assert.match(rpc, /c\.month = month_start/);
assert.doesNotMatch(rpc, /and c\.start_date/);
assert.doesNotMatch(rpc, /and c\.end_date/);

console.log("library catalogue date tests passed");
