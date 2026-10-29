/**
 * Bound Supabase/network fetches so abandoned auth calls cannot stall
 * the Next.js process indefinitely.
 */
export function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const upstream = init?.signal;
    const signal = upstream
      ? AbortSignal.any([timeoutSignal, upstream])
      : timeoutSignal;

    return fetch(input, {
      ...init,
      signal,
    });
  };
}

/** Retry a single timed-out, idempotent GET using a fresh timeout signal. */
export function retryTimedOutGet(fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (method !== "GET" || init?.signal?.aborted) {
      return fetcher(input, init);
    }

    try {
      return await fetcher(input, init);
    } catch (error) {
      const callerCancelled = init?.signal?.aborted === true;
      const isTimeout = error instanceof Error && error.name === "TimeoutError";
      if (!isTimeout || callerCancelled) throw error;
      return fetcher(input, init);
    }
  };
}

export const AUTH_FETCH_TIMEOUT_MS = 3_000;
export const DATA_FETCH_TIMEOUT_MS = 8_000;

/** Network/timeout failures from bounded Supabase fetches. */
export function isTransientDataLoadError(message: string): boolean {
  return /aborted|abort|timeout|fetch failed|network/i.test(message);
}
