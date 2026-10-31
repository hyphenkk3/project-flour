import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { resolveCakeSizePriceOn } from "@/engines/orders/cake-size-price";
import {
  createRequestScopedPriceContext,
  resolveRequestScopedPrice,
} from "@/engines/menu/request-scoped-price";

const calls: Array<[string, string]> = [];
const fixturePrice = async (sizeId: string, date: string) => {
  calls.push([sizeId, date]);
  await Promise.resolve();
  return `${sizeId}:${date}`.length;
};

const baselineDuplicateResults = await Promise.all([
  fixturePrice("size-a", "2026-10-31"),
  fixturePrice("size-a", "2026-10-31"),
]);
assert.deepEqual(baselineDuplicateResults, [
  baselineDuplicateResults[0],
  baselineDuplicateResults[0],
]);
assert.equal(
  calls.length,
  2,
  "unmodified per-caller lookup invokes both duplicate loaders",
);
calls.length = 0;

const context = createRequestScopedPriceContext();
const duplicate = await Promise.all([
  resolveRequestScopedPrice(context, "size-a", "2026-10-31", () =>
    fixturePrice("size-a", "2026-10-31"),
  ),
  resolveRequestScopedPrice(context, "size-a", "2026-10-31", () =>
    fixturePrice("size-a", "2026-10-31"),
  ),
]);
assert.deepEqual(duplicate, [duplicate[0], duplicate[0]]);
assert.equal(calls.length, 1, "duplicate size/date shares one RPC loader");
assert.deepEqual(
  duplicate,
  baselineDuplicateResults,
  "candidate price output matches baseline",
);

await Promise.all([
  resolveRequestScopedPrice(context, "size-a", "2026-11-01", () =>
    fixturePrice("size-a", "2026-11-01"),
  ),
  resolveRequestScopedPrice(context, "size-b", "2026-10-31", () =>
    fixturePrice("size-b", "2026-10-31"),
  ),
]);
assert.equal(
  calls.length,
  3,
  "different dates and size IDs remain independent",
);

const secondRequest = createRequestScopedPriceContext();
await resolveRequestScopedPrice(secondRequest, "size-a", "2026-10-31", () =>
  fixturePrice("size-a", "2026-10-31"),
);
assert.equal(
  calls.length,
  4,
  "separate request context does not reuse a result",
);

const failedContext = createRequestScopedPriceContext();
const failure = new Error("price lookup failed");
const rejected = await Promise.allSettled([
  resolveRequestScopedPrice(failedContext, "size-f", "2026-10-31", async () => {
    throw failure;
  }),
  resolveRequestScopedPrice(
    failedContext,
    "size-f",
    "2026-10-31",
    async () => 1,
  ),
]);
assert.ok(rejected.every((result) => result.status === "rejected"));
assert.ok(
  rejected.every(
    (result) => result.status === "rejected" && result.reason === failure,
  ),
);
assert.equal(
  await resolveRequestScopedPrice(
    failedContext,
    "size-f",
    "2026-10-31",
    async () => 78,
  ),
  78,
  "failed promise is removed and can recover on a later lookup",
);

const scheduleFixture = {
  basePrice: 78,
  schedules: [
    { price: 88, effectiveFrom: "2026-11-01", effectiveTo: "2026-11-03" },
    { price: 92, effectiveFrom: "2026-11-04", effectiveTo: null },
  ],
};
for (const [date, expected] of [
  ["2026-10-31", 78],
  ["2026-11-01", 88],
  ["2026-11-03", 88],
  ["2026-11-04", 92],
  ["2026-11-05", 92],
] as const) {
  const baseline = resolveCakeSizePriceOn({
    ...scheduleFixture,
    pickupDate: date,
  });
  const scoped = await resolveRequestScopedPrice(
    createRequestScopedPriceContext(),
    "scheduled-size",
    date,
    async () => baseline,
  );
  assert.equal(baseline, expected, `schedule fixture is valid at ${date}`);
  assert.equal(scoped, baseline, `dedup retains resolver price at ${date}`);
}
assert.throws(
  () =>
    resolveCakeSizePriceOn({
      basePrice: 78,
      schedules: [
        { price: 88, effectiveFrom: "2026-11-01", effectiveTo: "2026-11-04" },
        { price: 92, effectiveFrom: "2026-11-04", effectiveTo: null },
      ],
      pickupDate: "2026-11-04",
    }),
  /Multiple scheduled prices cover/,
  "overlapping schedules continue to fail",
);

const homeSource = readFileSync(
  resolvePath(
    process.cwd(),
    "src/workspaces/storefront/home/StorefrontHomePage.tsx",
  ),
  "utf8",
);
const querySource = readFileSync(
  resolvePath(process.cwd(), "src/workspaces/storefront/catalog/queries.ts"),
  "utf8",
);
const checkoutSource = readFileSync(
  resolvePath(process.cwd(), "src/workspaces/storefront/checkout/actions.ts"),
  "utf8",
);
const pricingMigration = readFileSync(
  resolvePath(
    process.cwd(),
    "supabase/migrations/20260922120000_library_cake_size_prices.sql",
  ),
  "utf8",
);
const resilientSource = readFileSync(
  resolvePath(
    process.cwd(),
    "scripts/test-storefront-catalogue-resilience.mjs",
  ),
  "utf8",
);
assert.match(
  homeSource,
  /const requestPriceContext = createRequestScopedPriceContext\(\)/,
);
assert.match(
  homeSource,
  /listHomepagePopularCakes\(todayYmd, requestPriceContext\)/,
);
assert.match(homeSource, /candidate\.id,\s*todayYmd,\s*requestPriceContext/s);
assert.match(querySource, /const STOREFRONT_PRICE_LOOKUP_CONCURRENCY = 6/);
assert.match(querySource, /library_cake_size_price_on/);
assert.match(checkoutSource, /library_cake_size_price_on/);
assert.match(checkoutSource, /submit_guest_preorder/);
assert.match(
  pricingMigration,
  /library_cake_size_price_on\(size_row\.id, p_pickup_date\)/,
);
assert.match(resilientSource, /Retry/);

console.log("PASS request-scoped price deduplication correctness checks");
