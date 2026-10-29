/**
 * Phase 8 design-only failure simulator.
 * Models cache/failure policy boundaries; it does not import or change app code,
 * contact Supabase, or claim to execute the installed Next.js cache runtime.
 */

export class SimulatedReadError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

export class FakeDataCache {
  constructor() {
    this.entries = new Map();
    this.invalidations = new Map();
  }

  get(key) { return this.entries.get(key) ?? null; }
  set(key, entry) { this.entries.set(key, entry); }
  tagVersion(tag) { return this.invalidations.get(tag) ?? 0; }
  invalidate(tag) {
    this.invalidations.set(tag, this.tagVersion(tag) + 1);
    for (const [key, entry] of this.entries) {
      if (entry.tags.includes(tag)) this.entries.delete(key);
    }
  }
}

export class CatalogueReader {
  constructor(result, { failures = [], delayMs = 0 } = {}) {
    this.result = result;
    this.failures = [...failures];
    this.delayMs = delayMs;
    this.calls = 0;
  }

  async read() {
    this.calls += 1;
    if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    const failure = this.failures.shift();
    if (failure) throw new SimulatedReadError(failure);
    return structuredClone(this.result);
  }
}

/** Explicit candidate policy with a hard max age and a shared invalidation tag. */
export async function readWithBoundedFallback({
  cache, key, tag, reader, now, maxAgeMs, instanceInvalidationVersion,
}) {
  const entry = cache.get(key);
  const startTagVersion = cache.tagVersion(tag);
  try {
    const result = await reader.read();
    if (cache.tagVersion(tag) !== startTagVersion) {
      throw new SimulatedReadError("invalidated-during-read");
    }
    cache.set(key, { result, cachedAt: now(), tags: [tag], tagVersion: startTagVersion });
    return { result, source: "fresh" };
  } catch (error) {
    const current = cache.get(key);
    if (!current) throw error;
    if (now() - current.cachedAt > maxAgeMs) throw error;
    if (cache.tagVersion(tag) !== current.tagVersion) throw error;
    if (instanceInvalidationVersion() !== current.tagVersion) throw error;
    return { result: structuredClone(current.result), source: "stale", cause: error.kind };
  }
}

/**
 * Models Next Data Cache stale-while-revalidate at the documented boundary:
 * a failed refresh keeps the previous successful result for another request.
 * No age cap is supplied by this model because the app does not define one.
 */
export async function readWithNextLikeStaleOnError({ cache, key, tag, reader, now }) {
  const previous = cache.get(key);
  try {
    const result = await reader.read();
    cache.set(key, { result, cachedAt: now(), tags: [tag], tagVersion: cache.tagVersion(tag) });
    return { result, source: "fresh" };
  } catch (error) {
    if (!previous) throw error;
    return { result: structuredClone(previous.result), source: "stale", cause: error.kind };
  }
}

/** Models revalidateTag(tag, "max"): mark stale for refresh but retain old data. */
export function markStaleWhileRevalidate(cache, tag) {
  cache.invalidations.set(tag, cache.tagVersion(tag) + 1);
}

export function currentUnavailable(error) {
  return { state: "unavailable", error: error.kind, orderable: false };
}

export function classifyEmptyOrError({ ok, data, error }) {
  if (!ok || error) return { state: "unavailable", orderable: false };
  return { state: data.length === 0 ? "genuine-empty" : "available", data };
}

export async function simulateOverlappingRequests(reader, count = 3) {
  const results = await Promise.allSettled(Array.from({ length: count }, () => reader.read()));
  return { results, calls: reader.calls };
}

export function coalesceWithinOneProcess(read) {
  const pending = new Map();
  return key => {
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(read).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}
