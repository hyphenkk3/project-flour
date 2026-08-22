/**
 * Customer catalogue is resolved from pickup date, not Singapore today.
 * Run: npx tsx scripts/test-storefront-catalogue-by-pickup-date.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unpublishedCataloguePreorderMessage } from "@/workspaces/storefront/catalog/queries";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.equal(
  unpublishedCataloguePreorderMessage("2026-09-01"),
  "September 2026 catalogue is not yet available for preorder.",
);
assert.equal(
  unpublishedCataloguePreorderMessage("2027-02-03"),
  "February 2027 catalogue is not yet available for preorder.",
);

const migration = readSrc(
  "supabase/migrations/20260816200000_storefront_collection_for_pickup_date.sql",
);
assert.match(migration, /storefront_collection_for_pickup_date/);
assert.match(migration, /p_pickup_date date/);
assert.match(
  migration,
  /active_collection := public\.storefront_collection_for_pickup_date\(p_pickup_date\)/,
);
assert.match(
  migration,
  /No published catalogue is available for that pickup date/,
);
assert.doesNotMatch(migration, /order by c\.month desc/);
assert.doesNotMatch(migration, /p_collection_id/);
assert.match(migration, /size_row\.price/);
assert.match(migration, /'customer_website'/);
assert.match(migration, /timezone\('Asia\/Singapore', now\(\)\)::date \+ 1/);
assert.match(migration, /is_pickup_orders_closed\(p_pickup_date\)/);
assert.match(
  migration,
  /storefront_current_collection\(\)[\s\S]*storefront_collection_for_pickup_date/,
);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queriesSrc, /getStorefrontCollectionForPickupDate/);
assert.match(queriesSrc, /storefront_collection_for_pickup_date/);
assert.match(queriesSrc, /p_pickup_date/);

const checkoutSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
assert.match(checkoutSrc, /getStorefrontCollectionForPickupDate/);
assert.match(checkoutSrc, /loadCheckoutPickupOffer/);
assert.doesNotMatch(checkoutSrc, /getCurrentCollection/);
assert.doesNotMatch(checkoutSrc, /rpcArgs\.p_collection_id/);

const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(formSrc, /loadCheckoutPickupOffer/);
assert.match(formSrc, /unavailableMessage/);
assert.match(
  formSrc,
  /Some cakes are not available for this pickup date and were removed/,
);
assert.doesNotMatch(formSrc, /getCurrentCollection/);

const pageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
assert.doesNotMatch(pageSrc, /getCurrentCollection/);
assert.doesNotMatch(pageSrc, /notFound/);

const homeSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.doesNotMatch(homeSrc, /getStorefrontCollectionForPickupDate/);
assert.doesNotMatch(homeSrc, /submit_guest_preorder/);
assert.match(homeSrc, /href="\/order"/);

const ownerNew = readSrc("src/app/(app)/owner/orders/new/page.tsx");
assert.match(ownerNew, /listOfferableLibraryCakes/);
assert.match(
  ownerNew,
  /Cakes come from Master Library — not limited by/,
);

console.log("PASS storefront catalogue by pickup date (static)");
