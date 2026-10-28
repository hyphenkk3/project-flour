/** Only in-flight public catalogue reads are shared; settled results live in Next's tagged cache. */
const MAX_IN_FLIGHT_READS = 64;
const inFlight = new Map<string, Promise<unknown>>();
let invalidationGeneration = 0;

export function notePublishedCakeInvalidation(): void {
  invalidationGeneration += 1;
}

export function coalescePublicCakeRead<T>(
  cakeIdsKey: string,
  read: () => Promise<T>,
): Promise<T> {
  const key = `${invalidationGeneration}:${cakeIdsKey}`;
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  if (inFlight.size >= MAX_IN_FLIGHT_READS) return read();

  const pending = Promise.resolve().then(read).finally(() => {
    if (inFlight.get(key) === pending) inFlight.delete(key);
  });
  inFlight.set(key, pending);
  return pending;
}

export async function retryStatementTimeoutRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/canceling statement due to statement timeout/i.test(message)) {
      throw error;
    }
    return read();
  }
}
