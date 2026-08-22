/**
 * Catalogue edit, archive, and restore.
 * Run: npx tsx scripts/test-library-catalogue-lifecycle.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATALOGUE_ARCHIVE_CONFIRMATION,
  CATALOGUE_ARCHIVED_QUERY,
  CATALOGUE_RESTORED_QUERY,
  CATALOGUE_UPDATED_QUERY,
  catalogueArchiveBlockedMessage,
  isArchivedCatalogueStatus,
  parseCatalogueDetailsInput,
  sortByCatalogueDisplayOrder,
} from "@/workspaces/library/collections/catalogue";
import { sortCustomerCatalogueChoices } from "@/engines/menu/customer-browse";

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

assert.equal(parseCatalogueDetailsInput(form({ name: "  " })), "Name is required.");
assert.deepEqual(parseCatalogueDetailsInput(form({ name: " Mid-Autumn Special " })), {
  name: "Mid-Autumn Special",
});

assert.equal(
  catalogueArchiveBlockedMessage("active"),
  "Unpublish this catalogue before archiving. Active catalogues stay available to customers until unpublished.",
);
assert.equal(catalogueArchiveBlockedMessage("draft"), null);
assert.equal(isArchivedCatalogueStatus("archived"), true);
assert.equal(isArchivedCatalogueStatus("draft"), false);

const before = [
  { id: "special", displayOrder: 0, status: "active" },
  { id: "aug", displayOrder: 1, status: "archived" },
  { id: "sep", displayOrder: 2, status: "active" },
];
const activeOnly = sortByCatalogueDisplayOrder(
  before.filter((row) => row.status !== "archived"),
);
assert.deepEqual(
  activeOnly.map((row) => row.id),
  ["special", "sep"],
);
const restored = sortByCatalogueDisplayOrder([
  ...activeOnly,
  { id: "aug", displayOrder: 1, status: "draft" },
]);
assert.deepEqual(
  restored.map((row) => row.id),
  ["special", "aug", "sep"],
);

const customer = sortCustomerCatalogueChoices(
  before
    .filter((row) => row.status === "active")
    .map((row) => ({ id: row.id, displayOrder: row.displayOrder })),
);
assert.deepEqual(
  customer.map((row) => row.id),
  ["special", "sep"],
);

const actionsSrc = readSrc("src/workspaces/library/collections/actions.ts");
assert.match(actionsSrc, /updateCatalogueDetailsAction/);
assert.match(actionsSrc, /update\(\{ name: parsed\.name \}\)/);
assert.doesNotMatch(
  actionsSrc.slice(
    actionsSrc.indexOf("updateCatalogueDetailsAction"),
    actionsSrc.indexOf("archiveCatalogueAction"),
  ),
  /purpose|start_date|end_date|website_override|collection_cakes/,
);
assert.match(actionsSrc, /archiveCatalogueAction/);
assert.match(actionsSrc, /update\(\{ status: "archived" \}\)/);
assert.match(actionsSrc, /eq\("status", "draft"\)/);
assert.match(actionsSrc, /restoreCatalogueAction/);
assert.match(actionsSrc, /update\(\{ status: "draft" \}\)/);
assert.match(actionsSrc, /eq\("status", archived \? "archived" : "active"\)/);
assert.match(actionsSrc, /Restore this catalogue before changing its cakes/);
assert.match(
  actionsSrc.slice(
    actionsSrc.indexOf("reorderCataloguesAction"),
    actionsSrc.indexOf("function mutationError"),
  ),
  /isEffectivelyArchived/,
);

const pageSrc = readSrc("src/app/(app)/library/collections/[id]/page.tsx");
assert.match(pageSrc, /CatalogueEditForm|\/edit/);
assert.match(pageSrc, /CatalogueArchiveButton/);
assert.match(pageSrc, /CatalogueRestoreButton/);
assert.match(pageSrc, /CATALOGUE_UPDATED_QUERY/);
assert.match(pageSrc, /status !== "archived"/);

const listSrc = readSrc("src/app/(app)/library/collections/page.tsx");
assert.match(listSrc, /view=archived/);
assert.match(listSrc, /isEffectivelyArchived/);

const directorySrc = readSrc(
  "src/workspaces/library/collections/CollectionsDirectory.tsx",
);
assert.match(directorySrc, /variant === "archived"/);
assert.match(directorySrc, /CatalogueRestoreButton/);
assert.match(directorySrc, /CatalogueArchiveButton/);

const editFormSrc = readSrc(
  "src/workspaces/library/collections/CatalogueEditForm.tsx",
);
assert.match(editFormSrc, /updateCatalogueDetailsAction/);
assert.match(editFormSrc, /name="name"/);
assert.doesNotMatch(editFormSrc, /name="purpose"/);
assert.doesNotMatch(editFormSrc, /name="month"/);
assert.doesNotMatch(editFormSrc, /website_override/);

assert.match(actionsSrc, /setCatalogueShowInPastMenuAction/);
assert.match(pageSrc, /CataloguePastMenuVisibilityPanel/);

const archiveBtnSrc = readSrc(
  "src/workspaces/library/collections/CatalogueArchiveButton.tsx",
);
assert.match(archiveBtnSrc, /ConfirmDialog/);
assert.match(archiveBtnSrc, /CATALOGUE_ARCHIVE_CONFIRMATION/);
assert.match(archiveBtnSrc, /Cancel/);
assert.match(archiveBtnSrc, /Archive catalogue/);

const storefrontSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(storefrontSrc, /eq\("status", "active"\)/);
assert.doesNotMatch(storefrontSrc, /status === "archived"/);

const orderSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontOrderCollectionsPage.tsx",
);
assert.match(orderSrc, /sortCustomerCatalogueChoices/);
assert.match(orderSrc, /catalogueMonthPickupBounds|orderCollectionPickupCopy/);

const collectionPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionPageSrc, /catalogueMonthPickupBounds/);

assert.equal(CATALOGUE_UPDATED_QUERY, "updated");
assert.equal(CATALOGUE_ARCHIVED_QUERY, "archived");
assert.equal(CATALOGUE_RESTORED_QUERY, "restored");

console.log("PASS library catalogue lifecycle (edit/archive/restore)");
