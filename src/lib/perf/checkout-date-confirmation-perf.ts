import { AsyncLocalStorage } from "node:async_hooks";
import { isDevPerfEnabled } from "@/lib/perf/dev-only-shared";
import type {
  CheckoutDateConfirmationPerf,
  CheckoutDateConfirmationPerfCall,
} from "@/lib/perf/checkout-date-confirmation-perf-shared";

export type {
  CheckoutDateConfirmationPerf,
  CheckoutDateConfirmationPerfCall,
} from "@/lib/perf/checkout-date-confirmation-perf-shared";

type CheckoutDatePerfCollector = {
  cookiesMs: number;
  createClientMs: number;
  createClientCount: number;
  createPublicClientMs: number;
  createPublicClientCount: number;
  headersMs: number;
  stages: Record<string, number>;
  dbCalls: CheckoutDateConfirmationPerfCall[];
  vercelRegion: string | null;
  vercelIdRegions: string | null;
  runtime: string;
};

const checkoutDatePerf = new AsyncLocalStorage<CheckoutDatePerfCollector>();

export function getCheckoutDatePerfCollector(): CheckoutDatePerfCollector | null {
  return checkoutDatePerf.getStore() ?? null;
}

function createCollector(): CheckoutDatePerfCollector {
  return {
    cookiesMs: 0,
    createClientMs: 0,
    createClientCount: 0,
    createPublicClientMs: 0,
    createPublicClientCount: 0,
    headersMs: 0,
    stages: {},
    dbCalls: [],
    vercelRegion: null,
    vercelIdRegions: null,
    runtime: process.env.NEXT_RUNTIME === "edge" ? "edge" : "nodejs",
  };
}

export function runWithCheckoutDatePerf<T>(fn: () => T): T {
  return checkoutDatePerf.run(createCollector(), fn);
}

export function recordCheckoutDateStage(name: string, ms: number): void {
  const collector = getCheckoutDatePerfCollector();
  if (!collector) return;
  collector.stages[name] = Math.round(ms);
}

export async function timeCheckoutDateStage<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await fn();
  } finally {
    recordCheckoutDateStage(name, performance.now() - started);
  }
}

export function recordCheckoutDateCookies(ms: number): void {
  const collector = getCheckoutDatePerfCollector();
  if (!collector) return;
  collector.cookiesMs += ms;
}

export function recordCheckoutDateCreateClient(ms: number): void {
  const collector = getCheckoutDatePerfCollector();
  if (!collector) return;
  collector.createClientMs += ms;
  collector.createClientCount += 1;
}

export function recordCheckoutDateCreatePublicClient(ms: number): void {
  const collector = getCheckoutDatePerfCollector();
  if (!collector) return;
  collector.createPublicClientMs += ms;
  collector.createPublicClientCount += 1;
}

export function recordCheckoutDateHeaders(ms: number): void {
  const collector = getCheckoutDatePerfCollector();
  if (!collector) return;
  collector.headersMs += ms;
}

export function recordCheckoutDateTopology(input: {
  vercelRegion: string | null;
  vercelIdRegions: string | null;
}): void {
  const collector = getCheckoutDatePerfCollector();
  if (!collector) return;
  collector.vercelRegion = input.vercelRegion;
  collector.vercelIdRegions = input.vercelIdRegions;
}

export function recordCheckoutDateDbCall(label: string, ms: number): void {
  const collector = getCheckoutDatePerfCollector();
  if (!collector) return;
  collector.dbCalls.push({
    label,
    ms: Math.round(ms),
  });
}

/** Keep only Vercel region tokens from x-vercel-id. Never keep the request hash. */
export function sanitizeVercelIdRegions(raw: string | null): string | null {
  if (!raw) return null;
  const regions = raw
    .split("::")
    .filter((part) => /^[a-z]{3}\d+$/i.test(part));
  return regions.length > 0 ? regions.join("::") : null;
}

export function supabaseFetchLabel(input: RequestInfo | URL): string {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const pathname = new URL(raw).pathname;
    if (pathname.startsWith("/auth/v1/")) {
      return `auth/${pathname.slice("/auth/v1/".length)}`;
    }
    return pathname.replace(/^\/rest\/v1\//, "") || "supabase";
  } catch {
    return "supabase";
  }
}

export function snapshotCheckoutDateConfirmationPerf(
  totalMs: number,
): CheckoutDateConfirmationPerf | undefined {
  if (!isDevPerfEnabled()) return undefined;
  const collector = getCheckoutDatePerfCollector();
  if (!collector) return undefined;
  const total = Math.round(totalMs);
  const dbSum = collector.dbCalls.reduce((sum, call) => sum + call.ms, 0);
  const dbMax = collector.dbCalls.reduce(
    (max, call) => Math.max(max, call.ms),
    0,
  );
  const stages = collector.stages;
  const outsideDb = Math.max(0, total - dbSum);
  return {
    date_confirmation_total_ms: total,
    cookies_ms: Math.round(collector.cookiesMs),
    create_client_ms: Math.round(collector.createClientMs),
    create_client_count: collector.createClientCount,
    create_public_client_ms: Math.round(collector.createPublicClientMs),
    create_public_client_count: collector.createPublicClientCount,
    headers_ms: Math.round(collector.headersMs),
    auth_ms: 0,
    calendar_ms: stages.calendar ?? 0,
    catalogues_ms: stages.catalogues ?? 0,
    specials_ms: stages.specials ?? 0,
    hours_ms: stages.hours ?? 0,
    memberships_ms: stages.memberships ?? 0,
    venue_photos_ms: stages.venue_photos ?? 0,
    closures_ms: stages.closures ?? 0,
    collection_ms: stages.collection ?? 0,
    cakes_ms: stages.cakes ?? 0,
    options_ms: stages.options ?? 0,
    capacity_ms: 0,
    preorder_days_ms: 0,
    voucher_ms: 0,
    promise_all_ms: stages.promise_all ?? 0,
    response_build_ms: stages.response_build ?? 0,
    db_rpc_sum_ms: dbSum,
    db_rpc_count: collector.dbCalls.length,
    db_rpc_max_ms: dbMax,
    outside_db_ms: outsideDb,
    db_overlap_ms: Math.max(0, dbSum - total),
    unexplained_ms: outsideDb,
    vercel_region: collector.vercelRegion,
    vercel_id_regions: collector.vercelIdRegions,
    runtime: collector.runtime,
    middleware_auth: "skipped_public_path",
    db_rpc_calls: collector.dbCalls.slice(0, 24),
  };
}
