#!/usr/bin/env node
// Read-only, bounded DEV comparison: current two-request collection flow (A)
// versus one complete PostgREST collection/cake embed (B). Emits only status,
// timing, size, counts, normalized difference paths and hashes. Never outputs
// keys, records, identifiers, prices, URLs or response bodies.
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const DEV_HOST = "tzwtpxdcggesgjaqxkqr.supabase.co";
const DEV_REF = "tzwtpxdcggesgjaqxkqr";
const base = new URL(process.env.SUPABASE_URL ?? "");
const apiKey = process.env.SUPABASE_ANON_KEY ?? "";
if (base.protocol !== "https:" || base.hostname !== DEV_HOST || base.pathname !== "/") {
  throw new Error("STOP: SUPABASE_URL must be the exact HTTPS DEV project URL.");
}
if (!apiKey || /service[_-]?role|sb_secret/i.test(apiKey)) {
  throw new Error("STOP: provide only the DEV public anon/publishable key.");
}
const jwtParts = apiKey.split(".");
if (jwtParts.length === 3) {
  let role = "";
  try { role = JSON.parse(Buffer.from(jwtParts[1], "base64url").toString("utf8")).role ?? ""; }
  catch { throw new Error("STOP: could not validate the JWT role; use the DEV public anon key."); }
  if (role !== "anon") throw new Error("STOP: JWT key is not an anon key.");
}

const REST = new URL("/rest/v1/", base);
const timeoutMs = 8_000;
const parityPairs = 3;
const sequentialPairs = 30;
const concurrentFlows = 3;
const maxRequests = 1 /* discovery */ + parityPairs * 3 + 2 /* empty */ + 3 /* eligibility */
  + 3 /* optional plans */ + sequentialPairs * 3 + concurrentFlows * 3;
const rootProjection = [
  "id", "name", "description", "category_id", "status", "sharing_guide", "allergens",
  "library_cake_categories!library_cakes_category_id_fkey(id,name,is_active,sort_order)",
  "library_cake_category_assignments!cake_id(category_id,sort_order,library_cake_categories!category_id(id,name,is_active,sort_order))",
  "library_cake_tag_assignments!cake_id(tag_id,sort_order,library_cake_tags!tag_id(id,name,is_active,sort_order))",
  "library_cake_sizes(id,cake_id,label,price,sort_order,preorder_days,available_from,available_until)",
  "library_cake_photos(id,image_url,alt_text,sort_order,cake_size_id,is_default)",
].join(",");
const encode = (params) => new URLSearchParams(params).toString();
let requestCount = 0;
const requestLog = [];

