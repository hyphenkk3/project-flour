#!/usr/bin/env node
import fs from "node:fs";
import { createHash } from "node:crypto";

const MAX_WINDOW_MS = 10 * 60 * 1000;
const MAX_RECORDS = 2000;
const ALLOWED_PROJECT = "cuowwlduhxxifmpvpltt";
const ALLOWED_DEPLOYMENT = "dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG";

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " must be an object");
}
function toMs(value) {
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value) ? value.replace(" ", "T") + "Z" : value;
  const n = Date.parse(normalized);
  if (!Number.isFinite(n)) throw new Error("Invalid UTC timestamp: " + String(value));
  return n;
}
function percentileNearestRank(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function safeText(value) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s"']+/gi, "[URL]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[UUID]")
    .replace(/\b(?:password|token|secret|authorization|apikey|api_key|connection_string)\s*[:=]\s*[^,\s;]+/gi, "[SECRET]")
    .replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, "[KEY]")
    .replace(/\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[TOKEN]");
}
function pick(row, keys) {
  requireObject(row, "row");
  const out = {};
  for (const key of keys) if (row[key] !== undefined) out[key] = row[key];
  return out;
}
function hashIdentifier(value) {
  return value ? createHash("sha256").update(String(value)).digest("hex") : null;
}
function sanitizeVercelEvents(events, start, end) {
  if (!Array.isArray(events)) throw new Error("vercel.events must be an array");
  if (events.length > 100) throw new Error("Vercel event cap exceeded (100)");
  const safe = events.map(event => {
    requireObject(event, "Vercel event");
    const timestampUtc = event.timestampUtc;
    const t = toMs(timestampUtc);
    if (t < start || t >= end) throw new Error("Vercel event timestamp outside declared incident window");
    const route = safeText(String(event.route ?? "").split(/[?#]/, 1)[0].slice(0, 180));
    return {
      timestampUtc,
      level: String(event.level ?? "unknown").slice(0, 30),
      source: String(event.source ?? "unknown").slice(0, 30),
      route,
      requestIdSha256: hashIdentifier(event.requestId),
      message: safeText(String(event.message ?? "").slice(0, 1200))
    };
  });
  const unique = new Map();
  let unidentifiedRows = 0;
  for (const event of safe) {
    if (!event.requestIdSha256) { unidentifiedRows++; continue; }
    if (!unique.has(event.requestIdSha256)) unique.set(event.requestIdSha256, event);
  }
  const retained = [...unique.values(), ...safe.filter(e => !e.requestIdSha256)];
  return {
    inputLogRows: safe.length,
    uniqueRequestsWithHashedId: unique.size,
    rowsWithoutRequestId: unidentifiedRows,
    duplicateRowsByRequestId: safe.length - retained.length,
    levels: Object.fromEntries([...new Set(safe.map(e => e.level))].map(level => [level, safe.filter(e => e.level === level).length])),
    events: retained
  };
}

export function summarize(input) {
  requireObject(input, "input");
  if (input.schemaVersion !== 1) throw new Error("Unsupported schemaVersion");
  if (input.projectRef !== ALLOWED_PROJECT) throw new Error("Wrong or missing Production projectRef; refusing analysis");
  if (input.deploymentId !== ALLOWED_DEPLOYMENT) throw new Error("Wrong or missing Production deploymentId; refusing analysis");
  requireObject(input.window, "window");
  const start = toMs(input.window.startUtc);
  const end = toMs(input.window.endUtc);
  if (end <= start || end - start > MAX_WINDOW_MS) throw new Error("Window must be positive and at most 10 minutes");
  const arrays = ["edgeCatalogue", "postgresTimeouts", "postgrestTimeoutMessages", "pricingByMinute"];
  for (const key of arrays) if (!Array.isArray(input[key])) throw new Error(key + " must be an array");
  const recordCount = arrays.reduce((n, k) => n + input[k].length, 0);
  if (recordCount > MAX_RECORDS) throw new Error("Record cap exceeded");
  const edge = input.edgeCatalogue.map(r => pick(r, ["timestampUtc","status","originMs","requestIdSha256","traceIdSha256"]));
  const pg = input.postgresTimeouts.map(r => pick(r, ["timestampUtc","sqlstate","queryId","sessionIdSha256","sessionLineNum","severity"]));
  const pgrst = input.postgrestTimeoutMessages.map(r => pick(r, ["timestampUtc","repeatedLogRows","wording"]));
  const prices = input.pricingByMinute.map(r => pick(r, ["minuteUtc","status","logRows","uniqueRequestIds","p50OriginMs","p95OriginMs","maxOriginMs"]));
  for (const [label, rows] of [["edge",edge],["postgres",pg],["postgrest",pgrst]]) {
    for (const row of rows) {
      const t = toMs(row.timestampUtc);
      if (t < start || t >= end) throw new Error(label + " timestamp outside declared incident window");
    }
  }
  const edgeById = new Map();
  let edgeUnidentifiedRows = 0;
  for (const row of edge) {
    if (!row.requestIdSha256) { edgeUnidentifiedRows++; continue; }
    if (!edgeById.has(row.requestIdSha256)) edgeById.set(row.requestIdSha256, row);
  }
  const edgeUnique = [...edgeById.values()];
  const edgeCounts = {};
  for (const row of edgeUnique) {
    const key = String(row.status ?? "unknown");
    edgeCounts[key] = (edgeCounts[key] ?? 0) + 1;
  }
  const edgeLatency = {};
  for (const status of [...new Set(edgeUnique.map(r => String(r.status ?? "unknown")))]) {
    const vals = edgeUnique.filter(r => String(r.status ?? "unknown") === status)
      .map(r => Number(r.originMs)).filter(Number.isFinite);
    edgeLatency[status] = { n: vals.length, medianMs: median(vals), p95NearestRankMs: percentileNearestRank(vals, .95), maxMs: vals.length ? Math.max(...vals) : null };
  }
  const pgKey = row => row.sessionIdSha256 && row.sessionLineNum
    ? row.sessionIdSha256 + ":" + row.sessionLineNum
    : [row.timestampUtc,row.sqlstate,row.queryId,row.severity].join("|");
  const pgUnique = new Map();
  for (const row of pg) if (!pgUnique.has(pgKey(row))) pgUnique.set(pgKey(row), row);
  const pgByState = {};
  for (const row of pgUnique.values()) {
    const key = String(row.sqlstate ?? "unknown");
    pgByState[key] = (pgByState[key] ?? 0) + 1;
  }
  const pgByQuery = {};
  for (const row of pgUnique.values()) {
    const key = String(row.queryId ?? "unknown");
    pgByQuery[key] = (pgByQuery[key] ?? 0) + 1;
  }
  const pgrstGroups = new Map();
  for (const row of pgrst) {
    const wording = safeText(row.wording);
    const key = wording;
    const current = pgrstGroups.get(key) ?? { wording, sampledGroups: 0, representedLogRows: 0, timestampsUtc: [] };
    current.sampledGroups++;
    current.representedLogRows += Number(row.repeatedLogRows ?? 1);
    current.timestampsUtc.push(row.timestampUtc);
    pgrstGroups.set(key, current);
  }
  const priceRows = prices.map(r => ({...r, status:String(r.status), minuteUtc:String(r.minuteUtc)}));
  const priceCounts = {};
  for (const row of priceRows) {
    const key = row.status;
    priceCounts[key] = (priceCounts[key] ?? 0) + Number(row.logRows ?? 0);
  }
  const resource = input.resourceSnapshot ? {
    observedUtc: input.resourceSnapshot.observedUtc,
    relationToIncident: safeText(input.resourceSnapshot.relativeToIncident),
    numBackends: input.resourceSnapshot.numBackends ?? null,
    activityByState: Array.isArray(input.resourceSnapshot.activityByState) ? input.resourceSnapshot.activityByState.map(r => pick(r,["backendType","state","waitEventType","waitEvent","sessions"])) : [],
    historicalCpuMemoryIoPoolMetrics: safeText(input.resourceSnapshot.historicalCpuMemoryIoPoolMetrics ?? "not supplied")
  } : null;
  return {
    schemaVersion: 1,
    target: { projectRef: input.projectRef, deploymentId: input.deploymentId },
    incidentWindowUtc: { start: input.window.startUtc, end: input.window.endUtc, durationSeconds: (end-start)/1000 },
    limits: { maxWindowSeconds: MAX_WINDOW_MS/1000, maxInputRecords: MAX_RECORDS, inputRecordCount: recordCount },
    edgeCatalogue: {
      inputLogRows: edge.length,
      uniqueRequestsWithHashedId: edgeUnique.length,
      duplicateRowsByRequestId: edge.length - edgeUnique.length - edgeUnidentifiedRows,
      rowsWithoutRequestId: edgeUnidentifiedRows,
      uniqueRequestCountsByStatus: edgeCounts,
      originLatencyByStatus: edgeLatency
    },
    postgres: {
      inputLogRows: pg.length,
      uniqueEventsAfterSessionLineDedup: pgUnique.size,
      duplicateRowsRemoved: pg.length - pgUnique.size,
      uniqueSessionCount: new Set([...pgUnique.values()].map(r => r.sessionIdSha256).filter(Boolean)).size,
      sqlstateCounts: pgByState,
      queryFingerprintCounts: pgByQuery,
      eventTimesUtc: [...pgUnique.values()].map(r => r.timestampUtc).sort()
    },
    postgrest: {
      inputGroups: pgrst.length,
      representedLogRows: pgrst.reduce((n,r)=>n+Number(r.repeatedLogRows??1),0),
      exactWordingGroups: [...pgrstGroups.values()]
    },
    pricingRpc: { inputMinuteBuckets: priceRows.length, responseCountsByStatus: priceCounts, minuteBuckets: priceRows },
    vercel: input.vercel?.events
      ? { ...sanitizeVercelEvents(input.vercel.events, start, end), query: safeText(input.vercel.query ?? ""), note: safeText(input.vercel.note ?? "") }
      : input.vercel ? pick(input.vercel,["matchingLogs","query","note"]) : {matchingLogs:null,note:"not collected"},
    resourceSnapshot: resource,
    correlation: {
      edgeRequestIdsAndPostgreSqlSessionIdsDirectlyLinked: false,
      reason: "No shared request/session correlation key was available in the retained evidence. Timing overlap and matching query fingerprint are not treated as an individual-request join."
    }
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2) {
    console.error("Usage: node catalogue-incident-summary.mjs <sanitized-evidence.json> [summary-output.json]");
    process.exitCode = 2;
    return;
  }
  const input = JSON.parse(fs.readFileSync(args[0], "utf8"));
  const output = JSON.stringify(summarize(input), null, 2) + "\n";
  if (args[1]) fs.writeFileSync(args[1], output, { mode: 0o600, flag: "wx" });
  else process.stdout.write(output);
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) main();
