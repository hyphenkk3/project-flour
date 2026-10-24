import assert from "node:assert/strict";
import test from "node:test";
import {
  attachCakeTagAssignments,
  readWithStatementTimeoutFallback,
} from "../src/workspaces/storefront/catalog/statement-timeout-fallback.ts";

test("successful embedded read does not issue extra requests", async () => {
  let fallbackCalls = 0;
  const result = await readWithStatementTimeoutFallback(
    async () => ["cake"],
    async () => {
      fallbackCalls++;
      return ["fallback"];
    },
  );
  assert.deepEqual(result, ["cake"]);
  assert.equal(fallbackCalls, 0);
});

test("statement cancellation takes exactly one alternate path", async () => {
  let fallbackCalls = 0;
  const result = await readWithStatementTimeoutFallback(
    async () => {
      throw new Error("canceling statement due to statement timeout");
    },
    async () => {
      fallbackCalls++;
      return ["recovered"];
    },
  );
  assert.deepEqual(result, ["recovered"]);
  assert.equal(fallbackCalls, 1);
});

test("other failures are not retried", async () => {
  let fallbackCalls = 0;
  await assert.rejects(
    readWithStatementTimeoutFallback(
      async () => {
        throw new Error("permission denied");
      },
      async () => {
        fallbackCalls++;
        return [];
      },
    ),
    /permission denied/,
  );
  assert.equal(fallbackCalls, 0);
});

test("an alternate-read failure remains visible", async () => {
  await assert.rejects(
    readWithStatementTimeoutFallback(
      async () => {
        throw new Error("canceling statement due to statement timeout");
      },
      async () => {
        throw new Error("tag read failed");
      },
    ),
    /tag read failed/,
  );
});

test("bulk tags rejoin only their exact cakes and preserve input order", () => {
  const cakes = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
  const tags = [
    { cake_id: "b", tag_id: "b1", sort_order: 2 },
    { cake_id: "a", tag_id: "a1", sort_order: 1 },
    { cake_id: "b", tag_id: "b2", sort_order: 1 },
  ];
  const result = attachCakeTagAssignments(cakes, tags);
  assert.deepEqual(result.map((cake) => cake.id), ["a", "b", "c"]);
  assert.deepEqual(result.map((cake) => cake.library_cake_tag_assignments.map((tag) => tag.tag_id)), [["a1"], ["b1", "b2"], []]);
  assert.deepEqual(cakes, [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }]);
});