async function timedGet(path, phase, architecture, accept = "application/json") {
  if (++requestCount > maxRequests) throw new Error("STOP: request safety cap exceeded.");
  const started = performance.now();
  let response;
  try {
    response = await fetch(new URL(path, REST), {
      method: "GET",
      headers: {
        apikey: apiKey,
        accept,
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      redirect: "error",
    });
  } catch (error) {
    const entry = {
      phase, architecture, status: 0,
      durationMs: performance.now() - started,
      bytes: 0,
      code: error?.name === "TimeoutError" ? "CLIENT_TIMEOUT" : "FETCH_ERROR",
    };
    requestLog.push(entry);
    return { ...entry, data: null };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { body = null; }
  const entry = {
    phase, architecture, status: response.status,
    durationMs: performance.now() - started,
    bytes: bytes.byteLength,
    code: !response.ok && body && typeof body === "object" ? String(body.code ?? "") : "",
  };
  requestLog.push(entry);
  return { ...entry, data: response.ok ? body : null };
}

const membershipQuery = (collectionId) => `collection_cakes?${encode({
  select: "library_cake_id,homepage_sort_order,available,show_on_homepage",
  collection_id: `eq.${collectionId}`,
  available: "eq.true",
  show_on_homepage: "eq.true",
  order: "homepage_sort_order.asc",
})}`;
const rootCakeQuery = (ids) => `library_cakes?${encode({
  select: rootProjection,
  id: `in.(${ids.join(",")})`,
})}`;

async function runA(collectionId, phase) {
  const first = await timedGet(membershipQuery(collectionId), phase, "A");
  if (first.status !== 200 || !Array.isArray(first.data)) {
    return { label: "A", requests: [first], rows: null };
  }
  const memberships = first.data;
  const ids = [...new Set(memberships.map((row) => row.library_cake_id).filter(Boolean))].sort();
  if (ids.length === 0) return { label: "A", requests: [first], rows: [] };
  const second = await timedGet(rootCakeQuery(ids), phase, "A");
  if (second.status !== 200 || !Array.isArray(second.data)) {
    return { label: "A", requests: [first, second], rows: null };
  }
  const byId = new Map(second.data.map((cake) => [cake.id, cake]));
  return {
    label: "A",
    requests: [first, second],
    rows: memberships.map((membership) => ({
      order: membership.homepage_sort_order,
      available: membership.available,
      showOnHomepage: membership.show_on_homepage,
      cake: byId.get(membership.library_cake_id) ?? null,
    })),
  };
}

async function runB(collectionId, phase) {
  const select = `homepage_sort_order,available,show_on_homepage,library_cakes!collection_cakes_library_cake_id_fkey(${rootProjection})`;
  const request = await timedGet(`collection_cakes?${encode({
    select,
    collection_id: `eq.${collectionId}`,
    available: "eq.true",
    show_on_homepage: "eq.true",
    order: "homepage_sort_order.asc",
  })}`, phase, "B");
  if (request.status !== 200 || !Array.isArray(request.data)) {
    return { label: "B", requests: [request], rows: null };
  }
  return {
    label: "B",
    requests: [request],
    rows: request.data.map((membership) => ({
      order: membership.homepage_sort_order,
      available: membership.available,
      showOnHomepage: membership.show_on_homepage,
      cake: unwrapOne(membership.library_cakes),
    })),
  };
}

function unwrapOne(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
function sortChildren(cake) {
  if (!cake) return null;
  const result = structuredClone(cake);
  for (const key of ["library_cake_categories"]) {
    result[key] = unwrapOne(result[key]);
  }
  const assignments = result.library_cake_category_assignments;
  if (Array.isArray(assignments)) {
    assignments.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
      || String(a.category_id ?? "").localeCompare(String(b.category_id ?? "")));
    for (const item of assignments) item.library_cake_categories = unwrapOne(item.library_cake_categories);
  }
  const tags = result.library_cake_tag_assignments;
  if (Array.isArray(tags)) {
    tags.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
      || String(a.tag_id ?? "").localeCompare(String(b.tag_id ?? "")));
    for (const item of tags) item.library_cake_tags = unwrapOne(item.library_cake_tags);
  }
  for (const key of ["library_cake_sizes", "library_cake_photos"]) {
    if (Array.isArray(result[key])) {
      result[key].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
        || String(a.id ?? "").localeCompare(String(b.id ?? "")));
    }
  }
  return stable(result);
}
function canonical(rows) {
  return rows?.map((row) => ({
    order: row.order,
    available: row.available,
    showOnHomepage: row.showOnHomepage,
    cake: sortChildren(row.cake),
  })) ?? null;
}
function sha(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function fieldDiffs(a, b, prefix = "", out = [], max = 80) {
  if (out.length >= max) return out;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      out.push({ path: prefix, aType: Array.isArray(a) ? "array" : typeof a, bType: Array.isArray(b) ? "array" : typeof b });
    } else if (a.length !== b.length) {
      out.push({ path: `${prefix}.length`, a: a.length, b: b.length });
    } else {
      for (let i = 0; i < a.length && out.length < max; i++) fieldDiffs(a[i], b[i], `${prefix}[${i}]`, out, max);
    }
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      if (out.length >= max) break;
      const hasA = Object.hasOwn(a, key);
      const hasB = Object.hasOwn(b, key);
      if (!hasA || !hasB) out.push({ path: prefix ? `${prefix}.${key}` : key, presentA: hasA, presentB: hasB });
      else fieldDiffs(a[key], b[key], prefix ? `${prefix}.${key}` : key, out, max);
    }
    return out;
  }
  if (a !== b) out.push({ path: prefix, aHash: sha(a), bHash: sha(b) });
  return out;
}
function eligibility(rows) {
  return (rows ?? []).filter((row) => row.cake
    && (row.cake.status === "active" || row.cake.status === "seasonal")
    && Array.isArray(row.cake.library_cake_sizes)
    && row.cake.library_cake_sizes.length > 0
    && row.available === true && row.showOnHomepage === true);
}
function categorySummary(rows) {
  return (rows ?? []).map((row) => {
    const cake = row.cake;
    if (!cake) return { rowPresent: false };
    const assignments = cake.library_cake_category_assignments ?? [];
    const categories = assignments
      .map((assignment) => unwrapOne(assignment.library_cake_categories))
      .filter(Boolean)
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    const primary = categories[0]?.id ?? unwrapOne(cake.library_cake_categories)?.id ?? cake.category_id ?? null;
    return {
      rowPresent: true,
      assignmentCount: categories.length,
      primaryPresent: primary != null,
      categoriesActive: categories.every((category) => category.is_active === true),
    };
  });
}
function summary(samples) {
  const totals = samples.map((sample) => sample.totalMs).sort((a, b) => a - b);
  const reqDurations = samples.flatMap((sample) => sample.requests.map((r) => r.durationMs));
  const bytes = samples.map((sample) => sample.requests.reduce((n, r) => n + r.bytes, 0)).sort((a, b) => a - b);
  const median = (xs) => {
    if (!xs.length) return null;
    const i = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[i] : (xs[i - 1] + xs[i]) / 2;
  };
  const p95 = (xs) => xs.length ? xs[Math.ceil(0.95 * xs.length) - 1] : null;
  return {
    n: samples.length,
    totalLatencyMs: { median: median(totals), p95NearestRank: p95(totals), max: totals.at(-1) ?? null },
    requestCountPerFlow: samples.map((sample) => sample.requests.length),
    perRequestLatencyMs: { median: median(reqDurations), p95NearestRank: p95([...reqDurations].sort((a, b) => a - b)), max: reqDurations.length ? Math.max(...reqDurations) : null },
    responseBytesPerFlow: { median: median(bytes), p95NearestRank: p95(bytes), max: bytes.at(-1) ?? null },
    httpFailures: samples.reduce((n, sample) => n + sample.requests.filter((r) => r.status < 200 || r.status >= 300).length, 0),
    clientTimeouts: samples.reduce((n, sample) => n + sample.requests.filter((r) => r.code === "CLIENT_TIMEOUT").length, 0),
    postgresTimeoutCodes: samples.flatMap((sample) => sample.requests).filter((r) => r.code === "57014").length,
  };
}
function makeSample(run, started, label) {
  return { label, totalMs: performance.now() - started, requests: run.requests };
}
function summarizePlan(data) {
  const plans = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node["Node Type"]) {
      nodes.push({
        nodeType: node["Node Type"],
        relation: node["Relation Name"] ?? null,
        index: node["Index Name"] ?? null,
        estimatedRows: node["Plan Rows"] ?? null,
        totalCost: node["Total Cost"] ?? null,
      });
    }
    if (Array.isArray(node.Plans)) node.Plans.forEach(visit);
  };
  for (const item of plans) visit(item.Plan ?? item);
  return {
    available: nodes.length > 0,
    queryIdentifiers: plans.map((item) => item["Query Identifier"] ?? null).filter((value) => value != null),
    nodes,
    note: "Planner estimates only; EXPLAIN without ANALYZE. No SQL text or row data emitted.",
  };
}

