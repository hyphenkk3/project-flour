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
  CAKE_DETAIL_BROWSE_BACK,
  CAKE_DETAIL_HOME_BACK,
  CAKE_ENTRY_SCOPE_STORAGE_KEY,
  cakeIdFromHref,
  clearStoredCakeEntryScope,
  parseCakeDetailPickupSearchParams,
  parseCollectionId,
  parseCollectionName,
  readStoredCakeEntryScope,
  resolveCakeDetailBackNav,
  resolveCakeDetailPickupScope,
  storefrontCollectionCakesPath,
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

const COLLECTION_ID = "aed91d7f-1d7e-4597-88c3-29da661bbae9";
const COLLECTION_NAME = "September 2026 Collection";

assert.equal(
  storefrontCollectionCakesPath(COLLECTION_ID),
  `/order/collection/${COLLECTION_ID}`,
);
assert.equal(parseCollectionId(COLLECTION_ID), COLLECTION_ID);
assert.equal(parseCollectionId("../secret"), null);
assert.equal(parseCollectionId("short"), null);
assert.equal(parseCollectionName(COLLECTION_NAME), COLLECTION_NAME);
assert.equal(parseCollectionName("  September   2026 Collection  "), COLLECTION_NAME);
assert.equal(parseCollectionName("<script>"), null);
assert.equal(parseCollectionName(""), null);

assert.deepEqual(
  resolveCakeDetailBackNav(null),
  CAKE_DETAIL_HOME_BACK,
  "direct canonical cake detail falls back to Home",
);
assert.deepEqual(
  resolveCakeDetailBackNav(stored),
  CAKE_DETAIL_HOME_BACK,
  "pickup-only stored scope (Home featured) falls back to Home",
);
assert.deepEqual(
  resolveCakeDetailBackNav({
    ...stored,
    origin: "home",
  }),
  CAKE_DETAIL_HOME_BACK,
);
assert.deepEqual(
  resolveCakeDetailBackNav({
    ...stored,
    origin: "browse",
  }),
  CAKE_DETAIL_BROWSE_BACK,
);
assert.deepEqual(
  resolveCakeDetailBackNav({
    ...stored,
    origin: "collection",
    collectionId: COLLECTION_ID,
    collectionName: COLLECTION_NAME,
  }),
  {
    href: `/order/collection/${COLLECTION_ID}`,
    label: `← ${COLLECTION_NAME}`,
  },
);
assert.deepEqual(
  resolveCakeDetailBackNav({
    ...stored,
    cakeId: "other-cake",
    origin: "collection",
    collectionId: COLLECTION_ID,
    collectionName: COLLECTION_NAME,
  }),
  {
    href: `/order/collection/${COLLECTION_ID}`,
    label: `← ${COLLECTION_NAME}`,
  },
  "back-nav helper does not cake-match; snapshot matching happens at read time",
);

withDraftStorage(() => {
  writeStoredCakeEntryScope({
    cakeId: CAKE_ID,
    from: "2026-09-01",
    to: "2026-09-30",
    pickup: "2026-09-01",
    origin: "collection",
    collectionId: COLLECTION_ID,
    collectionName: COLLECTION_NAME,
  });
  const read = readStoredCakeEntryScope(CAKE_ID);
  assert.equal(read?.origin, "collection");
  assert.equal(read?.collectionId, COLLECTION_ID);
  assert.equal(read?.collectionName, COLLECTION_NAME);
  assert.equal(read?.from, "2026-09-01");
  assert.deepEqual(resolveCakeDetailBackNav(read), {
    href: `/order/collection/${COLLECTION_ID}`,
    label: `← ${COLLECTION_NAME}`,
  });
  assert.deepEqual(
    resolveCakeDetailPickupScope({
      cakeId: CAKE_ID,
      searchParams: new URLSearchParams(),
      stored: read,
    }),
    {
      from: "2026-09-01",
      to: "2026-09-30",
      pickup: "2026-09-01",
    },
    "collection origin keeps pickup dates",
  );
  assert.equal(readStoredCakeEntryScope("other-cake"), null);
});

withDraftStorage(() => {
  writeStoredCakeEntryScope({
    cakeId: CAKE_ID,
    origin: "browse",
  });
  const read = readStoredCakeEntryScope(CAKE_ID);
  assert.equal(read?.origin, "browse");
  assert.deepEqual(resolveCakeDetailBackNav(read), CAKE_DETAIL_BROWSE_BACK);
  assert.equal(
    resolveCakeDetailPickupScope({
      cakeId: CAKE_ID,
      searchParams: new URLSearchParams(),
      stored: read,
    }),
    null,
    "browse origin does not invent a pickup window",
  );
});

