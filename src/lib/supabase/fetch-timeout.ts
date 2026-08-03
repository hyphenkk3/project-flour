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

export const AUTH_FETCH_TIMEOUT_MS = 3_000;
export const DATA_FETCH_TIMEOUT_MS = 8_000;
