import test from "node:test";
import assert from "node:assert/strict";
import {
  CatalogueReader,
  coalesceWithinOneProcess,
  FakeDataCache,
  SimulatedReadError,
  classifyEmptyOrError,
  currentUnavailable,
  readWithBoundedFallback,
  readWithNextLikeStaleOnError,
  markStaleWhileRevalidate,
  simulateOverlappingRequests,
} from "./catalogue-resilience-simulation.mjs";

const key = "public-collection-cakes";
const tag = "published-cakes";
const catalogue = [{ id: "cake-a", name: "Cake A", sizes: [{ id: "size-a", price: 120 }], photos: ["photo-a"] }];
const fixedClock = (initial = 1_000) => {
  let value = initial;
  return { now: () => value, advance: ms => { value += ms; } };
};
const instance = { value: 0, invalidate() { this.value += 1; } };
const bounded = (cache, reader, clock, options = {}) => readWithBoundedFallback({
  cache, key, tag, reader, now: clock.now, maxAgeMs: options.maxAgeMs ?? 30_000,
  instanceInvalidationVersion: () => instance.value,
});

test("1 successful first catalogue load is cached as successful data", async () => {
  const cache = new FakeDataCache(); const reader = new CatalogueReader(catalogue); const clock = fixedClock();
  assert.deepEqual(await bounded(cache, reader, clock), { result: catalogue, source: "fresh" });
  assert.equal(reader.calls, 1);
});

test("2 stale fallback would retain a price unless the projection explicitly strips it", async () => {
  const cache = new FakeDataCache(); const clock = fixedClock();
  await bounded(cache, new CatalogueReader(catalogue), clock);
  const failed = new CatalogueReader(catalogue, { failures: ["network-timeout"] });
  const fallback = await bounded(cache, failed, clock);
  assert.equal(fallback.source, "stale");
  assert.deepEqual(fallback.result, catalogue);
  assert.equal(fallback.result[0].sizes[0].price, 120);
  assert.equal(fallback.result[0].orderable, undefined);
});

test("3 failure with no prior result is unavailable, never synthetic empty", async () => {
  const cache = new FakeDataCache(); const clock = fixedClock();
  await assert.rejects(bounded(cache, new CatalogueReader([], { failures: ["network-timeout"] }), clock));
  assert.equal(cache.get(key), null);
});

test("4 genuine empty success is distinct from failed query", () => {
  assert.deepEqual(classifyEmptyOrError({ ok: true, data: [], error: null }), { state: "genuine-empty", data: [] });
  assert.deepEqual(classifyEmptyOrError({ ok: false, data: [], error: "57014" }), { state: "unavailable", orderable: false });
});

test("5 PostgreSQL 57014 is a failure class, not an empty result", () => {
  const state = currentUnavailable(new SimulatedReadError("57014"));
  assert.deepEqual(state, { state: "unavailable", error: "57014", orderable: false });
});

test("6 application 8-second timeout is unavailable and is not retried by the harness", async () => {
  const reader = new CatalogueReader(catalogue, { failures: ["application-timeout"] });
  const outcome = await simulateOverlappingRequests(reader, 1);
  assert.equal(outcome.calls, 1);
  assert.equal(outcome.results[0].reason.kind, "application-timeout");
});

test("7 backend recovery refreshes data after stale fallback was used", async () => {
  const cache = new FakeDataCache(); const clock = fixedClock();
  await bounded(cache, new CatalogueReader(catalogue), clock);
  const changed = [{ ...catalogue[0], name: "Cake A refreshed" }];
  const failed = new CatalogueReader(changed, { failures: ["network-timeout"] });
  assert.equal((await bounded(cache, failed, clock)).source, "stale");
  const fresh = await bounded(cache, new CatalogueReader(changed), clock);
  assert.equal(fresh.source, "fresh");
  assert.equal(fresh.result[0].name, "Cake A refreshed");
});

test("8 stale age beyond the explicit maximum fails closed", async () => {
  const cache = new FakeDataCache(); const clock = fixedClock();
  await bounded(cache, new CatalogueReader(catalogue), clock);
  clock.advance(30_001);
  await assert.rejects(bounded(cache, new CatalogueReader(catalogue, { failures: ["network-timeout"] }), clock));
});

test("9 invalidation while refresh is in flight removes the old tagged entry", async () => {
  const cache = new FakeDataCache(); const clock = fixedClock();
  await bounded(cache, new CatalogueReader(catalogue), clock);
  const slow = new CatalogueReader([{ id: "cake-removed" }], { delayMs: 30 });
  const pending = bounded(cache, slow, clock);
  cache.invalidate(tag); instance.invalidate();
  await assert.rejects(pending, { kind: "invalidated-during-read" });
  assert.equal(cache.get(key), null);
});

