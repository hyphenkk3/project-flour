import { storefrontCakeDetailHref } from "@/engines/menu/customer-browse";

const MAX_INFLIGHT = 2;

const prefetched = new Set<string>();
const inflight = new Set<string>();
let prefetchStartCount = 0;

/**
 * Canonical cake-detail path only. Query-string URLs are never prefetched.
 */
export function canonicalCakeDetailPath(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
    return null;
  }
  try {
    const url =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? new URL(trimmed)
        : new URL(trimmed, "http://local.invalid");
    if (url.search || url.hash) return null;
    const match = url.pathname.match(/^\/cakes\/([^/]+)$/);
    if (!match?.[1]) return null;
    return storefrontCakeDetailHref(match[1]);
  } catch {
    return null;
  }
}

export function resetCakeDetailPrefetchStateForTests(): void {
  prefetched.clear();
  inflight.clear();
  prefetchStartCount = 0;
}

export function cakeDetailPrefetchStartCount(): number {
  return prefetchStartCount;
}

/** Browse cards keep 3 hrefs; viewport must not prefetch any of them. */
export function browseCakeViewportPrefetchCount(visibleCards: number): number {
  if (!Number.isFinite(visibleCards) || visibleCards < 0) return 0;
  return 0;
}

export function wasCakeDetailPrefetchedForTests(path: string): boolean {
  return prefetched.has(path);
}

/**
 * Deduped intent prefetch for canonical `/cakes/{id}` only.
 * Returns true when a new prefetch was started.
 */
export function prefetchCanonicalCakeDetail(
  href: string,
  prefetch: (path: string) => void | Promise<unknown>,
  options?: { urgent?: boolean },
): boolean {
  const path = canonicalCakeDetailPath(href);
  if (!path) return false;
  if (prefetched.has(path) || inflight.has(path)) return false;
  if (!options?.urgent && inflight.size >= MAX_INFLIGHT) return false;

  inflight.add(path);
  prefetched.add(path);
  try {
    const result = prefetch(path);
    void Promise.resolve(result).then(
      () => {
        inflight.delete(path);
      },
      () => {
        inflight.delete(path);
        prefetched.delete(path);
      },
    );
    prefetchStartCount += 1;
    return true;
  } catch {
    inflight.delete(path);
    prefetched.delete(path);
    return false;
  }
}
