#!/usr/bin/env node
// Bounded public-API A/B probe for the October 22 collection query refactor.
// Uses only the DEV anon/publishable key; emits metadata, timings and hashes,
// never catalogue names, image URLs, prices, API keys or response bodies.
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

const DEV_HOST = "tzwtpxdcggesgjaqxkqr.supabase.co";
const base = new URL(process.env.SUPABASE_URL ?? "");
const apiKey = process.env.SUPABASE_ANON_KEY ?? "";
if (base.protocol !== "https:" || base.hostname !== DEV_HOST) {
  throw new Error("STOP: SUPABASE_URL must be the verified DEV project URL.");
}
if (!apiKey || /service[_-]?role|sb_secret/i.test(apiKey)) {
  throw new Error("STOP: provide only the DEV anon or publishable public key.");
}

const REST = new URL("/rest/v1/", base);
const timeoutMs = 8_000;
const sequentialPairs = 10;
const concurrentPerArchitecture = 3;
const collectionCakeProjection = [
  "id", "name", "description", "category_id", "status", "sharing_guide", "allergens",
  "library_cake_categories!library_cakes_category_id_fkey(id,name,is_active,sort_order)",
  "library_cake_tag_assignments!cake_id(tag_id,sort_order,library_cake_tags!tag_id(id,name,is_active,sort_order))",
  "library_cake_sizes(id,cake_id,label,price,sort_order,preorder_days,available_from,available_until)",
  "library_cake_photos(id,image_url,alt_text,sort_order,cake_size_id,is_default)",
].join(",");
const actualRefactorCakeProjection = [
  "id", "name", "description", "category_id", "status", "sharing_guide", "allergens",
  "library_cake_categories!library_cakes_category_id_fkey(id,name,is_active,sort_order)",
  "library_cake_category_assignments!cake_id(category_id,sort_order,library_cake_categories!category_id(id,name,is_active,sort_order))",
  "library_cake_tag_assignments!cake_id(tag_id,sort_order,library_cake_tags!tag_id(id,name,is_active,sort_order))",
  "library_cake_sizes(id,cake_id,label,price,sort_order,preorder_days,available_from,available_until)",
  "library_cake_photos(id,image_url,alt_text,sort_order,cake_size_id,is_default)",
].join(",");