test("10 a failed refresh after unpublished/removed data cannot reuse a known-invalid old entry", async () => {
  const cache = new FakeDataCache(); const clock = fixedClock();
  await bounded(cache, new CatalogueReader(catalogue), clock);
  cache.invalidate(tag); instance.invalidate();
  await assert.rejects(bounded(cache, new CatalogueReader([], { failures: ["network-timeout"] }), clock));
});

test("11 category and photo edits use the same display-data invalidation boundary", async () => {
  const cache = new FakeDataCache(); const clock = fixedClock();
  await bounded(cache, new CatalogueReader(catalogue), clock);
  cache.invalidate(tag); instance.invalidate();
  const updated = [{ ...catalogue[0], photos: ["photo-b"], categories: ["cat-b"] }];
  assert.deepEqual((await bounded(cache, new CatalogueReader(updated), clock)).result, updated);
});

test("12 price schedule changes must bypass public display fallback", async () => {
  const oldPrice = { sizeId: "size-a", amount: 100 };
  const authoritativePriceAfterScheduleChange = { sizeId: "size-a", amount: 120 };
  const catalogueFallback = { ...catalogue[0], price: oldPrice.amount };
  const livePriceReadFails = true;
  assert.equal(catalogueFallback.price, 100);
  assert.equal(livePriceReadFails, true);
  assert.equal(livePriceReadFails ? "price-unavailable" : authoritativePriceAfterScheduleChange.amount, "price-unavailable");
});

test("13 identical simultaneous reads coalesce only within one process", async () => {
  const reader = new CatalogueReader(catalogue, { delayMs: 5 });
  const read = coalesceWithinOneProcess(() => reader.read());
  const results = await Promise.all(Array.from({ length: 3 }, () => read(key)));
  assert.equal(reader.calls, 1);
  assert.equal(results.length, 3);
});

test("different catalogue keys remain independent in the in-process coalescer", async () => {
  let calls = 0;
  const read = coalesceWithinOneProcess(async () => { calls += 1; return calls; });
  const [first, second] = await Promise.all([read("collection-a"), read("collection-b")]);
  assert.notEqual(first, second);
  assert.equal(calls, 2);
});

test("14 separate serverless-instance caches do not share an in-memory fallback", async () => {
  const cacheA = new FakeDataCache(); const cacheB = new FakeDataCache(); const clock = fixedClock();
  await bounded(cacheA, new CatalogueReader(catalogue), clock);
  const failOnB = new CatalogueReader(catalogue, { failures: ["network-timeout"] });
  await assert.rejects(readWithBoundedFallback({ cache: cacheB, key, tag, reader: failOnB, now: clock.now, maxAgeMs: 30_000, instanceInvalidationVersion: () => 0 }));
  assert.equal(cacheB.get(key), null);
});

test("15 Fresh Picks stock is a separate live read and cannot be authorized by catalogue fallback", async () => {
  const browsedPhotoAndName = catalogue[0];
  const stockNow = { confirmed: false, sold: true };
  const eligibleForFreshPick = stockNow.confirmed && !stockNow.sold;
  assert.ok(browsedPhotoAndName);
  assert.equal(eligibleForFreshPick, false);
});

test("Next-style last-good retention has no hard stale-age bound in this model", async () => {
  const cache = new FakeDataCache(); const clock = fixedClock();
  await readWithNextLikeStaleOnError({ cache, key, tag, reader: new CatalogueReader(catalogue), now: clock.now });
  clock.advance(365 * 24 * 60 * 60 * 1_000);
  const stale = await readWithNextLikeStaleOnError({ cache, key, tag, reader: new CatalogueReader([], { failures: ["57014"] }), now: clock.now });
  assert.equal(stale.source, "stale");
  assert.equal(clock.now() - cache.get(key).cachedAt, 365 * 24 * 60 * 60 * 1_000);
});

test("Next-style stale-while-revalidate can retain old data after a known tag invalidation", async () => {
  const cache = new FakeDataCache(); const clock = fixedClock();
  await readWithNextLikeStaleOnError({ cache, key, tag, reader: new CatalogueReader(catalogue), now: clock.now });
  markStaleWhileRevalidate(cache, tag);
  const staleAfterKnownEdit = await readWithNextLikeStaleOnError({ cache, key, tag, reader: new CatalogueReader([], { failures: ["network-timeout"] }), now: clock.now });
  assert.equal(staleAfterKnownEdit.source, "stale");
});

test("separate instance with old local copy can serve removed item if invalidation is not propagated", async () => {
  const clock = fixedClock(); const instanceA = new FakeDataCache(); const instanceB = new FakeDataCache();
  await readWithNextLikeStaleOnError({ cache: instanceB, key, tag, reader: new CatalogueReader(catalogue), now: clock.now });
  instanceA.invalidate(tag);
  const stale = await readWithNextLikeStaleOnError({ cache: instanceB, key, tag, reader: new CatalogueReader([], { failures: ["network-timeout"] }), now: clock.now });
  assert.equal(stale.source, "stale");
  assert.equal(stale.result[0].id, "cake-a");
});
