import { createHash, randomUUID } from "node:crypto";
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
  diagnosticContext?: {
    traceId?: string;
    cacheKeyHash?: string;
    loader?: string;
  };
};

function fetchForCheckoutDateTiming(
  timeoutMs: number,
  diagnosticContext?: CreateClientOptions["diagnosticContext"],
): typeof fetch {
  const bounded = fetchWithTimeout(timeoutMs);
  const collector = getCheckoutDatePerfCollector();
  const diagnosticsEnabled =
    process.env.STOREFRONT_CATALOGUE_DIAGNOSTICS === "1";
  if (!collector && !diagnosticsEnabled) return bounded;
  return async (input, init) => {
    const started = performance.now();
    let diagnostic:
      | {
          traceId: string;
          dbCallId: string;
          path: string;
          querySignatureHash: string;
          method: string;
          loader: string;
          cacheKeyHash: string | null;
        }
      | null = null;
    if (diagnosticsEnabled) {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const requestUrl = new URL(rawUrl);
      if (requestUrl.pathname.startsWith("/rest/v1/")) {
        const requestMethod =
          init?.method ??
          (input instanceof Request ? input.method : "GET");
        const requestBody =
          typeof init?.body === "string" ? init.body : "";
        const querySignatureHash = createHash("sha256")
          .update(
            `${requestMethod}\n${requestUrl.pathname}${requestUrl.search}\n${requestBody}`,
          )
          .digest("hex")
          .slice(0, 16);
        diagnostic = {
          traceId: diagnosticContext?.traceId ?? randomUUID(),
          dbCallId: randomUUID(),
          path: requestUrl.pathname,
          querySignatureHash,
          method: requestMethod,
          loader: diagnosticContext?.loader ?? "unlabeled-public-read",
          cacheKeyHash: diagnosticContext?.cacheKeyHash ?? null,
        };
        console.info(
          "[storefront-catalogue-db-trace]",
          JSON.stringify({
            event: "supabase_rest_start",
            at: new Date().toISOString(),
            ...diagnostic,
          }),
        );
      }
    }
    try {
      const response = await bounded(input, init);
      if (diagnostic) {
        console.info(
          "[storefront-catalogue-db-trace]",
          JSON.stringify({
            event: "supabase_rest_end",
            at: new Date().toISOString(),
            ...diagnostic,
            outcome: "response",
            httpStatus: response.status,
            durationMs: Math.round((performance.now() - started) * 100) / 100,
          }),
        );
      }
      return response;
    } catch (error) {
      if (diagnostic) {
        console.info(
          "[storefront-catalogue-db-trace]",
          JSON.stringify({
            event: "supabase_rest_end",
            at: new Date().toISOString(),
            ...diagnostic,
            outcome: "network-error",
            errorType: error instanceof Error ? error.name : "unknown",
            durationMs: Math.round((performance.now() - started) * 100) / 100,
          }),
        );
      }
      throw error;
    } finally {
      if (collector) {
        recordCheckoutDateDbCall(
          supabaseFetchLabel(input),
          performance.now() - started,
        );
      }
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
      fetch: fetchForCheckoutDateTiming(timeoutMs, options?.diagnosticContext),
    },
  });
  if (collector) {
    recordCheckoutDateCreatePublicClient(performance.now() - constructStarted);
  }
  return client;
}
