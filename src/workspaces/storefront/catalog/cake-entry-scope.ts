/**
 * Transient storefront browsing pickup window for in-app Cake Detail
 * navigation. Not checkout submission state — sessionStorage only.
 *
 * Explicit `?pickup&from&to` on the cake URL still wins when present.
 */

export const CAKE_ENTRY_SCOPE_STORAGE_KEY = "whitebird-cake-entry-scope-v1";
export const CAKE_ENTRY_SCOPE_MARKER = "data-cake-entry-scope";

const MAX_AGE_MS = 30 * 60 * 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type CakeEntryPickupScope = {
  from: string;
  to: string;
  pickup: string | null;
};

export type CakeEntryScopeRecord = CakeEntryPickupScope & {
  cakeId: string;
  capturedAt: number;
};

function isYmd(value: string): boolean {
  return YMD.test(value);
}

function readYmd(value: string | null | undefined): string {
  return value?.trim().slice(0, 10) ?? "";
}

export function cakeIdFromHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
    return null;
  }
  try {
    const url = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? new URL(trimmed)
      : new URL(trimmed, "http://local.invalid");
    const match = url.pathname.match(/^\/cakes\/([^/]+)$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function parseCakeDetailPickupSearchParams(query: {
  get(name: string): string | null;
}): CakeEntryPickupScope | null {
  const from = readYmd(query.get("from"));
  const to = readYmd(query.get("to"));
  const pickup = readYmd(query.get("pickup"));
  if (!isYmd(from) || !isYmd(to)) return null;
  return {
    from,
    to,
    pickup: isYmd(pickup) ? pickup : null,
  };
}

export function resolveCakeDetailPickupScope(input: {
  cakeId: string;
  searchParams: { get(name: string): string | null };
  stored: CakeEntryScopeRecord | null;
}): CakeEntryPickupScope | null {
  const fromUrl = parseCakeDetailPickupSearchParams(input.searchParams);
  if (fromUrl) return fromUrl;
  if (
    input.stored &&
    input.stored.cakeId === input.cakeId &&
    isYmd(input.stored.from) &&
    isYmd(input.stored.to)
  ) {
    return {
      from: input.stored.from,
      to: input.stored.to,
      pickup:
        input.stored.pickup && isYmd(input.stored.pickup)
          ? input.stored.pickup
          : null,
    };
  }
  return null;
}

function parseRecord(raw: string): CakeEntryScopeRecord | null {
  try {
    const data = JSON.parse(raw) as Partial<CakeEntryScopeRecord>;
    if (typeof data.cakeId !== "string" || !data.cakeId) return null;
    if (typeof data.from !== "string" || !isYmd(data.from)) return null;
    if (typeof data.to !== "string" || !isYmd(data.to)) return null;
    if (typeof data.capturedAt !== "number" || !Number.isFinite(data.capturedAt)) {
      return null;
    }
    const pickup =
      typeof data.pickup === "string" && isYmd(data.pickup) ? data.pickup : null;
    return {
      cakeId: data.cakeId,
      from: data.from,
      to: data.to,
      pickup,
      capturedAt: data.capturedAt,
    };
  } catch {
    return null;
  }
}

const SCOPE_CHANGE_EVENT = "whitebird-cake-entry-scope";

let cachedRaw: string | null | undefined;
let cachedRecord: CakeEntryScopeRecord | null = null;

function rememberSnapshot(
  raw: string | null,
  record: CakeEntryScopeRecord | null,
): void {
  cachedRaw = raw;
  cachedRecord = record;
}

function emitScopeChange(): void {
  cachedRaw = undefined;
  cachedRecord = null;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SCOPE_CHANGE_EVENT));
}

export function subscribeCakeEntryScope(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SCOPE_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(SCOPE_CHANGE_EVENT, onStoreChange);
}

function peekStoredRecord(): CakeEntryScopeRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CAKE_ENTRY_SCOPE_STORAGE_KEY);
    if (raw === cachedRaw) {
      if (
        cachedRecord &&
        Date.now() - cachedRecord.capturedAt > MAX_AGE_MS
      ) {
        return null;
      }
      return cachedRecord;
    }
    if (!raw) {
      rememberSnapshot(null, null);
      return null;
    }
    const record = parseRecord(raw);
    if (!record || Date.now() - record.capturedAt > MAX_AGE_MS) {
      rememberSnapshot(raw, null);
      return null;
    }
    rememberSnapshot(raw, record);
    return record;
  } catch {
    return null;
  }
}

export function getStoredCakeEntryScopeSnapshot(
  cakeId: string,
): CakeEntryScopeRecord | null {
  if (!cakeId) return null;
  const record = peekStoredRecord();
  if (!record || record.cakeId !== cakeId) return null;
  return record;
}

export function writeStoredCakeEntryScope(input: {
  cakeId: string;
  from: string;
  to: string;
  pickup?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const from = readYmd(input.from);
  const to = readYmd(input.to);
  if (!input.cakeId || !isYmd(from) || !isYmd(to)) return;
  const pickupRaw = readYmd(input.pickup ?? "");
  const record: CakeEntryScopeRecord = {
    cakeId: input.cakeId,
    from,
    to,
    pickup: isYmd(pickupRaw) ? pickupRaw : null,
    capturedAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(
      CAKE_ENTRY_SCOPE_STORAGE_KEY,
      JSON.stringify(record),
    );
    emitScopeChange();
  } catch {
    // sessionStorage unavailable — canonical cake detail still works without scope.
  }
}

export function clearStoredCakeEntryScope(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CAKE_ENTRY_SCOPE_STORAGE_KEY);
    emitScopeChange();
  } catch {
    // ignore
  }
}

export function readStoredCakeEntryScope(
  cakeId: string,
): CakeEntryScopeRecord | null {
  const matched = getStoredCakeEntryScopeSnapshot(cakeId);
  if (matched) return matched;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CAKE_ENTRY_SCOPE_STORAGE_KEY);
    if (!raw) return null;
    const record = parseRecord(raw);
    if (!record || Date.now() - record.capturedAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(CAKE_ENTRY_SCOPE_STORAGE_KEY);
      rememberSnapshot(null, null);
      return null;
    }
    return null;
  } catch {
    return null;
  }
}
