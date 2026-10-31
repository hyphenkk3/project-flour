/**
 * Deduplicates identical price lookups only for the lifetime of the caller's
 * explicitly-created context. The caller must create a new context per render
 * or request; this module intentionally holds no shared mutable state.
 */
export type RequestScopedPriceContext = {
  promises: Map<string, Promise<number>>;
};

export function createRequestScopedPriceContext(): RequestScopedPriceContext {
  return { promises: new Map() };
}

export function resolveRequestScopedPrice(
  context: RequestScopedPriceContext,
  sizeId: string,
  priceDate: string,
  load: () => Promise<number>,
): Promise<number> {
  const key = JSON.stringify([sizeId, priceDate]);
  const existing = context.promises.get(key);
  if (existing) return existing;

  const pending = load().catch((error: unknown) => {
    if (context.promises.get(key) === pending) context.promises.delete(key);
    throw error;
  });
  context.promises.set(key, pending);
  return pending;
}