async function discoverCollection() {
  const result = await timedGet(`collection_cakes?${encode({
    select: "collection_id",
    available: "eq.true",
    show_on_homepage: "eq.true",
  })}`, "discovery", "setup");
  if (result.status !== 200 || !Array.isArray(result.data)) {
    throw new Error(`DEV anonymous discovery failed (HTTP ${result.status}, code ${result.code || "none"}).`);
  }
  const counts = new Map();
  for (const row of result.data) counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1);
  const candidate = [...counts.entries()].filter(([, n]) => n >= 5 && n <= 6).sort((a, b) => a[0].localeCompare(b[0]))[0];
  if (!candidate) throw new Error("No public DEV homepage collection with 5–6 memberships is visible to anon.");
  return { collectionId: candidate[0], size: candidate[1], discovery: result };
}

const { collectionId, size, discovery } = await discoverCollection();
const paritySamples = { A: [], B: [] };
const machineDiffs = [];
let planCakeIds = [];
for (let i = 0; i < parityPairs; i++) {
  const order = i % 2 === 0 ? ["A", "B"] : ["B", "A"];
  const runs = {};
  for (const architecture of order) {
    runs[architecture] = architecture === "A"
      ? await runA(collectionId, "parity")
      : await runB(collectionId, "parity");
  }
  for (const architecture of ["A", "B"]) {
    const run = runs[architecture];
    paritySamples[architecture].push({
      requestCount: run.requests.length,
      failed: run.requests.some((r) => r.status < 200 || r.status >= 300),
      hash: sha(canonical(run.rows)),
    });
  }
  const a = canonical(runs.A.rows);
  const b = canonical(runs.B.rows);
  if (i === 0) planCakeIds = (runs.A.rows ?? []).map((row) => row.cake?.id).filter(Boolean);
  const diffs = fieldDiffs(a, b, "rows", [], 80);
  if (diffs.length) machineDiffs.push({ pair: i + 1, paths: diffs });
}
const parityPass = machineDiffs.length === 0
  && paritySamples.A.every((sample) => !sample.failed)
  && paritySamples.B.every((sample) => !sample.failed);

