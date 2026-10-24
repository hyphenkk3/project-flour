import test from "node:test";
import assert from "node:assert/strict";
import {
  coalesceInFlight,
  normalizeCakeDisplayIds,
} from "../src/workspaces/storefront/catalog/in-flight-coalescer.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("identical concurrent normalized ID sets share one pending read", async () => {
  const pending = new Map();
  const gate = deferred();
  let reads = 0;
  const load = () => {
    reads += 1;
    return gate.promise;
  };
  const firstKey = normalizeCakeDisplayIds(["cake-b", " cake-a ", "cake-b"]).join(",");
  const secondKey = normalizeCakeDisplayIds(["cake-a", "cake-b"]).join(",");
  const first = coalesceInFlight(pending, firstKey, load);
  const second = coalesceInFlight(pending, secondKey, load);

  await Promise.resolve();
  assert.equal(reads, 1);
  assert.equal(first, second);
  assert.equal(pending.size, 1);

  const result = [
    { id: "cake-b", name: "Cake B", categories: ["Seasonal"], tags: ["Popular"], photos: [{ url: "/b.webp", sortOrder: 1 }], sizes: [{ id: "size-b", price: 48 }] },
    { id: "cake-a", name: "Cake A", categories: ["Classic"], tags: [], photos: [{ url: "/a.webp", sortOrder: 0 }], sizes: [{ id: "size-a", price: 38 }] },
  ];
  gate.resolve(result);
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, result);
  assert.deepEqual(secondResult, result);
  assert.deepEqual(firstResult.map((cake) => cake.id), ["cake-b", "cake-a"]);
  assert.equal(pending.size, 0);
});

test("different normalized ID sets execute independently", async () => {
  const pending = new Map();
  const gates = new Map();
  let reads = 0;
  const load = (key) => {
    reads += 1;
    const gate = deferred();
    gates.set(key, gate);
    return gate.promise;
  };
  const keyA = normalizeCakeDisplayIds(["cake-a", "cake-b"]).join(",");
  const keyB = normalizeCakeDisplayIds(["cake-a", "cake-c"]).join(",");
  const first = coalesceInFlight(pending, keyA, () => load(keyA));
  const second = coalesceInFlight(pending, keyB, () => load(keyB));

  await Promise.resolve();
  assert.equal(reads, 2);
  gates.get(keyA).resolve(["result-a"]);
  gates.get(keyB).resolve(["result-b"]);
  assert.deepEqual(await Promise.all([first, second]), [["result-a"], ["result-b"]]);
});

test("a failure reaches all current callers and a later call starts fresh", async () => {
  const pending = new Map();
  const gate = deferred();
  const failure = new Error("controlled read failure");
  let reads = 0;
  const load = () => {
    reads += 1;
    return reads === 1 ? gate.promise : Promise.resolve("recovered");
  };
  const first = coalesceInFlight(pending, "cake-a,cake-b", load);
  const second = coalesceInFlight(pending, "cake-a,cake-b", load);

  await Promise.resolve();
  gate.reject(failure);
  const outcomes = await Promise.allSettled([first, second]);
  assert.equal(outcomes[0].status, "rejected");
  assert.equal(outcomes[1].status, "rejected");
  assert.equal(outcomes[0].reason, failure);
  assert.equal(outcomes[1].reason, failure);
  assert.equal(pending.size, 0);
  assert.equal(await coalesceInFlight(pending, "cake-a,cake-b", load), "recovered");
  assert.equal(reads, 2);
  assert.equal(pending.size, 0);
});

test("successful operations are removed and never retained as cache entries", async () => {
  const pending = new Map();
  let reads = 0;
  const load = async () => ++reads;
  assert.equal(await coalesceInFlight(pending, "same-set", load), 1);
  assert.equal(pending.size, 0);
  assert.equal(await coalesceInFlight(pending, "same-set", load), 2);
  assert.equal(reads, 2);
});

test("normalization deduplicates and sorts IDs without adding request identity", () => {
  assert.deepEqual(normalizeCakeDisplayIds(["cake-b", " cake-a ", "cake-b", ""]), ["cake-a", "cake-b"]);
  assert.notEqual(normalizeCakeDisplayIds(["cake-a", "cake-b"]).join(","), normalizeCakeDisplayIds(["cake-a", "cake-c"]).join(","));
});
