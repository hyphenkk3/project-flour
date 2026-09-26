/**
 * DEV-only date-confirmation timing collector.
 * Run: npx tsx scripts/test-checkout-date-confirmation-perf.ts
 */
process.env.NODE_ENV = "development";

import assert from "node:assert/strict";
import {
  recordCheckoutDateDbCall,
  recordCheckoutDateStage,
  runWithCheckoutDatePerf,
  sanitizeVercelIdRegions,
  snapshotCheckoutDateConfirmationPerf,
  supabaseFetchLabel,
} from "@/lib/perf/checkout-date-confirmation-perf";

assert.equal(sanitizeVercelIdRegions(null), null);
assert.equal(sanitizeVercelIdRegions("iad1::iad1::abcdef0123456789"), "iad1::iad1");
assert.equal(sanitizeVercelIdRegions("sin1::abc"), "sin1");
assert.equal(
  supabaseFetchLabel(
    "https://example.supabase.co/rest/v1/collections?select=id",
  ),
  "collections",
);
assert.equal(
  supabaseFetchLabel(
    "https://example.supabase.co/rest/v1/rpc/storefront_collection_for_pickup_date",
  ),
  "rpc/storefront_collection_for_pickup_date",
);
assert.equal(
  supabaseFetchLabel("https://example.supabase.co/auth/v1/user"),
  "auth/user",
);

assert.equal(snapshotCheckoutDateConfirmationPerf(10), undefined);

const perf = runWithCheckoutDatePerf(() => {
  recordCheckoutDateStage("promise_all", 400);
  recordCheckoutDateStage("calendar", 380);
  recordCheckoutDateStage("hours", 210);
  recordCheckoutDateDbCall("operating_hours_weekly", 180);
  recordCheckoutDateDbCall("operating_hours_date_overrides", 190);
  recordCheckoutDateDbCall("rpc/list_closed_pickup_order_dates", 90);
  return snapshotCheckoutDateConfirmationPerf(450);
});

assert.ok(perf);
assert.equal(perf.date_confirmation_total_ms, 450);
assert.equal(perf.promise_all_ms, 400);
assert.equal(perf.calendar_ms, 380);
assert.equal(perf.hours_ms, 210);
assert.equal(perf.db_rpc_sum_ms, 460);
assert.equal(perf.db_rpc_count, 3);
assert.equal(perf.db_rpc_max_ms, 190);
assert.equal(perf.db_overlap_ms, 10);
assert.equal(perf.outside_db_ms, 0);
assert.equal(perf.unexplained_ms, 0);
assert.equal(perf.auth_ms, 0);
assert.equal(perf.capacity_ms, 0);
assert.equal(perf.voucher_ms, 0);
assert.equal(perf.runtime, "nodejs");
assert.equal(perf.middleware_auth, "skipped_public_path");

const gapped = runWithCheckoutDatePerf(() => {
  recordCheckoutDateDbCall("collections", 120);
  return snapshotCheckoutDateConfirmationPerf(2700);
});
assert.ok(gapped);
assert.equal(gapped.outside_db_ms, 2580);
assert.equal(gapped.unexplained_ms, 2580);
assert.equal(gapped.db_overlap_ms, 0);

console.log("PASS checkout date confirmation perf collector");