if (!parityPass) {
  console.log(JSON.stringify({
    experiment: "catalogue-single-request-dev-20261029",
    projectRef: DEV_REF,
    authMode: "public key apikey header only; no Authorization token; anonymous RLS",
    parity: {
      pass: false,
      architectureA: paritySamples.A,
      architectureB: paritySamples.B,
      machineReadableDifferences: machineDiffs,
      performanceMeasurementsStarted: false,
    },
    requestTimeoutMs: timeoutMs,
    totalRequestsIssued: requestCount,
    safetyCap: maxRequests,
    limits: ["No response bodies or values were printed.", "A parity difference stops all performance sampling."],
  }, null, 2));
  process.exit(2);
}

// Empty-collection parity uses a deliberately nonexistent UUID and remains read-only.
const emptyId = randomUUID();
const emptyA = await runA(emptyId, "empty");
const emptyB = await runB(emptyId, "empty");
const emptyDiffs = fieldDiffs(canonical(emptyA.rows), canonical(emptyB.rows), "emptyRows", [], 20);
const emptyParity = emptyA.rows?.length === 0 && emptyB.rows?.length === 0 && emptyDiffs.length === 0;

// Confirm the shared application eligibility rule behaves identically for each architecture;
// report actual excluded-row counts separately from this deterministic synthetic edge fixture.
const excludedFixture = [{ available: true, showOnHomepage: true, cake: { status: "retired", library_cake_sizes: [] } }];
const excludedFixturePass = eligibility(excludedFixture).length === 0;
const visibleA = eligibility((await runA(collectionId, "eligibility" )).rows);
const visibleB = eligibility((await runB(collectionId, "eligibility" )).rows);
const eligibilityParity = sha(canonical(visibleA)) === sha(canonical(visibleB));
if (!emptyParity || !excludedFixturePass || !eligibilityParity) {
  console.log(JSON.stringify({
    experiment: "catalogue-single-request-dev-20261029",
    projectRef: DEV_REF,
    authMode: "public key apikey header only; no Authorization token; anonymous RLS",
    parity: { pass: false, emptyParity, excludedFixturePass, eligibilityParity, machineReadableDifferences: emptyDiffs, performanceMeasurementsStarted: false },
    requestTimeoutMs: timeoutMs,
    totalRequestsIssued: requestCount,
    safetyCap: maxRequests,
  }, null, 2));
  process.exit(2);
}

// Optional exact PostgREST EXPLAIN requests. If the DEV gateway has db-plan-enabled
// disabled, record that limitation and continue; no query is executed with ANALYZE.
const planAccept = "application/vnd.pgrst.plan+json; options=verbose";
const planMembership = await timedGet(membershipQuery(collectionId), "plan", "A-membership", planAccept);
const planRoot = planCakeIds.length
  ? await timedGet(rootCakeQuery(planCakeIds), "plan", "A-root-cakes", planAccept)
  : null;
const planEmbedded = await timedGet(`collection_cakes?${encode({
  select: `homepage_sort_order,available,show_on_homepage,library_cakes!collection_cakes_library_cake_id_fkey(${rootProjection})`,
  collection_id: `eq.${collectionId}`,
  available: "eq.true",
  show_on_homepage: "eq.true",
  order: "homepage_sort_order.asc",
})}`, "plan", "B-embedded", planAccept);
const queryPlans = {
  A_membership: { httpStatus: planMembership.status, summary: summarizePlan(planMembership.data) },
  A_rootCakes: planRoot ? { httpStatus: planRoot.status, summary: summarizePlan(planRoot.data) } : { available: false, reason: "no visible cake IDs" },
  B_embedded: { httpStatus: planEmbedded.status, summary: summarizePlan(planEmbedded.data) },
  unavailableReason: "If plan responses are unavailable, DEV PostgREST plan exposure may be disabled; no setting was changed.",
};

