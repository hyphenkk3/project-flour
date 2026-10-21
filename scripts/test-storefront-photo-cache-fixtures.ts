/**
 * Controlled, synthetic regression test for public cake photo metadata.
 * No Supabase connection, Production data, Storage download, or order write.
 * Run: JITI_TSCONFIG_PATHS=true node_modules/.bin/jiti scripts/test-storefront-photo-cache-fixtures.ts
 */
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  mapStorefrontCakePhoto,
  storefrontPhotoForSize,
  type StorefrontCakePhotoRow,
} from "@/workspaces/storefront/catalog/cake-photo-map";

type Result<Row> = {
  data: Row[] | null;
  error: { message: string } | null;
};

type CachedValue = { value: unknown; isStale: false };
let unstableCache: typeof import("next/cache").unstable_cache;

class FixtureIncrementalCache {
  readonly values = new Map<string, unknown>();
  writes = 0;
  isOnDemandRevalidate = false;

  async generateSimpleCacheKey(key: string): Promise<string> {
    return key;
  }

  async get(key: string): Promise<CachedValue | null> {
    const value = this.values.get(key);
    return value === undefined ? null : { value, isStale: false };
  }

  async set(key: string, value: unknown): Promise<void> {
    this.writes += 1;
    this.values.set(key, value);
  }
}

const fixtureCache = new FixtureIncrementalCache();
(
  globalThis as typeof globalThis & {
    __incrementalCache?: FixtureIncrementalCache;
  }
).__incrementalCache = fixtureCache;

const isMissingPhotoSchema = (message: string) =>
  /cake_size_id|is_default|storage_path|schema cache|does not exist/i.test(message);

function makeCachedRead<Row>(
  key: string,
  read: () => Promise<Result<Row>>,
) {
  return unstableCache(
    async () => {
      let result = await read();
      if (result.error && isMissingPhotoSchema(result.error.message)) {
        result = await read(); // fixture models the legacy-select retry
      }
      if (result.error) {
        if (isMissingPhotoSchema(result.error.message)) return [] as Row[];
        // This is the production contract: reject instead of caching [] as success.
        throw new Error("Public cake photos are temporarily unavailable.");
      }
      return result.data ?? [];
    },
    [key],
    { revalidate: 60, tags: ["fixture-public-cake-photos"] },
  );
}

const cacheWriteCount = () => fixtureCache.writes;

