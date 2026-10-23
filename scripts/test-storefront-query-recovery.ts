/**
 * Guard the public catalogue's bounded-query and retry/error-boundary contract.
 * This static test does not call Supabase or mutate storefront data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const queries = readSrc("src/workspaces/storefront/catalog/queries.ts");
assert.match(queries, /library_cake_size_prices_on/);
assert.match(queries, /data\.length !== sizes\.length/);
assert.match(queries, /The current cake prices could not be verified/);
assert.match(queries, /loadCakePhotosByIds/);
assert.match(queries, /loadCakeCategoryAssignmentsByIds/);
assert.match(queries, /loadCakeTagAssignmentsByIds/);
assert.match(queries, /await Promise\.all\(\[/);
assert.match(queries, /\.select\("library_cake_id, sort_order"\)/);
assert.match(queries, /\.select\("library_cake_id, homepage_sort_order"\)/);
assert.match(queries, /readCachedStorefrontCakesByIds/);
assert.match(queries, /withEffectiveStorefrontPrices\(cakes, todayYmd\)/);
assert.doesNotMatch(
  queries,
  /async function loadHomepageCollectionPreviewCakes[\s\S]*?catch\s*\{\s*return \[\]/,
);
assert.doesNotMatch(
  queries,
  /async function loadHomepagePopularCakes[\s\S]*?catch\s*\{\s*return \[\]/,
);

const boundaries = [
  "src/app/error.tsx",
  "src/app/browse/error.tsx",
  "src/app/order/collection/[id]/error.tsx",
  "src/app/cakes/[id]/error.tsx",
];
for (const path of boundaries) {
  const source = readSrc(path);
  assert.match(source, /"use client"/);
  assert.match(source, /StorefrontRouteError/);
  assert.match(source, /unstable_retry/);
}

const errorUi = readSrc("src/workspaces/storefront/StorefrontRouteError.tsx");
assert.match(errorUi, /role="alert"/);
assert.match(errorUi, /aria-live="polite"/);
assert.match(errorUi, /onClick=\{unstable_retry\}/);
assert.match(errorUi, /Try again/);
assert.match(errorUi, /temporarily unavailable/);

console.log("PASS storefront bounded-query and retry boundaries");