// Performance starts only after full sampled field parity and empty/eligibility checks pass.
const samples = { A: [], B: [] };
const firstAfterStart = { A: null, B: null };
for (let i = 0; i < sequentialPairs; i++) {
  for (const architecture of (i % 2 === 0 ? ["A", "B"] : ["B", "A"])) {
    const started = performance.now();
    const run = architecture === "A" ? await runA(collectionId, "sequential") : await runB(collectionId, "sequential");
    const sample = makeSample(run, started, i === 0 ? "first-pair" : "repeat");
    samples[architecture].push(sample);
    if (firstAfterStart[architecture] == null) firstAfterStart[architecture] = sample.totalMs;
    if (run.requests.some((r) => r.status < 200 || r.status >= 300)) {
      // Record bounded errors but finish only the current paired series; no retries.
      continue;
    }
    if (sha(canonical(run.rows)) !== paritySamples[architecture][0].hash) {
      console.log(JSON.stringify({
        experiment: "catalogue-single-request-dev-20261029",
        projectRef: DEV_REF,
        parity: { pass: false, performanceMeasurementsStarted: true, driftDetected: true, pair: i + 1, architecture },
        requestTimeoutMs: timeoutMs,
        totalRequestsIssued: requestCount,
        stopReason: "Read output changed during repeated sampling; measurements are not comparable.",
      }, null, 2));
      process.exit(3);
    }
  }
}

const concurrent = {};
for (const architecture of ["A", "B"]) {
  const started = performance.now();
  const flows = await Promise.all(Array.from({ length: concurrentFlows }, async () => {
    const flowStart = performance.now();
    const run = architecture === "A" ? await runA(collectionId, "concurrent") : await runB(collectionId, "concurrent");
    return makeSample(run, flowStart, "concurrent");
  }));
  concurrent[architecture] = {
    simultaneousFlows: concurrentFlows,
    aggregateElapsedMs: performance.now() - started,
    underlyingRestRequests: flows.reduce((n, flow) => n + flow.requests.length, 0),
    failedRequests: flows.flatMap((flow) => flow.requests).filter((r) => r.status < 200 || r.status >= 300).length,
    clientTimeouts: flows.flatMap((flow) => flow.requests).filter((r) => r.code === "CLIENT_TIMEOUT").length,
    responseBytes: flows.flatMap((flow) => flow.requests).reduce((n, r) => n + r.bytes, 0),
  };
}

const statuses = requestLog.reduce((acc, item) => {
  const key = String(item.status);
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({
  experiment: "catalogue-single-request-dev-20261029",
  projectRef: DEV_REF,
  authMode: "public key apikey header only; no Authorization token; anonymous RLS",
  collectionMembershipCount: size,
  querySummary: {
    A: "membership GET then library_cakes GET by IDs with complete nested projection",
    B: "one collection_cakes GET embedding library_cakes with the identical complete nested projection",
    priceRpcIncluded: false,
  },
  parity: {
    pass: true,
    parityPairs,
    emptyCollectionPass: emptyParity,
    excludedSyntheticFixturePass: excludedFixturePass,
    eligibleRowsMatch: eligibilityParity,
    actualExcludedRows: {
      A: size - visibleA.length,
      B: size - visibleB.length,
      note: "Counts only; the synthetic retired/empty-size edge fixture was checked separately.",
    },
    homepageDisplayRowsAfterExistingLimit: { A: visibleA.slice(0, 5).length, B: visibleB.slice(0, 5).length },
    fullProjectionHashes: { A: paritySamples.A[0].hash, B: paritySamples.B[0].hash },
    orderedMembershipAndCakeRowsMatch: true,
    differences: [],
  },
  timeoutMs,
  sequential: {
    pairedSamplesPerArchitecture: sequentialPairs,
    order: "counterbalanced A/B; A first then B first, alternating",
    A: summary(samples.A),
    B: summary(samples.B),
    firstSampleAfterProbeStartMs: firstAfterStart,
    coldWarmNote: "First measured sample after parity reads versus repeats; parity has already warmed query paths, and no database-cold or server-cache state is claimed.",
  },
  concurrent,
  httpStatusCounts: statuses,
  totalRequestsIssued: requestCount,
  safetyCap: maxRequests,
  queryPlans,
  limits: [
    "DEV public anonymous GET traffic only; no writes or mutations.",
    "Client HTTP timing includes network, gateway, PostgREST and any server-side effects; it is not SQL duration.",
    "Direct REST probe does not execute Next.js unstable_cache or Vercel rendering.",
    "No query-plan or Production-timeout conclusion is implied.",
  ],
}, null, 2));