const encode = (params) => new URLSearchParams(params).toString();
const timedGet = async (path) => {
  const started = performance.now();
  const response = await fetch(new URL(path, REST), {
    method: "GET",
    headers: { apikey: apiKey, accept: "application/json", "cache-control": "no-cache", pragma: "no-cache" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { body = null; }
  const durationMs = performance.now() - started;
  return {
    status: response.status,
    durationMs,
    bytes: bytes.byteLength,
    code: !response.ok && body && typeof body === "object" ? String(body.code ?? "") : "",
    data: response.ok ? body : null,
  };
};

const availableHomepageMemberships = async () => {
  const query = encode({ select: "collection_id", available: "eq.true", show_on_homepage: "eq.true" });
  const result = await timedGet(`collection_cakes?${query}`);
  if (result.status !== 200 || !Array.isArray(result.data)) {
    throw new Error(`DEV-only dataset discovery failed (HTTP ${result.status}, code ${result.code || "none"}).`);
  }
  const counts = new Map();
  for (const row of result.data) counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1);
  const candidate = [...counts.entries()].filter(([, count]) => count === 5 || count === 6).sort((a, b) => a[0].localeCompare(b[0]))[0];
  if (!candidate) throw new Error("No public DEV homepage collection has exactly 5 or 6 visible memberships.");
  return { collectionId: candidate[0], count: candidate[1], discoveryRequest: { durationMs: result.durationMs, bytes: result.bytes } };
};

const membershipPath = (collectionId) => `collection_cakes?${encode({
  select: "library_cake_id,homepage_sort_order",
  collection_id: `eq.${collectionId}`,
  available: "eq.true",
  show_on_homepage: "eq.true",
  order: "homepage_sort_order.asc",
})}`;

// A: exact pre-refactor homepage collection relation query.
const runA = async (collectionId) => {
  const select = `homepage_sort_order,library_cakes(${collectionCakeProjection})`;
  const request = await timedGet(`collection_cakes?${encode({
    select,
    collection_id: `eq.${collectionId}`,
    available: "eq.true",
    show_on_homepage: "eq.true",
    order: "homepage_sort_order.asc",
  })}`);
  return { label: "A", requests: [request], result: request.data };
};

// B: exact post-refactor homepage flow: membership IDs, then cached reader's
// root library_cakes select. Direct API measurement bypasses Next.js cache;
// these are the two underlying REST requests on a cache miss.
const runB = async (collectionId) => {
  const first = await timedGet(membershipPath(collectionId));
  if (first.status !== 200 || !Array.isArray(first.data)) return { label: "B", requests: [first], result: null };
  const memberships = first.data;
  const ids = [...new Set(memberships.map((row) => row.library_cake_id).filter(Boolean))].sort();
  if (ids.length === 0) return { label: "B", requests: [first], result: { memberships, cakes: [] } };
  const second = await timedGet(`library_cakes?${encode({ select: actualRefactorCakeProjection, id: `in.(${ids.join(",")})` })}`);
  return { label: "B", requests: [first, second], result: second.data ? { memberships, cakes: second.data } : null };
};

const cakeOf = (row) => {
  const relation = row?.library_cakes;
  return Array.isArray(relation) ? relation[0] ?? null : relation ?? null;
};
const sharedProjection = (cake) => {
  if (!cake) return null;
  const { library_cake_category_assignments: _extra, ...shared } = cake;
  return shared;
};
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
// Preserve collection-level order, while treating related embed arrays as
// unordered here because the app mapper applies its own explicit sort.
const digest = (value) => createHash("sha256").update(JSON.stringify(value.map((row) => ({ order: row.order, cake: stable(row.cake) })))).digest("hex");
const comparable = (run) => {
  if (run.label === "A") {
    return (run.result ?? []).map((row) => ({ order: row.homepage_sort_order, cake: sharedProjection(cakeOf(row)) }));
  }
  if (!run.result) return null;
  const byId = new Map((run.result.cakes ?? []).map((cake) => [cake.id, cake]));
  return run.result.memberships.map((row) => ({ order: row.homepage_sort_order, cake: sharedProjection(byId.get(row.library_cake_id) ?? null) }));
};

const summarizeSamples = (samples) => {
  const sorted = samples.map((sample) => sample.totalMs).sort((a, b) => a - b);
  const percentile = (p) => sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null;
  const requestDurations = samples.flatMap((sample) => sample.requests.map((request) => request.durationMs));
  const bytesBySample = samples.map((sample) => sample.requests.reduce((sum, request) => sum + request.bytes, 0)).sort((a, b) => a - b);
  return {
    n: samples.length,
    totalLatencyMs: { median: percentile(0.5), p95NearestRank: percentile(0.95), max: sorted.at(-1) ?? null },
    requestsPerSample: samples.map((sample) => sample.requests.length),
    subrequestLatencyMs: { median: requestDurations.length ? [...requestDurations].sort((a,b)=>a-b)[Math.floor((requestDurations.length-1)/2)] : null, max: requestDurations.length ? Math.max(...requestDurations) : null },
    responseBytesPerSample: { median: percentileFrom(bytesBySample, 0.5), p95NearestRank: percentileFrom(bytesBySample, 0.95), max: bytesBySample.at(-1) ?? null },
    httpFailures: samples.reduce((sum, sample) => sum + sample.requests.filter((request) => request.status < 200 || request.status >= 300).length, 0),
    timeoutFailures: samples.reduce((sum, sample) => sum + sample.requests.filter((request) => request.status === 0 || request.code === "57014" || request.code === "57000").length, 0),
  };
};

function percentileFrom(sorted, p) {
  return sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null;
}

const { collectionId, count, discoveryRequest } = await availableHomepageMemberships();
const samples = { A: [], B: [] };
let correctness = null;
for (let i = 0; i < sequentialPairs; i++) {
  const order = i % 2 === 0 ? ["A", "B"] : ["B", "A"];
  for (const label of order) {
    const started = performance.now();
    let run;
    try { run = label === "A" ? await runA(collectionId) : await runB(collectionId); }
    catch (error) { run = { label, requests: [{ status: 0, durationMs: performance.now() - started, bytes: 0, code: error?.name === "TimeoutError" ? "TIMEOUT" : "FETCH_ERROR" }], result: null }; }
    const sample = { totalMs: performance.now() - started, requests: run.requests, result: run.result };
    samples[label].push(sample);
  }
  if (i === 0 && samples.A[0]?.result && samples.B[0]?.result) {
    const A = { label: "A", result: samples.A[0].result };
    const B = { label: "B", result: samples.B[0].result };
    const aValue = comparable(A);
    const bValue = comparable(B);
    correctness = { sharedProjectionMatches: digest(aValue) === digest(bValue), aHash: digest(aValue), bHash: digest(bValue), aVisibleRows: aValue.length, bVisibleRows: bValue.length };
  }
}

const concurrent = {};
for (const label of ["A", "B"]) {
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: concurrentPerArchitecture }, async () => {
    try { return label === "A" ? await runA(collectionId) : await runB(collectionId); }
    catch (error) { return { label, requests: [{ status: 0, durationMs: 0, bytes: 0, code: error?.name === "TimeoutError" ? "TIMEOUT" : "FETCH_ERROR" }], result: null }; }
  }));
  concurrent[label] = {
    concurrentRequests: concurrentPerArchitecture,
    aggregateElapsedMs: performance.now() - started,
    underlyingRestRequests: results.reduce((sum, run) => sum + run.requests.length, 0),
    failedRestRequests: results.flatMap((run) => run.requests).filter((request) => request.status < 200 || request.status >= 300).length,
    totalResponseBytes: results.flatMap((run) => run.requests).reduce((sum, request) => sum + request.bytes, 0),
  };
}

console.log(JSON.stringify({
  experiment: "catalogue-query-ab-20261029",
  projectHost: base.hostname,
  authMode: "public apikey only; no Authorization user token; anonymous RLS",
  selectedCollectionSize: count,
  setupRequest: { count: 1, durationMs: discoveryRequest.durationMs, responseBytes: discoveryRequest.bytes, excludedFromAandB: true },
  sequentialOrder: "counterbalanced; 10 pairs; A then B / B then A alternating",
  requestTimeoutMs: timeoutMs,
  firstRequestAfterStart: "observed only; not a database-cold-cache guarantee",
  requestLatencyAndBytes: { A: summarizeSamples(samples.A), B: summarizeSamples(samples.B) },
  concurrent: { A: concurrent.A, B: concurrent.B },
  sharedProjectionCorrectness: correctness,
  importantLimits: ["Direct REST probe does not exercise Next.js unstable_cache or Vercel runtime.", "Browser-to-API elapsed time does not separate network, PostgREST and SQL time.", "It does not provide a PostgreSQL plan or prove Prod timeout resolution."],
}, null, 2));
