/**
 * Catalogue automatic expiry + Browse Menu history.
 * Run: npx tsx scripts/test-catalogue-expiry.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PAST_MENU_LABEL,
  catalogueHistoryPeriodLabel,
  catalogueValidThroughYmd,
  isCatalogueExpired,
  isCurrentlyCustomerOrderable,
  isCustomerPastMenuVisible,
  isEffectivelyArchived,
  orderableMonthlyCatalogues,
  sortCustomerCatalogueChoices,
} from "@/engines/menu/customer-browse";
import { isArchivedCatalogueStatus } from "@/workspaces/library/collections/catalogue";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const august = {
  purpose: "monthly" as const,
  status: "active",
  month: "2026-08-01",
  endDate: null,
};
const september = {
  purpose: "monthly" as const,
  status: "active",
  month: "2026-09-01",
  endDate: null,
};
const special = {
  purpose: "special" as const,
  status: "active",
  month: null,
  startDate: "2026-09-16",
  endDate: "2026-09-17",
  websiteOverride: true,
};

assert.equal(catalogueValidThroughYmd(august), "2026-08-31");
assert.equal(isCatalogueExpired(august, "2026-08-31"), false);
assert.equal(isCatalogueExpired(august, "2026-09-01"), true);
assert.equal(isCurrentlyCustomerOrderable(august, "2026-08-31"), true);
assert.equal(isCurrentlyCustomerOrderable(august, "2026-09-01"), false);
assert.equal(isEffectivelyArchived(august, "2026-08-31"), false);
assert.equal(isEffectivelyArchived(august, "2026-09-01"), true);

assert.equal(catalogueValidThroughYmd(september), "2026-09-30");
assert.equal(isCurrentlyCustomerOrderable(september, "2026-09-01"), true);
assert.equal(isCurrentlyCustomerOrderable(september, "2026-09-30"), true);
assert.equal(isCurrentlyCustomerOrderable(september, "2026-10-01"), false);

assert.equal(catalogueValidThroughYmd(special), "2026-09-17");
assert.equal(isCatalogueExpired(special, "2026-09-17"), false);
assert.equal(isCatalogueExpired(special, "2026-09-18"), true);
assert.equal(isCurrentlyCustomerOrderable(special, "2026-09-17"), true);
assert.equal(isCurrentlyCustomerOrderable(special, "2026-09-18"), false);
assert.equal(
  isCurrentlyCustomerOrderable(
    { ...special, websiteOverride: false },
    "2026-09-17",
  ),
  false,
  "special without website_override is not customer-orderable",
);
assert.equal(
  isCurrentlyCustomerOrderable(
    {
      purpose: "special",
      status: "active",
      endDate: "2026-09-17",
    },
    "2026-09-17",
  ),
  false,
  "special with omitted websiteOverride is not customer-orderable",
);
assert.equal(
  isCurrentlyCustomerOrderable(september, "2026-08-15"),
  true,
  "future monthly catalogues remain customer-orderable for discovery",
);
assert.equal(isEffectivelyArchived(special, "2026-09-17"), false);
assert.equal(isEffectivelyArchived(special, "2026-09-18"), true);

assert.equal(catalogueHistoryPeriodLabel(august), "August 2026");
assert.equal(catalogueHistoryPeriodLabel(special), "16–17 Sep 2026");
assert.equal(PAST_MENU_LABEL, "Past menu");

const draftExpired = { ...august, status: "draft" };
assert.equal(isEffectivelyArchived(draftExpired, "2026-09-01"), false);
assert.equal(isCurrentlyCustomerOrderable(draftExpired, "2026-09-01"), false);

const restoredExpired = { ...august, status: "draft" };
assert.equal(isCurrentlyCustomerOrderable(restoredExpired, "2026-09-01"), false);
assert.equal(isArchivedCatalogueStatus("draft"), false);

assert.equal(
  isCustomerPastMenuVisible({ ...august, showInPastMenu: false }, "2026-09-01"),
  false,
);
assert.equal(
  isCustomerPastMenuVisible({ ...august, showInPastMenu: true }, "2026-09-01"),
  true,
);
assert.equal(
  isCustomerPastMenuVisible({ ...august, showInPastMenu: true }, "2026-08-31"),
  false,
);
assert.equal(
  isCustomerPastMenuVisible({ ...special, showInPastMenu: false }, "2026-09-18"),
  false,
);
assert.equal(
  isCustomerPastMenuVisible({ ...special, showInPastMenu: true }, "2026-09-18"),
  true,
);
assert.equal(
  isCustomerPastMenuVisible({ ...special, showInPastMenu: true }, "2026-09-17"),
  false,
);
assert.equal(
  isCurrentlyCustomerOrderable(
    { ...august, showInPastMenu: true },
    "2026-09-01",
  ),
  false,
);
assert.equal(
  isCurrentlyCustomerOrderable(
    { ...special, showInPastMenu: true },
    "2026-09-18",
  ),
  false,
);
assert.equal(
  isCurrentlyCustomerOrderable(september, "2026-09-01"),
  true,
);
assert.equal(
  isCustomerPastMenuVisible(
    { ...september, showInPastMenu: true },
    "2026-09-01",
  ),
  false,
);

const rows = [
  { id: "aug", status: "active", purpose: "monthly", month: "2026-08-01" },
  { id: "sep", status: "active", purpose: "monthly", month: "2026-09-01" },
  { id: "jul", status: "active", purpose: "monthly", month: "2026-07-01" },
];
assert.deepEqual(
  orderableMonthlyCatalogues(rows, "2026-09").map((row) => row.id),
  ["sep"],
);
assert.deepEqual(
  orderableMonthlyCatalogues(rows, "2026-08").map((row) => row.id),
  ["aug", "sep"],
);

const orderChoices = sortCustomerCatalogueChoices([
  { id: "special", displayOrder: 0 },
  { id: "aug", displayOrder: 1 },
  { id: "sep", displayOrder: 2 },
]);
assert.deepEqual(
  orderChoices.map((row) => row.id),
  ["special", "aug", "sep"],
);
const afterArchive = sortCustomerCatalogueChoices(
  orderChoices.filter((row) => row.id !== "aug"),
);
assert.deepEqual(
  afterArchive.map((row) => row.id),
  ["special", "sep"],
);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queriesSrc, /isCurrentlyCustomerOrderable/);
assert.match(queriesSrc, /isCustomerPastMenuVisible/);
assert.match(queriesSrc, /listHistoricalCatalogues/);
const browsePublishedFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listBrowsePublishedCakes"),
  queriesSrc.indexOf("export async function getBrowsePublishedCakeById"),
);
assert.match(browsePublishedFn, /isCurrentlyCustomerOrderable/);
assert.match(browsePublishedFn, /website_override/);
assert.doesNotMatch(browsePublishedFn, /isCatalogueExpired/);
assert.match(queriesSrc, /show_in_past_menu/);
assert.match(queriesSrc, /eq\("status", "active"\)/);
assert.doesNotMatch(
  queriesSrc.slice(
    queriesSrc.indexOf("getStorefrontCollectionForPickupDate"),
    queriesSrc.indexOf("listAvailableCakes"),
  ),
  /show_in_past_menu/,
);
assert.doesNotMatch(queriesSrc, /cron|pg_cron|inngest/i);

const orderSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontOrderCollectionsPage.tsx",
);
assert.match(orderSrc, /listOrderableMonthlyCatalogues/);
assert.match(orderSrc, /listCustomerSpecialCatalogues/);
assert.doesNotMatch(orderSrc, /listHistoricalCatalogues/);
assert.doesNotMatch(orderSrc, /\/browse\/menu\//);

const browseSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
);
assert.match(browseSrc, /listHistoricalCatalogues/);
assert.match(browseSrc, /PAST_MENU_LABEL/);
assert.match(browseSrc, /\/browse\/menu\//);
assert.doesNotMatch(browseSrc, /Continue to preorder|\/order\/checkout/);

const pastSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontPastMenuPage.tsx",
);
assert.match(pastSrc, /getHistoricalCatalogueById/);
assert.match(pastSrc, /hideOrderCta/);
assert.match(pastSrc, /PAST_MENU_LABEL/);
assert.doesNotMatch(pastSrc, /\/order\/checkout/);
assert.doesNotMatch(pastSrc, /Continue to preorder/);
assert.match(pastSrc, /redirect\(`\/order\/collection\/\$\{collectionId\}`\)/);

const cakeCardSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeCard.tsx",
);
assert.match(cakeCardSrc, /hideOrderCta/);

const listSrc = readSrc("src/app/(app)/library/collections/page.tsx");
assert.match(listSrc, /isEffectivelyArchived/);
assert.match(listSrc, /isCatalogueExpired/);
assert.match(listSrc, /view=archived/);

const directorySrc = readSrc(
  "src/workspaces/library/collections/CollectionsDirectory.tsx",
);
assert.match(directorySrc, /PAST_MENU_LABEL/);
assert.match(directorySrc, /isPastMenu/);
assert.match(directorySrc, /showInPastMenu/);

const actionsSrc = readSrc("src/workspaces/library/collections/actions.ts");
assert.match(actionsSrc, /isEffectivelyArchived/);
assert.match(
  actionsSrc.slice(
    actionsSrc.indexOf("reorderCataloguesAction"),
    actionsSrc.indexOf("updateCatalogueDetailsAction"),
  ),
  /isEffectivelyArchived/,
);
assert.match(
  actionsSrc.slice(actionsSrc.indexOf("restoreCatalogueAction")),
  /isCatalogueExpired/,
);
assert.match(actionsSrc, /update\(\{ status: "draft" \}\)/);
assert.doesNotMatch(actionsSrc, /status: "active".*expired|expired.*status: "active"/);
assert.match(actionsSrc, /setCatalogueShowInPastMenuAction/);
assert.match(actionsSrc, /update\(\{ show_in_past_menu: showInPastMenu \}\)/);
assert.doesNotMatch(
  actionsSrc.slice(
    actionsSrc.indexOf("setCatalogueShowInPastMenuAction"),
    actionsSrc.indexOf("archiveCatalogueAction"),
  ),
  /status: "active"|status: "archived"/,
);

const panelSrc = readSrc(
  "src/workspaces/library/collections/CataloguePastMenuVisibilityPanel.tsx",
);
assert.match(panelSrc, /SHOW_IN_PAST_MENU_LABEL/);
assert.match(panelSrc, /setCatalogueShowInPastMenuAction/);

const detailSrc = readSrc("src/app/(app)/library/collections/[id]/page.tsx");
assert.match(detailSrc, /CataloguePastMenuVisibilityPanel/);

const editSrc = readSrc("src/app/(app)/library/collections/[id]/edit/page.tsx");
assert.match(editSrc, /CataloguePastMenuVisibilityPanel/);

const migrationSrc = readSrc(
  "supabase/migrations/20260818170000_catalogue_show_in_past_menu.sql",
);
assert.match(migrationSrc, /show_in_past_menu boolean not null default false/);
assert.doesNotMatch(
  migrationSrc.split("\n").filter((line) => !line.startsWith("--")).join("\n"),
  /\bstatus\b|\bdisplay_order\b|\bwebsite_override\b/,
);

const libraryQueriesSrc = readSrc(
  "src/workspaces/library/collections/queries.ts",
);
assert.match(libraryQueriesSrc, /showInPastMenu: row\.show_in_past_menu === true/);

console.log("PASS catalogue expiry + browse history");
