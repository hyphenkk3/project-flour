import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  DATA_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
} from "../src/lib/supabase/fetch-timeout.ts";
import { retryStatementTimeoutRead } from "../src/workspaces/storefront/catalog/public-cake-read.ts";

const calls = new Map<string, number>();
const originalFetch = globalThis.fetch;
const keepAlive = setInterval(() => {}, 1_000);

globalThis.fetch = (async (input, init) => {
  const url = String(input);
  calls.set(url, (calls.get(url) ?? 0) + 1);
  if (url.endsWith("/success") || url.endsWith("/recovered")) {
    return new Response("ok", { status: 200 });
  }

  return new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const abort = () => reject(signal?.reason ?? new Error("aborted"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}) as typeof fetch;

try {
  const measured: Array<{
    request: string;
    duration_ms: number;
    underlying_fetches: number;
    outcome: string;
  }> = [];

  const successStarted = performance.now();
  const successResponse = await fetchWithTimeout(80)("https://synthetic.invalid/success");
  measured.push({
    request: "catalogue_success",
    duration_ms: Math.round(performance.now() - successStarted),
    underlying_fetches: calls.get("https://synthetic.invalid/success") ?? 0,
    outcome: `http_${successResponse.status}`,
  });
  assert.equal(successResponse.status, 200);
  assert.equal(measured[0]?.underlying_fetches, 1);

  const timeoutStarted = performance.now();
  await assert.rejects(
    fetchWithTimeout(80)("https://synthetic.invalid/timeout"),
    (error: unknown) => error instanceof Error && error.name === "TimeoutError",
  );
  const timeoutMs = Math.round(performance.now() - timeoutStarted);
  const timeoutCalls = calls.get("https://synthetic.invalid/timeout") ?? 0;
  measured.push({
    request: "catalogue_timeout",
    duration_ms: timeoutMs,
    underlying_fetches: timeoutCalls,
    outcome: "TimeoutError",
  });
  assert.ok(timeoutMs >= 50 && timeoutMs < 1_000, "timeout stays near its configured budget");
  assert.equal(timeoutCalls, 1, "an application timeout is not retried synchronously");
  assert.equal(DATA_FETCH_TIMEOUT_MS, 8_000, "production request timeout remains 8 seconds");

  const recoveredStarted = performance.now();
  const recoveredResponse = await fetchWithTimeout(80)("https://synthetic.invalid/recovered");
  measured.push({
    request: "catalogue_recovered_on_next_request",
    duration_ms: Math.round(performance.now() - recoveredStarted),
    underlying_fetches: calls.get("https://synthetic.invalid/recovered") ?? 0,
    outcome: `http_${recoveredResponse.status}`,
  });
  assert.equal(recoveredResponse.status, 200);
  assert.equal(measured[2]?.underlying_fetches, 1);

  let statementTimeoutCalls = 0;
  const statementRecovered = await retryStatementTimeoutRead(async () => {
    statementTimeoutCalls += 1;
    if (statementTimeoutCalls === 1) {
      throw new Error("canceling statement due to statement timeout");
    }
    return "recovered";
  });
  assert.equal(statementRecovered, "recovered");
  assert.equal(statementTimeoutCalls, 2, "the pre-existing PostgreSQL statement-timeout retry remains");

  console.log(JSON.stringify({
    production_timeout_ms: DATA_FETCH_TIMEOUT_MS,
    measurements: measured,
    postgres_statement_timeout_retry_calls: statementTimeoutCalls,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  clearInterval(keepAlive);
}
