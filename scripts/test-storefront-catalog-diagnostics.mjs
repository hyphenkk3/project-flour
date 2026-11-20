import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "src/workspaces/storefront/catalog/queries.ts",
  "utf8",
);
const loggerStart = source.indexOf("function logCatalogueDiagnostic(");
const loggerEnd = source.indexOf("\nasync function catalogueRequestId(", loggerStart);
assert(loggerStart >= 0 && loggerEnd > loggerStart, "Bounded catalogue logger must exist.");
const logger = source.slice(loggerStart, loggerEnd);

assert.match(
  source,
  /process\.env\.VERCEL_ENV === "preview" &&\s*process\.env\.FLOUR_CATALOG_DIAGNOSTICS === "1"/,
  "Diagnostics must require both Preview runtime and the branch-scoped opt-in.",
);
assert.match(source, /headers\(\).*x-vercel-id/s, "Request correlation must use the Vercel request ID.");
assert.match(logger, /durationMs:/, "Logger must record elapsed time.");
assert.match(logger, /cakeCount:/, "Logger must record only the cake count.");
assert.match(logger, /errorCategory:/, "Logger must record a bounded error category.");
assert.match(logger, /timeout:/, "Logger must identify timeout outcomes.");
assert.match(logger, /activeCacheFills:/, "Logger must expose bounded cache-fill concurrency.");
assert.match(logger, /console\.info\("\[CATALOG_READ_DIAGNOSTIC\]"/);
assert.doesNotMatch(
  logger,
  /cakeIds|\bids\b|customer|session|payload|message:/i,
  "Diagnostic payload must not contain cake IDs, customer/session data, or raw payloads.",
);
assert.doesNotMatch(logger, /console\.(error|warn)\(/, "Diagnostics must not inflate error-level logs.");

for (const operation of [
  "list_available_cakes",
  "list_homepage_collection_preview_cakes",
  "list_storefront_cakes_by_ids",
  "get_available_cake_by_id",
  "get_browse_cake_display_by_id",
  "get_browse_published_cake_by_id",
]) {
  assert(source.includes(operation), `Expected read path instrumentation: ${operation}`);
}

const cacheStart = source.indexOf("const readCachedStorefrontCakesByIds");
const cacheEnd = source.indexOf("export async function listAvailableCakes", cacheStart);
assert(cacheStart >= 0 && cacheEnd > cacheStart);
assert.doesNotMatch(
  source.slice(cacheStart, cacheEnd),
  /headers\(/,
  "Request headers must not be read inside the Next.js cache scope.",
);

console.log("Storefront catalogue diagnostics contract: PASS");
