import assert from "node:assert/strict";
import { retryTimedOutGet } from "../src/lib/supabase/fetch-timeout.ts";
import {
  coalescePublicCakeRead,
  notePublishedCakeInvalidation,
  retryStatementTimeoutRead,
} from "../src/workspaces/storefront/catalog/public-cake-read.ts";

let release!: () => void;
const gate = new Promise<void>((resolve) => { release = resolve; });
let calls = 0;
const read = async () => { calls += 1; await gate; return ["cake-a", "cake-b"]; };
const simultaneous = Array.from({ length: 8 }, () => coalescePublicCakeRead("a,b", read));
await Promise.resolve();
assert.equal(calls, 1, "eight identical cold reads share one in-flight request");
release();
for (const result of await Promise.all(simultaneous)) assert.deepEqual(result, ["cake-a", "cake-b"]);
await coalescePublicCakeRead("a,b", read);
assert.equal(calls, 2, "settled results do not remain in the in-flight map");

let releaseDifferent!: () => void;
const differentGate = new Promise<void>((resolve) => { releaseDifferent = resolve; });
const keys: string[] = [];
const first = coalescePublicCakeRead("a,b", async () => { keys.push("a,b"); await differentGate; return ["a", "b"]; });
const second = coalescePublicCakeRead("b,c", async () => { keys.push("b,c"); await differentGate; return ["b", "c"]; });
await Promise.resolve();
assert.deepEqual(keys, ["a,b", "b,c"], "different ID sets remain independent");
releaseDifferent();
assert.deepEqual(await first, ["a", "b"]);
assert.deepEqual(await second, ["b", "c"]);

let releaseOld!: () => void;
const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
let generationCalls = 0;
const old = coalescePublicCakeRead("a", async () => { generationCalls += 1; await oldGate; return "old"; });
await Promise.resolve();
notePublishedCakeInvalidation();
const fresh = coalescePublicCakeRead("a", async () => { generationCalls += 1; return "fresh"; });
assert.equal(await fresh, "fresh", "post-invalidation read does not join an older in-flight read");
assert.equal(generationCalls, 2);
releaseOld();
assert.equal(await old, "old");

let failedCalls = 0;
await assert.rejects(coalescePublicCakeRead("failed", async () => { failedCalls += 1; throw new Error("down"); }), /down/);
await coalescePublicCakeRead("failed", async () => { failedCalls += 1; return "recovered"; });
assert.equal(failedCalls, 2, "a rejected promise is removed for a later request");

let retryCalls = 0;
const recovered = await retryStatementTimeoutRead(async () => {
  retryCalls += 1;
  if (retryCalls === 1) throw new Error("canceling statement due to statement timeout");
  return "recovered";
});
assert.equal(recovered, "recovered");
assert.equal(retryCalls, 2, "statement timeout gets one retry");
await assert.rejects(retryStatementTimeoutRead(async () => {
  retryCalls += 1;
  throw new Error("permission denied");
}), /permission denied/);
assert.equal(retryCalls, 3, "non-timeout failures are not retried");
await assert.rejects(retryStatementTimeoutRead(async () => {
  retryCalls += 1;
  throw new Error("canceling statement due to statement timeout");
}), /statement timeout/);
assert.equal(retryCalls, 5, "persistent timeouts stop after one retry");

let sharedRetryCalls = 0;
const sharedRecovered = await Promise.all(Array.from({ length: 8 }, () =>
  coalescePublicCakeRead("same-public-ids", () => retryStatementTimeoutRead(async () => {
    sharedRetryCalls += 1;
    if (sharedRetryCalls === 1) throw new Error("canceling statement due to statement timeout");
    return ["correct-cake"];
  })),
));
assert.equal(sharedRetryCalls, 2, "eight callers cause one initial read and one bounded retry");
for (const result of sharedRecovered) assert.deepEqual(result, ["correct-cake"]);

console.log("PASS public cake in-flight coalescing, invalidation boundary, cleanup and bounded timeout retry");

let getCalls = 0;
const recoveredGet = retryTimedOutGet(async () => {
  getCalls += 1;
  if (getCalls === 1) {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  }
  return new Response("ok", { status: 200 });
});
assert.equal((await recoveredGet("https://example.test/catalogue")).status, 200);
assert.equal(getCalls, 2, "an internally timed-out GET gets exactly one retry");

let postCalls = 0;
const timedOutPost = retryTimedOutGet(async () => {
  postCalls += 1;
  throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
});
await assert.rejects(timedOutPost("https://example.test/rpc", { method: "POST" }), /timeout/);
assert.equal(postCalls, 1, "non-GET requests are never retried");

let abortCalls = 0;
const cancelledGet = retryTimedOutGet(async () => {
  abortCalls += 1;
  throw new DOMException("The operation was aborted", "AbortError");
});
await assert.rejects(cancelledGet("https://example.test/catalogue"), /aborted/);
assert.equal(abortCalls, 1, "caller cancellation is not retried");

let persistentTimeoutCalls = 0;
const persistentTimeout = retryTimedOutGet(async () => {
  persistentTimeoutCalls += 1;
  throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
});
await assert.rejects(persistentTimeout("https://example.test/catalogue"), /timeout/);
assert.equal(persistentTimeoutCalls, 2, "a persistent timeout stops after one retry");

console.log("PASS one bounded GET retry for the observed AbortSignal timeout; POST and caller abort remain single-attempt");
