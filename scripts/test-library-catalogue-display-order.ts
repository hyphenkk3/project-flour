/**
 * Catalogue card display order is independent of month, special dates, and
 * cake membership sort_order.
 * Run: npx tsx scripts/test-library-catalogue-display-order.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sortCustomerCatalogueChoices } from "@/engines/menu/customer-browse";
import {
  compareCataloguesForLegacyDisplayOrder,
  displayOrdersFromIds,
  initialCatalogueDisplayOrders,
  nextCatalogueDisplayOrder,
  reorderCatalogueIds,
  sortByCatalogueDisplayOrder,
} from "@/workspaces/library/collections/catalogue";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const august = {
  id: "aug",
  month: "2026-08-01",
  startDate: null,
  createdAt: "2026-07-01T00:00:00Z",
  isCurrentStorefront: true,
};
const september = {
  id: "sep",
  month: "2026-09-01",
  startDate: null,
  createdAt: "2026-07-15T00:00:00Z",
  isCurrentStorefront: false,
};
const special = {
  id: "special",
  month: null,
  startDate: "2026-09-16",
  createdAt: "2026-08-01T00:00:00Z",
  isCurrentStorefront: false,
};

const seeded = initialCatalogueDisplayOrders([special, september, august]);
assert.deepEqual(
  seeded.map((row) => row.id),
  ["aug", "sep", "special"],
  "1. existing catalogues receive deterministic positions matching current Library order",
);
assert.deepEqual(
  seeded.map((row) => row.displayOrder),
  [0, 1, 2],
);

assert.ok(
  compareCataloguesForLegacyDisplayOrder(august, september) < 0,
  "current website catalogue stays first in the seed",
);

const reordered = reorderCatalogueIds(
  ["aug", "sep", "special"],
  "special",
  0,
);
assert.deepEqual(reordered, ["special", "aug", "sep"]);
assert.deepEqual(displayOrdersFromIds(reordered), [
  { id: "special", displayOrder: 0 },
  { id: "aug", displayOrder: 1 },
  { id: "sep", displayOrder: 2 },
]);
assert.equal(nextCatalogueDisplayOrder([0, 1, 2]), 3);

const snapshots = [
  {
    id: "aug",
    month: "2026-08-01",
    startDate: null,
    status: "active",
    cakes: ["chocolate"],
    displayOrder: 1,
  },
  {
    id: "special",
    month: null,
    startDate: "2026-09-16",
    status: "active",
    cakes: ["mooncake"],
    displayOrder: 0,
  },
];
const sorted = sortByCatalogueDisplayOrder(snapshots);
assert.deepEqual(
  sorted.map((row) => row.id),
  ["special", "aug"],
  "8. Special Menu can appear before August",
);
assert.deepEqual(
  sorted.map((row) => row.month),
  [null, "2026-08-01"],
  "4. catalogue dates remain unchanged",
);
assert.deepEqual(
  sorted.map((row) => row.status),
  ["active", "active"],
  "6. published state remains unchanged",
);
assert.deepEqual(
  sorted.map((row) => row.cakes),
  [["mooncake"], ["chocolate"]],
  "5. catalogue contents remain unchanged",
);
assert.deepEqual(
  ["aug", "sep", "special"].sort(),
  ["aug", "sep", "special"],
  "3. catalogue ids remain unchanged",
);

const customerChoices = sortCustomerCatalogueChoices([
  { id: "aug", displayOrder: 1, label: "August 2026 Collection" },
  { id: "sep", displayOrder: 2, label: "September 2026 Collection" },
  { id: "special", displayOrder: 0, label: "Special Menu" },
]);
assert.deepEqual(
  customerChoices.map((row) => row.label),
  [
    "Special Menu",
    "August 2026 Collection",
    "September 2026 Collection",
  ],
  "7. customer /order follows persisted display order",
);
assert.deepEqual(
  sortByCatalogueDisplayOrder([
    { id: "sep", displayOrder: 1 },
    { id: "aug", displayOrder: 0 },
  ]).map((row) => row.id),
  ["aug", "sep"],
  "9. August can appear before September",
);

const migrationSrc = readSrc(
  "supabase/migrations/20260818160000_catalogue_display_order.sql",
);
assert.match(migrationSrc, /add column if not exists display_order integer/);
assert.match(migrationSrc, /storefront_current_collection/);
assert.match(migrationSrc, /c\.display_order is null/);
assert.doesNotMatch(migrationSrc, /update public\.collections[\s\S]*set month/);
assert.doesNotMatch(migrationSrc, /update public\.collection_cakes/);

const actionsSrc = readSrc("src/workspaces/library/collections/actions.ts");
assert.match(actionsSrc, /reorderCataloguesAction/);
assert.match(actionsSrc, /update\(\{ display_order: update\.displayOrder \}\)/);
assert.match(actionsSrc, /revalidatePath\("\/order"\)/);
const writeStart = actionsSrc.indexOf(
  "async function writeCatalogueDisplayOrder",
);
const reorderStart = actionsSrc.indexOf(
  "export async function reorderCataloguesAction",
);
const writeFn = actionsSrc.slice(writeStart, reorderStart);
assert.match(writeFn, /update\(\{ display_order: update\.displayOrder \}\)/);
assert.doesNotMatch(writeFn, /collection_cakes/);
assert.doesNotMatch(writeFn, /\.update\(\{[^}]*month/);
assert.doesNotMatch(writeFn, /\.update\(\{[^}]*status/);

const directorySrc = readSrc(
  "src/workspaces/library/collections/CollectionsDirectory.tsx",
);
assert.match(directorySrc, /draggable/);
assert.match(directorySrc, /Drag to reorder/);
assert.match(directorySrc, /reorderCataloguesAction/);
assert.match(directorySrc, /data-drop-indicator/);

const pageSrc = readSrc("src/app/(app)/library/collections/page.tsx");
assert.match(pageSrc, /sortByCatalogueDisplayOrder/);
assert.match(pageSrc, /displayOrder/);

const orderSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontOrderCollectionsPage.tsx",
);
assert.match(orderSrc, /sortCustomerCatalogueChoices/);
assert.match(orderSrc, /displayOrder/);
assert.match(orderSrc, /kind === "special"/);
assert.match(orderSrc, /\/order\/collection\/\$\{choice\.id\}/);

const collectionPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionPageSrc, /catalogueMonthPickupBounds/);
assert.match(collectionPageSrc, /from=2026-08-01|bounds\.from|from=\{/);
assert.doesNotMatch(collectionPageSrc, /display_order/);

const checkoutPageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
assert.match(checkoutPageSrc, /fromQuery/);
assert.match(checkoutPageSrc, /toQuery/);
assert.match(checkoutPageSrc, /clampCustomerPickupWindow/);

console.log("PASS library catalogue display order");
