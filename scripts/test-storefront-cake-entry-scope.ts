/**
 * Slice 1 — canonical in-app Collection cake hrefs + pickup scope storage.
 * Run: npx tsx scripts/test-storefront-cake-entry-scope.ts
 *
 * Does not call Supabase or mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectionScopedCakeHref,
  storefrontCakeDetailHref,
} from "@/engines/menu/customer-browse";
import {
  CAKE_ENTRY_SCOPE_STORAGE_KEY,
  cakeIdFromHref,
  clearStoredCakeEntryScope,
  parseCakeDetailPickupSearchParams,
  readStoredCakeEntryScope,
  resolveCakeDetailPickupScope,
  writeStoredCakeEntryScope,
} from "@/workspaces/storefront/catalog/cake-entry-scope";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function withDraftStorage(run: () => void): void {
  const data = new Map<string, string>();
  const previous = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
          data.set(key, value);
        },
        removeItem: (key: string) => {
          data.delete(key);
        },
      },
      dispatchEvent: () => true,
    },
  });
  try {
    run();
  } finally {
    if (previous === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previous,
      });
    }
  }
}

const CAKE_ID = "adad3bfa-8f40-46ec-afc4-ab03144a027c";

assert.equal(storefrontCakeDetailHref(CAKE_ID), `/cakes/${CAKE_ID}`);
assert.doesNotMatch(storefrontCakeDetailHref(CAKE_ID), /\?/);
assert.equal(
  collectionScopedCakeHref({
    cakeId: CAKE_ID,
    pickupDate: "2026-09-01",
    from: "2026-09-01",
    to: "2026-09-30",
  }),
  `/cakes/${CAKE_ID}?pickup=2026-09-01&from=2026-09-01&to=2026-09-30`,
);

assert.equal(cakeIdFromHref(`/cakes/${CAKE_ID}`), CAKE_ID);
assert.equal(
  cakeIdFromHref(`/cakes/${CAKE_ID}?pickup=2026-09-01&from=2026-09-01&to=2026-09-30`),
  CAKE_ID,
);
assert.equal(cakeIdFromHref("/browse"), null);

const params = new URLSearchParams(
  "pickup=2026-09-01&from=2026-09-01&to=2026-09-30",
);
assert.deepEqual(parseCakeDetailPickupSearchParams(params), {
  from: "2026-09-01",
  to: "2026-09-30",
  pickup: "2026-09-01",
});
assert.equal(
  parseCakeDetailPickupSearchParams(new URLSearchParams()),
  null,
);

const stored = {
  cakeId: CAKE_ID,
  from: "2026-09-01",
  to: "2026-09-30",
  pickup: "2026-09-01",
  capturedAt: Date.now(),
};

assert.deepEqual(
  resolveCakeDetailPickupScope({
    cakeId: CAKE_ID,
    searchParams: params,
    stored: {
      ...stored,
      from: "2026-10-01",
      to: "2026-10-31",
      pickup: "2026-10-01",
    },
  }),
  {
    from: "2026-09-01",
    to: "2026-09-30",
    pickup: "2026-09-01",
  },
  "explicit URL params win over stored scope",
);

assert.deepEqual(
  resolveCakeDetailPickupScope({
    cakeId: CAKE_ID,
    searchParams: new URLSearchParams(),
    stored,
  }),
  {
    from: "2026-09-01",
    to: "2026-09-30",
    pickup: "2026-09-01",
  },
  "stored scope is used when URL params are absent",
);

assert.equal(
  resolveCakeDetailPickupScope({
    cakeId: CAKE_ID,
    searchParams: new URLSearchParams(),
    stored: null,
  }),
  null,
  "direct canonical cake detail works with no scope",
);

assert.equal(
  resolveCakeDetailPickupScope({
    cakeId: CAKE_ID,
    searchParams: new URLSearchParams(),
    stored: { ...stored, cakeId: "other-cake" },
  }),
  null,
  "stored scope for a different cake is ignored",
);

withDraftStorage(() => {
  writeStoredCakeEntryScope({
    cakeId: CAKE_ID,
    from: "2026-09-01",
    to: "2026-09-30",
    pickup: "2026-09-01",
  });
  const raw = window.sessionStorage.getItem(CAKE_ENTRY_SCOPE_STORAGE_KEY);
  assert.ok(raw);
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(parsed.cakeId, CAKE_ID);
  assert.equal(parsed.from, "2026-09-01");
  assert.equal(parsed.to, "2026-09-30");
  assert.equal(parsed.pickup, "2026-09-01");
  assert.equal(typeof parsed.capturedAt, "number");
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ["cakeId", "capturedAt", "from", "pickup", "to"],
  );
  const read = readStoredCakeEntryScope(CAKE_ID);
  assert.equal(read?.from, "2026-09-01");
  assert.equal(readStoredCakeEntryScope("other-cake"), null);
  clearStoredCakeEntryScope();
  assert.equal(readStoredCakeEntryScope(CAKE_ID), null);
});

withDraftStorage(() => {
  window.sessionStorage.setItem(
    CAKE_ENTRY_SCOPE_STORAGE_KEY,
    JSON.stringify({
      cakeId: CAKE_ID,
      from: "2026-09-01",
      to: "2026-09-30",
      pickup: "2026-09-01",
      capturedAt: Date.now() - 31 * 60 * 1000,
    }),
  );
  assert.equal(readStoredCakeEntryScope(CAKE_ID), null);
  assert.equal(window.sessionStorage.getItem(CAKE_ENTRY_SCOPE_STORAGE_KEY), null);
});

const homeSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.match(homeSrc, /storefrontCakeDetailHref/);
assert.match(homeSrc, /CakeEntryScopeCapture/);
assert.doesNotMatch(homeSrc, /collectionScopedCakeHref/);
assert.doesNotMatch(homeSrc, /\/cakes\/\$\{[^}]+\}\?/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionSrc, /storefrontCakeDetailHref/);
assert.match(collectionSrc, /CakeEntryScopeCapture/);
assert.doesNotMatch(collectionSrc, /collectionScopedCakeHref/);
assert.doesNotMatch(collectionSrc, /\/cakes\/\$\{[^}]+\}\?/);

const popularSrc = readSrc(
  "src/workspaces/storefront/home/HomePopularCakes.tsx",
);
assert.match(popularSrc, /href=\{`\/cakes\/\$\{cake\.id\}`\}/);
assert.match(popularSrc, /prefetch/);
assert.doesNotMatch(popularSrc, /CakeEntryScopeCapture/);
assert.doesNotMatch(popularSrc, /collectionScopedCakeHref/);

const cardSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeCard.tsx",
);
assert.match(cardSrc, /StorefrontCakeDetailLink/);
assert.match(cardSrc, /detailHref \?\? `\/cakes\/\$\{cake\.id\}`/);
assert.doesNotMatch(cardSrc, /prefetch=\{false\}/);

const browseSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
);
assert.match(browseSrc, /listBrowsePublishedCakes/);
assert.doesNotMatch(browseSrc, /detailHrefs/);
assert.doesNotMatch(browseSrc, /CakeEntryScopeCapture scopes/);
assert.match(browseSrc, /CakeEntryScopeClearOnUnscopedCakeClick/);

const pageSrc = readSrc("src/app/cakes/[id]/page.tsx");
assert.match(pageSrc, /params: Promise<\{ id: string \}>/);
assert.match(pageSrc, /searchParams/);
assert.doesNotMatch(pageSrc, /cookies\(/);

const detailSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
assert.match(detailSrc, /getBrowsePublishedCakeById/);
assert.match(detailSrc, /searchParams/);
assert.doesNotMatch(detailSrc, /cookies\(/);
assert.doesNotMatch(detailSrc, /useSearchParams/);

const pickupScopeSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPickupScope.tsx",
);
assert.doesNotMatch(pickupScopeSrc, /useSearchParams/);
assert.match(pickupScopeSrc, /urlFrom/);
assert.match(pickupScopeSrc, /getStoredCakeEntryScopeSnapshot/);
assert.match(pickupScopeSrc, /useSyncExternalStore/);
assert.doesNotMatch(pickupScopeSrc, /cookies\(/);

const captureSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeEntryScopeCapture.tsx",
);
assert.doesNotMatch(captureSrc, /document\.cookie/);
assert.doesNotMatch(captureSrc, /localStorage/);

console.log("PASS storefront cake entry scope");
