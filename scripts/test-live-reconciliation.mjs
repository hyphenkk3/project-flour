import assert from "node:assert/strict";
import test from "node:test";
import { createCoalescedReconciliation } from "../src/lib/coalescedReconciliation.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("coalesces overlapping signals and discards superseded responses", async () => {
  const reads = [];
  const applied = [];
  const reconcile = createCoalescedReconciliation(
    () => {
      const read = deferred();
      reads.push(read);
      return read.promise;
    },
    (value) => applied.push(value),
  );

  const first = reconcile();
  const second = reconcile();
  const third = reconcile();
  assert.equal(reads.length, 1);

  reads[0].resolve("superseded");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(reads.length, 2);
  assert.deepEqual(applied, []);

  reads[1].resolve("latest");
  await Promise.all([first, second, third]);
  assert.deepEqual(applied, ["latest"]);
});

test("a failed read keeps the last state and allows a later retry", async () => {
  const applied = [];
  let reads = 0;
  const reconcile = createCoalescedReconciliation(
    async () => {
      reads += 1;
      if (reads === 1) throw new Error("offline");
      return "recovered";
    },
    (value) => applied.push(value),
  );

  await reconcile();
  assert.deepEqual(applied, []);
  await reconcile();
  assert.deepEqual(applied, ["recovered"]);
});
