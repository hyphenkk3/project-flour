/**
 * Transient storefront browsing context for in-app Cake Detail
 * navigation. Not checkout submission state — sessionStorage only.
 *
 * Carries pickup window (`from` / `to` / `pickup`) and the single
 * contextual back destination (collection / browse / Home fallback).
 *
 * Explicit `?pickup&from&to` on the cake URL still wins for pickup
 * when present. Back navigation never uses URL params — those cannot
 * reconstruct a collection identity.
 */

export const CAKE_ENTRY_SCOPE_STORAGE_KEY = "whitebird-cake-entry-scope-v1";
export const CAKE_ENTRY_SCOPE_MARKER = "data-cake-entry-scope";

const MAX_AGE_MS = 30 * 60 * 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const COLLECTION_ID = /^[A-Za-z0-9_-]{8,80}$/;
const COLLECTION_NAME_MAX = 80;

export type CakeEntryOriginKind = "browse" | "collection" | "home";

export type CakeEntryPickupScope = {
  from: string;
  to: string;
  pickup: string | null;
};

export type CakeEntryCaptureScope = {
  from?: string;
  to?: string;
  pickup?: string | null;
  origin?: CakeEntryOriginKind;
  collectionId?: string;
  collectionName?: string;
};

export type CakeEntryScopeRecord = CakeEntryPickupScope & {
  cakeId: string;
  capturedAt: number;
  origin?: CakeEntryOriginKind;
  collectionId?: string;
  collectionName?: string;
};

export type CakeDetailBackNav = {
  href: string;
  label: string;
};

export const CAKE_DETAIL_HOME_BACK: CakeDetailBackNav = {
  href: "/",
  label: "← Whitebird",
};

export const CAKE_DETAIL_BROWSE_BACK: CakeDetailBackNav = {
  href: "/browse",
  label: "← All Cakes",
};

function isYmd(value: string): boolean {
  return YMD.test(value);
}

function readYmd(value: string | null | undefined): string {
  return value?.trim().slice(0, 10) ?? "";
}

export function parseCollectionId(value: string | null | undefined): string | null {
  const id = value?.trim() ?? "";
  return COLLECTION_ID.test(id) ? id : null;
}

export function parseCollectionName(
  value: string | null | undefined,
): string | null {
  const name = value?.trim().replace(/\s+/g, " ") ?? "";
  if (name.length < 1 || name.length > COLLECTION_NAME_MAX) return null;
  if (/[<>\n\r]/.test(name)) return null;
  return name;
}

export function storefrontCollectionCakesPath(collectionId: string): string {
  return `/order/collection/${collectionId}`;
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

function collectionOriginFrom(
  origin: unknown,
  collectionId: unknown,
  collectionName: unknown,
): Pick<CakeEntryScopeRecord, "origin" | "collectionId" | "collectionName"> {
  if (origin === "browse") return { origin: "browse" };
  if (origin === "home") return { origin: "home" };
  if (origin === "collection") {
    const id = parseCollectionId(
      typeof collectionId === "string" ? collectionId : null,
    );
    const name = parseCollectionName(
      typeof collectionName === "string" ? collectionName : null,
    );
    if (id && name) {
      return { origin: "collection", collectionId: id, collectionName: name };
    }
  }
  return {};
}

export function resolveCakeDetailBackNav(
  stored: CakeEntryScopeRecord | null,
): CakeDetailBackNav {
  if (!stored) return CAKE_DETAIL_HOME_BACK;
  if (
    stored.origin === "collection" &&
    stored.collectionId &&
    stored.collectionName
  ) {
    return {
      href: storefrontCollectionCakesPath(stored.collectionId),
      label: `← ${stored.collectionName}`,
    };
  }
  if (stored.origin === "browse") return CAKE_DETAIL_BROWSE_BACK;
  return CAKE_DETAIL_HOME_BACK;
}

function parseRecord(raw: string): CakeEntryScopeRecord | null {
  try {
    const data = JSON.parse(raw) as Partial<CakeEntryScopeRecord>;
    if (typeof data.cakeId !== "string" || !data.cakeId) return null;
    if (typeof data.capturedAt !== "number" || !Number.isFinite(data.capturedAt)) {
      return null;
    }
    const from =
      typeof data.from === "string" && isYmd(data.from) ? data.from : "";
    const to = typeof data.to === "string" && isYmd(data.to) ? data.to : "";
    const pickup =
      typeof data.pickup === "string" && isYmd(data.pickup) ? data.pickup : null;
    const originFields = collectionOriginFrom(
      data.origin,
      data.collectionId,
      data.collectionName,
    );
    if (!isYmd(from) && !isYmd(to) && !originFields.origin) return null;
    return {
      cakeId: data.cakeId,
      from,
      to,
      pickup,
      capturedAt: data.capturedAt,
      ...originFields,
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
  from?: string;
  to?: string;
  pickup?: string | null;
  origin?: CakeEntryOriginKind;
  collectionId?: string;
  collectionName?: string;
}): void {
  if (typeof window === "undefined") return;
  if (!input.cakeId) return;
  const from = readYmd(input.from);
  const to = readYmd(input.to);
  const hasPickup = isYmd(from) && isYmd(to);
  const originFields = collectionOriginFrom(
    input.origin,
    input.collectionId,
    input.collectionName,
  );
  if (!hasPickup && !originFields.origin) return;
  const pickupRaw = readYmd(input.pickup ?? "");
  const record: CakeEntryScopeRecord = {
    cakeId: input.cakeId,
    from: hasPickup ? from : "",
    to: hasPickup ? to : "",
    pickup: hasPickup && isYmd(pickupRaw) ? pickupRaw : null,
    capturedAt: Date.now(),
    ...originFields,
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