withDraftStorage(() => {
  writeStoredCakeEntryScope({
    cakeId: CAKE_ID,
    from: "2026-09-01",
    to: "2026-09-30",
    pickup: "2026-09-01",
    origin: "collection",
    collectionId: COLLECTION_ID,
    collectionName: COLLECTION_NAME,
  });
  writeStoredCakeEntryScope({
    cakeId: CAKE_ID,
    origin: "browse",
  });
  const read = readStoredCakeEntryScope(CAKE_ID);
  assert.equal(read?.origin, "browse");
  assert.equal(read?.collectionId, undefined);
  assert.deepEqual(resolveCakeDetailBackNav(read), CAKE_DETAIL_BROWSE_BACK);
});

withDraftStorage(() => {
  window.sessionStorage.setItem(
    CAKE_ENTRY_SCOPE_STORAGE_KEY,
    "{not-json",
  );
  assert.equal(readStoredCakeEntryScope(CAKE_ID), null);
  assert.deepEqual(resolveCakeDetailBackNav(null), CAKE_DETAIL_HOME_BACK);
});

withDraftStorage(() => {
  window.sessionStorage.setItem(
    CAKE_ENTRY_SCOPE_STORAGE_KEY,
    JSON.stringify({
      cakeId: CAKE_ID,
      from: "2026-09-01",
      to: "2026-09-30",
      pickup: "2026-09-01",
      origin: "collection",
      collectionId: "../nope",
      collectionName: COLLECTION_NAME,
      capturedAt: Date.now(),
    }),
  );
  const read = readStoredCakeEntryScope(CAKE_ID);
  assert.equal(read?.origin, undefined);
  assert.equal(read?.from, "2026-09-01");
  assert.deepEqual(resolveCakeDetailBackNav(read), CAKE_DETAIL_HOME_BACK);
});

withDraftStorage(() => {
  window.sessionStorage.setItem(
    CAKE_ENTRY_SCOPE_STORAGE_KEY,
    JSON.stringify({
      cakeId: CAKE_ID,
      from: "2026-09-01",
      to: "2026-09-30",
      pickup: "2026-09-01",
      origin: "collection",
      collectionId: COLLECTION_ID,
      collectionName: COLLECTION_NAME,
      capturedAt: Date.now() - 31 * 60 * 1000,
    }),
  );
  assert.equal(readStoredCakeEntryScope(CAKE_ID), null);
});

const homeSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.match(homeSrc, /storefrontCakeDetailHref/);
assert.match(homeSrc, /CakeEntryScopeCapture/);
assert.doesNotMatch(homeSrc, /collectionScopedCakeHref/);
assert.doesNotMatch(homeSrc, /origin: "collection"/);
assert.doesNotMatch(homeSrc, /\/cakes\/\$\{[^}]+\}\?/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionSrc, /storefrontCakeDetailHref/);
assert.match(collectionSrc, /CakeEntryScopeCapture/);
assert.match(collectionSrc, /origin: "collection"/);
assert.match(collectionSrc, /collectionId/);
assert.match(collectionSrc, /collectionName: headline/);
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
assert.match(browseSrc, /CakeEntryScopeCapture scopes=\{cakeScopes\}/);
assert.match(browseSrc, /origin: "browse"/);
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
assert.match(detailSrc, /CakeDetailBackNav/);
assert.doesNotMatch(detailSrc, /StorefrontHomeLink/);
assert.doesNotMatch(detailSrc, /cookies\(/);
assert.doesNotMatch(detailSrc, /useSearchParams/);

const pickupScopeSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPickupScope.tsx",
);
assert.doesNotMatch(pickupScopeSrc, /useSearchParams/);
assert.doesNotMatch(pickupScopeSrc, /fromCollection/);
assert.doesNotMatch(pickupScopeSrc, /Choose your collection/);
assert.doesNotMatch(pickupScopeSrc, /Browse Cakes/);
assert.match(pickupScopeSrc, /urlFrom/);
assert.match(pickupScopeSrc, /getStoredCakeEntryScopeSnapshot/);
assert.match(pickupScopeSrc, /useSyncExternalStore/);
assert.doesNotMatch(pickupScopeSrc, /cookies\(/);

const backNavSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailBackNav.tsx",
);
assert.match(backNavSrc, /resolveCakeDetailBackNav/);
assert.match(backNavSrc, /getStoredCakeEntryScopeSnapshot/);
assert.doesNotMatch(backNavSrc, /useSearchParams/);
assert.doesNotMatch(backNavSrc, /Choose your collection/);

const captureSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeEntryScopeCapture.tsx",
);
assert.doesNotMatch(captureSrc, /document\.cookie/);
assert.doesNotMatch(captureSrc, /localStorage/);

console.log("PASS storefront cake entry scope");
