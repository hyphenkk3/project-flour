import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  DATA_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
} from "@/lib/supabase/fetch-timeout";
import {
  getCheckoutDatePerfCollector,
  recordCheckoutDateCookies,
  recordCheckoutDateCreateClient,
  recordCheckoutDateCreatePublicClient,
  recordCheckoutDateDbCall,
  supabaseFetchLabel,
} from "@/lib/perf/checkout-date-confirmation-perf";

type CreateClientOptions = {
  /** Abort in-flight Supabase fetches after this many ms. */
  timeoutMs?: number;
};

function fetchForCheckoutDateTiming(timeoutMs: number): typeof fetch {
  const bounded = fetchWithTimeout(timeoutMs);
  const collector = getCheckoutDatePerfCollector();
  if (!collector) return bounded;
  return async (input, init) => {
    const started = performance.now();
    try {
      return await bounded(input, init);
    } finally {
      recordCheckoutDateDbCall(
        supabaseFetchLabel(input),
        performance.now() - started,
      );
    }
  };
}

export async function createClient(options?: CreateClientOptions) {
  const collector = getCheckoutDatePerfCollector();
  const cookiesStarted = performance.now();
  const cookieStore = await cookies();
  if (collector) {
    recordCheckoutDateCookies(performance.now() - cookiesStarted);
  }
  const constructStarted = performance.now();
  const { url, anonKey } = getSupabaseEnv();
  const timeoutMs = options?.timeoutMs ?? DATA_FETCH_TIMEOUT_MS;

  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            cookieStore.set(name, value, cookieOptions);
          });
        } catch {
          // Called from a Server Component where cookies are read-only.
        }
      },
    },
    global: {
      fetch: fetchForCheckoutDateTiming(timeoutMs),
    },
  });
  if (collector) {
    recordCheckoutDateCreateClient(performance.now() - constructStarted);
  }
  return client;
}

/**
 * Cookie-free anon client for public catalogue reads.
 * Does not call cookies(), so the query can run in a cacheable Server Component path.
 */
export function createPublicClient(options?: CreateClientOptions) {
  const collector = getCheckoutDatePerfCollector();
  const constructStarted = performance.now();
  const { url, anonKey } = getSupabaseEnv();
  const timeoutMs = options?.timeoutMs ?? DATA_FETCH_TIMEOUT_MS;

  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {},
    },
    global: {
      fetch: fetchForCheckoutDateTiming(timeoutMs),
    },
  });
  if (collector) {
    recordCheckoutDateCreatePublicClient(performance.now() - constructStarted);
  }
  return client;
}
