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

const CATALOGUE_DIAGNOSTIC_DEV_REF = "tzwtpxdcggesgjaqxkqr";

function isCatalogueDiagnosticPreview(url: string): boolean {
  if (process.env.VERCEL_ENV !== "preview") return false;
  try {
    return new URL(url).hostname.startsWith(
      `${CATALOGUE_DIAGNOSTIC_DEV_REF}.`,
    );
  } catch {
    return false;
  }
}

function fetchForCheckoutDateTiming(
  timeoutMs: number,
  catalogueDiagnostic = false,
): typeof fetch {
  const bounded = fetchWithTimeout(timeoutMs);
  const collector = getCheckoutDatePerfCollector();
  if (!collector && !catalogueDiagnostic) return bounded;
  return async (input, init) => {
    const started = performance.now();
    const label = supabaseFetchLabel(input);
    try {
      const response = await bounded(input, init);
      const elapsedMs = Math.round(performance.now() - started);
      if (collector) recordCheckoutDateDbCall(label, elapsedMs);
      if (catalogueDiagnostic) {
        console.info(
          "[CATALOGUE_DIAGNOSTIC]",
          JSON.stringify({
            event: "supabase_fetch",
            executionRegion: process.env.VERCEL_REGION ?? null,
            label,
            method: init?.method ?? "GET",
            status: response.status,
            elapsedMs,
            startedAt: new Date(Date.now() - elapsedMs).toISOString(),
          }),
        );
      }
      return response;
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - started);
      if (collector) recordCheckoutDateDbCall(label, elapsedMs);
      if (catalogueDiagnostic) {
        console.info(
          "[CATALOGUE_DIAGNOSTIC]",
          JSON.stringify({
            event: "supabase_fetch",
            executionRegion: process.env.VERCEL_REGION ?? null,
            label,
            method: init?.method ?? "GET",
            status: null,
            elapsedMs,
            startedAt: new Date(Date.now() - elapsedMs).toISOString(),
            errorName: error instanceof Error ? error.name : "UnknownError",
          }),
        );
      }
      throw error;
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
      fetch: fetchForCheckoutDateTiming(
        timeoutMs,
        isCatalogueDiagnosticPreview(url),
      ),
    },
  });
  if (collector) {
    recordCheckoutDateCreatePublicClient(performance.now() - constructStarted);
  }
  return client;
}