async function main() {
  // Next expects this Node primitive on globalThis in its server cache runtime.
  (globalThis as typeof globalThis & { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage;
  unstableCache = (await import("next/cache")).unstable_cache;
  const cakeA = "fixture-cake-a";
  const cakeB = "fixture-cake-b";
  const sizeA4 = "fixture-cake-a-4-inch";
  const sizeB4 = "fixture-cake-b-4-inch";
  const rows: StorefrontCakePhotoRow[] = [
    {
      id: "photo-a-4",
      image_url: "/fixtures/cake-a-4.png",
      alt_text: "Fixture cake A four inch",
      sort_order: 1,
      cake_size_id: sizeA4,
      is_default: true,
    },
    {
      id: "photo-b-4",
      image_url: "/fixtures/cake-b-4.png",
      alt_text: "Fixture cake B four inch",
      sort_order: 1,
      cake_size_id: sizeB4,
      is_default: true,
    },
  ];

  // Successful metadata lookup maps a cake/size to its own photograph.
  let successCalls = 0;
  const successfulRead = makeCachedRead("fixture-success", async () => {
    successCalls += 1;
    return { data: rows, error: null };
  });
  const successfulRows = await successfulRead();
  assert.equal(successfulRows.length, 2);
  const photosByCake = new Map<string, ReturnType<typeof mapStorefrontCakePhoto>[]>();
  for (const row of successfulRows as (StorefrontCakePhotoRow & { cake_id: string })[]) {
    const cakeId = row.id === "photo-a-4" ? cakeA : cakeB;
    const list = photosByCake.get(cakeId) ?? [];
    list.push(mapStorefrontCakePhoto(row, list.length));
    photosByCake.set(cakeId, list);
  }
  assert.equal(
    storefrontPhotoForSize(photosByCake.get(cakeA) ?? [], sizeA4)?.url,
    "/fixtures/cake-a-4.png",
  );
  assert.notEqual(
    storefrontPhotoForSize(photosByCake.get(cakeA) ?? [], sizeA4)?.url,
    "/fixtures/cake-b-4.png",
  );
  await successfulRead();
  assert.equal(successCalls, 1, "fresh public metadata is reused from the brief cache");

  // Successful empty lookup remains a genuine no-photo result, not a failure.
  const emptyRead = makeCachedRead("fixture-empty", async () => ({
    data: [],
    error: null,
  }));
  assert.deepEqual(await emptyRead(), []);

  // A transient query error rejects without writing a successful empty cache
  // entry; a later successful lookup runs again and recovers the image.
  let failThenRecoverCalls = 0;
  let fixtureResult: Result<StorefrontCakePhotoRow> = {
    data: null,
    error: { message: "canceling statement due to statement timeout" },
  };
  const beforeFailure = cacheWriteCount();
  const recoverableRead = makeCachedRead("fixture-fail-recover", async () => {
    failThenRecoverCalls += 1;
    return fixtureResult;
  });
  await assert.rejects(recoverableRead(), /temporarily unavailable/);
  assert.equal(cacheWriteCount(), beforeFailure, "failed metadata reads are not cached");
  fixtureResult = { data: [rows[0]], error: null };
  const recoveredRows = await recoverableRead();
  assert.equal(failThenRecoverCalls, 2, "the recovery performs a fresh read");
  assert.equal(
    storefrontPhotoForSize(
      (recoveredRows as StorefrontCakePhotoRow[]).map((row, index) =>
        mapStorefrontCakePhoto(row, index),
      ),
      sizeA4,
    )?.url,
    "/fixtures/cake-a-4.png",
  );

  // Tie the fixture behavior to the production loader and display branches.
  const sourceRoot = process.cwd();
  const source = readFileSync(
    resolve(sourceRoot, "src/workspaces/storefront/extra/queries.ts"),
    "utf8",
  );
  const cacheStart = source.indexOf("const readCachedExtraPhotoRows =");
  const lookupStart = source.indexOf("async function extraPhotosByCake(", cacheStart);
  const listingStart = source.indexOf("export async function listStorefrontAvailableExtra(");
  assert.ok(cacheStart >= 0 && lookupStart > cacheStart && listingStart > lookupStart);
  const productionCacheLoader = source.slice(cacheStart, lookupStart);
  assert.match(productionCacheLoader, /throw new Error\("Public cake photos are temporarily unavailable\."\)/);
  assert.match(productionCacheLoader, /\.from\("library_cake_photos"\)/);
  assert.doesNotMatch(productionCacheLoader, /extra_stock|unit_price|availability/i);
  const productionPhotoGrouping = source.slice(lookupStart, listingStart);
  assert.match(productionPhotoGrouping, /\[\.\.\.cakeIds\]\.sort\(\)/);
  assert.match(productionPhotoGrouping, /photosByCake\.get\(photo\.cake_id\)/);
  assert.match(productionPhotoGrouping, /lookupFailed: true/);
  assert.match(productionPhotoGrouping, /lookupFailed: false/);

  const home = readFileSync(
    resolve(sourceRoot, "src/workspaces/storefront/home/HomeFreshPicksSection.tsx"),
    "utf8",
  );
  assert.match(home, /Photo temporarily unavailable/);
  assert.match(home, /Photo coming soon/);
  assert.match(
    home,
    /pick\.imageLookupFailed\s*\?\s*"Photo temporarily unavailable"\s*:\s*"Photo coming soon"/,
  );
  console.log("storefront-photo-cache-fixtures=PASS");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
