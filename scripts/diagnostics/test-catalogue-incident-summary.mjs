import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { summarize } from "./catalogue-incident-summary.mjs";

const fixturePath = fileURLToPath(new URL("./fixtures/phase7-historical-20261028T0440Z.json", import.meta.url));
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

test("replays the bounded historical catalogue incident without inventing correlation", () => {
  const result = summarize(fixture);
  assert.equal(result.edgeCatalogue.uniqueRequestsWithHashedId, 29);
  assert.deepEqual(result.edgeCatalogue.uniqueRequestCountsByStatus, {"200":23,"500":6});
  assert.equal(result.edgeCatalogue.originLatencyByStatus["500"].n, 6);
  assert.equal(result.edgeCatalogue.originLatencyByStatus["500"].maxMs, 21568);
  assert.equal(result.postgres.uniqueEventsAfterSessionLineDedup, 6);
  assert.equal(result.postgres.uniqueSessionCount, 6);
  assert.deepEqual(result.postgres.queryFingerprintCounts, {"-3231686492694644454":6});
  assert.equal(result.postgrest.representedLogRows, 34);
  assert.equal(result.pricingRpc.responseCountsByStatus["200"], 177);
  assert.equal(result.correlation.edgeRequestIdsAndPostgreSqlSessionIdsDirectlyLinked, false);
  assert.equal(result.vercel.matchingLogs, 0);
});

test("deduplicates repeated request and database log records", () => {
  const duplicate = structuredClone(fixture);
  duplicate.edgeCatalogue.push(structuredClone(duplicate.edgeCatalogue[0]));
  duplicate.postgresTimeouts.push(structuredClone(duplicate.postgresTimeouts[0]));
  const result = summarize(duplicate);
  assert.equal(result.edgeCatalogue.inputLogRows, 30);
  assert.equal(result.edgeCatalogue.uniqueRequestsWithHashedId, 29);
  assert.equal(result.edgeCatalogue.duplicateRowsByRequestId, 1);
  assert.equal(result.postgres.inputLogRows, 7);
  assert.equal(result.postgres.uniqueEventsAfterSessionLineDedup, 6);
  assert.equal(result.postgres.duplicateRowsRemoved, 1);
});

test("refuses wrong project and oversized incident windows", () => {
  assert.throws(() => summarize({...fixture, projectRef:"wrong-project"}), /Wrong or missing Production projectRef/);
  assert.throws(() => summarize({...fixture, window:{startUtc:"2026-10-28T00:00:00Z",endUtc:"2026-10-28T01:00:00Z"}}), /at most 10 minutes/);
});

test("retains timeout wording while redacting personal and credential-like values", () => {
  const testData = structuredClone(fixture);
  testData.postgrestTimeoutMessages = [{timestampUtc:"2026-10-28T04:41:57Z",repeatedLogRows:1,wording:"Timeout for user jane@example.com at 192.0.2.1 id 3f5bde30-7f4d-4a35-8fd8-c3a77b3d8dab key sb_secret_example"}];
  const result = summarize(testData);
  const wording = result.postgrest.exactWordingGroups[0].wording;
  assert.match(wording,/Timeout for user/);
  assert.doesNotMatch(wording,/jane@example.com|192\.0\.2\.1|3f5bde30|sb_secret_example/);
});

test("sanitizes Vercel events, strips query strings, and hashes request identifiers", () => {
  const testData = structuredClone(fixture);
  testData.vercel = {
    query: "catalog error",
    note: "sample",
    events: [
      {timestampUtc:"2026-10-28T04:41:30Z", level:"error", source:"function", route:"/catalog?email=jane@example.com&token=secret", requestId:"private-request-id", message:"Abort at https://internal.example/path?token=x password=hunter2"},
      {timestampUtc:"2026-10-28T04:41:30Z", level:"error", source:"function", route:"/catalog", requestId:"private-request-id", message:"duplicate"}
    ]
  };
  const result = summarize(testData).vercel;
  assert.equal(result.uniqueRequestsWithHashedId, 1);
  assert.equal(result.duplicateRowsByRequestId, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-request-id|jane@example\.com|token=secret|internal\.example|hunter2/);
  assert.equal(result.events[0].route, "/catalog");
  assert.match(result.events[0].message, /\[URL\]/);
});
