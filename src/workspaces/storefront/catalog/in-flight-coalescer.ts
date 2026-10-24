/**
 * Share only a pending operation for the same key in this JavaScript instance.
 * Settled and rejected promises are removed; this is not a result cache, retry,
 * queue, or coordination mechanism between separate Vercel instances.
 */
export function coalesceInFlight<T>(
  pending: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing;

  const operation = Promise.resolve().then(load);
  pending.set(key, operation);

  const removeIfCurrent = () => {
    if (pending.get(key) === operation) pending.delete(key);
  };
  void operation.then(removeIfCurrent, removeIfCurrent);

  return operation;
}

/** Canonical key source for an unordered set of public cake IDs. */
export function normalizeCakeDisplayIds(
  cakeIds: readonly string[],
): string[] {
  return [...new Set(cakeIds.map((id) => id.trim()).filter(Boolean))].sort();
}
