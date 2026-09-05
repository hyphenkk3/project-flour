/**
 * Customer storefront Phase 1: homepage, catalogue, cake detail, add-to-preorder.
 * Run: npx tsx scripts/test-storefront-phase1.ts
 *
 * Live section is read-only. Does not create or mutate orders.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatAvailableSizes,
  startingPrice,
} from "@/workspaces/storefront/catalog/pricing";
import { mapStorefrontCake } from "@/workspaces/storefront/catalog/queries";
import { legacyCakeCategoryEmbed } from "@/engines/menu/cake-categories";
import {
  PREORDER_DRAFT_KEY,
  emptyPreorderDraft,
  mergeDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const homeSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
const cardSrc = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
const detailSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
const panelSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPurchasePanel.tsx",
);
const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
const pageSrc = readSrc("src/app/page.tsx");
const cakePageSrc = readSrc("src/app/cakes/[id]/page.tsx");
const pricingSrc = readSrc("src/workspaces/storefront/catalog/pricing.ts");

assert.match(pageSrc, /StorefrontHomePage/);
assert.match(cakePageSrc, /StorefrontCakeDetail/);
assert.match(homeSrc, /href="\/browse"/);
assert.match(homeSrc, /href="\/order"/);
assert.doesNotMatch(homeSrc, /listAvailableCakes/);
assert.doesNotMatch(homeSrc, /customer-website/);
assert.doesNotMatch(homeSrc, /\/preview\//);
assert.doesNotMatch(homeSrc, /submit_guest_preorder/);
assert.doesNotMatch(homeSrc, /create_staff_guest_preorder/);

assert.match(detailSrc, /getBrowsePublishedCakeById/);
assert.doesNotMatch(detailSrc, /getAvailableCakeById/);
assert.doesNotMatch(detailSrc, /submit_guest_preorder/);
assert.doesNotMatch(detailSrc, /customer-website/);

assert.match(queriesSrc, /storefront_current_collection/);
assert.match(queriesSrc, /sortCakeSizesByNumericLabel/);
assert.match(queriesSrc, /eq\("available", true\)/);
assert.match(
  queriesSrc,
  /const cakes = await listAvailableCakes\(collection\.id\)/,
);

assert.match(panelSrc, /AddToOrderButton/);
assert.doesNotMatch(panelSrc, /router\.push/);
assert.doesNotMatch(panelSrc, /quantity: 1/);
assert.doesNotMatch(panelSrc, /submit_guest_preorder/);

const addSheetSrc = readSrc(
  "src/workspaces/storefront/cart/AddToOrderSheet.tsx",
);
assert.match(addSheetSrc, /Add to Order/);
assert.match(addSheetSrc, /Added to your order/);
assert.match(addSheetSrc, /formatPreorderRequirement/);
assert.match(addSheetSrc, /mergeDraftItem/);
assert.doesNotMatch(addSheetSrc, /router\.push/);
assert.doesNotMatch(addSheetSrc, /engines\/preorder/);

assert.match(cardSrc, /startingPrice/);
assert.match(cardSrc, /cakeCardPreorderLabel/);
assert.match(cardSrc, /AddToOrderButton/);
assert.match(cardSrc, /View cake/);
assert.match(pricingSrc, /Math\.min/);

assert.equal(PREORDER_DRAFT_KEY, "whitebird-preorder-draft-v1");

const mapped = mapStorefrontCake({
  id: "cake-1",
  name: "Celebration Cake",
  description: "For sharing",
  ...legacyCakeCategoryEmbed("celebration"),
  status: "active",
  sharing_guide: "Serves 6–8",
  allergens: ["eggs"],
  library_cake_sizes: [
    {
      id: "size-8",
      cake_id: "cake-1",
      label: '8"',
      price: 165,
      sort_order: 0,
    },
    {
      id: "size-4",
      cake_id: "cake-1",
      label: '4"',
      price: 75,
      sort_order: 1,
    },
    {
      id: "size-12",
      cake_id: "cake-1",
      label: '12"',
      price: 245,
      sort_order: 2,
    },
    {
      id: "size-6",
      cake_id: "cake-1",
      label: '6"',
      price: 125,
      sort_order: 3,
    },
    {
      id: "size-10",
      cake_id: "cake-1",
      label: '10"',
      price: 205,
      sort_order: 4,
    },
  ],
  library_cake_photos: [],
});

assert.deepEqual(
  mapped.sizes.map((size) => size.size),
  ['4"', '6"', '8"', '10"', '12"'],
);
assert.equal(mapped.sizes[0]?.id, "size-4");
assert.equal(startingPrice(mapped), 75);
assert.equal(formatAvailableSizes(mapped), '4" · 6" · 8" · 10" · 12"');
assert.notEqual(
  ['8"', '4"', '12"', '6"', '10"'].sort().join(" · "),
  formatAvailableSizes(mapped),
);

const defaultSelected = mapped.sizes[0];
assert.equal(defaultSelected?.id, "size-4");
assert.equal(defaultSelected?.price, 75);

const eight = mapped.sizes.find((size) => size.size === '8"');
assert.equal(eight?.id, "size-8");
assert.equal(eight?.price, 165);

const merged = mergeDraftItem(emptyPreorderDraft(), {
  cakeId: mapped.id,
  sizeId: eight!.id,
  quantity: 2,
  cakeName: mapped.name,
  sizeLabel: eight!.size,
  unitPrice: eight!.price,
});
assert.equal(merged.items.length, 1);
assert.equal(merged.items[0]?.cakeId, "cake-1");
assert.equal(merged.items[0]?.sizeId, "size-8");
assert.equal(merged.items[0]?.quantity, 2);

const addedAgain = mergeDraftItem(merged, {
  cakeId: mapped.id,
  sizeId: eight!.id,
  quantity: 1,
  cakeName: mapped.name,
  sizeLabel: eight!.size,
  unitPrice: eight!.price,
});
assert.equal(addedAgain.items[0]?.quantity, 3);
assert.equal(PREORDER_DRAFT_KEY, "whitebird-preorder-draft-v1");

console.log("PASS storefront phase 1 (static)");

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.log("SKIP storefront phase 1 live (missing Supabase env)");
  process.exit(0);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runLiveReadOnly() {
  const { data: collection, error: collectionErr } = await admin.rpc(
    "storefront_current_collection",
  );
  assert.equal(collectionErr, null, collectionErr?.message);
  assert.ok(collection?.id, "storefront_current_collection returns a row");

  const { data: offeredRows, error: offeredErr } = await admin
    .from("collection_cakes")
    .select(
      `
      library_cake_id,
      available,
      library_cakes (
        id,
        status,
        library_cake_sizes ( id, label, price, sort_order )
      )
    `,
    )
    .eq("collection_id", collection.id)
    .eq("available", true);
  assert.equal(offeredErr, null, offeredErr?.message);

  type SizeRow = { id: string; label: string; price: number };
  type CakeRow = {
    id: string;
    status: string;
    library_cake_sizes: SizeRow[] | null;
  };
  const offered = (offeredRows ?? [])
    .map((row) => {
      const cakes = row.library_cakes as CakeRow | CakeRow[] | null;
      return Array.isArray(cakes) ? cakes[0] : cakes;
    })
    .filter((cake): cake is CakeRow => Boolean(cake))
    .filter((cake) => cake.status === "active" || cake.status === "seasonal")
    .filter((cake) => (cake.library_cake_sizes ?? []).length > 0);

  const offeredIds = new Set(offered.map((cake) => cake.id));
  assert.ok(
    [...offeredIds].every((id) =>
      (offeredRows ?? []).some(
        (row) => row.library_cake_id === id && row.available === true,
      ),
    ),
    "catalogue cakes belong to the current collection",
  );

  const { data: libraryCakes } = await admin
    .from("library_cakes")
    .select("id, status")
    .in("status", ["active", "seasonal"])
    .limit(40);
  const outsider = (libraryCakes ?? []).find((row) => !offeredIds.has(row.id));
  if (outsider) {
    assert.equal(offeredIds.has(outsider.id), false);
  } else {
    assert.equal(
      offeredIds.has("00000000-0000-4000-8000-000000000000"),
      false,
    );
  }

  const sample = offered[0];
  if (sample) {
    const mappedLive = mapStorefrontCake({
      id: sample.id,
      name: "Live",
      description: null,
      ...legacyCakeCategoryEmbed("classic"),
      status: sample.status,
      sharing_guide: null,
      allergens: [],
      library_cake_sizes: (sample.library_cake_sizes ?? []).map((size) => ({
        id: size.id,
        cake_id: sample.id,
        label: size.label,
        price: size.price,
        sort_order: 0,
      })),
      library_cake_photos: [],
    });
    const labels = mappedLive.sizes.map((size) => size.size);
    const numeric = [...mappedLive.sizes].sort((a, b) => {
      const na = Number(/(\d+)/.exec(a.size)?.[1] ?? 0);
      const nb = Number(/(\d+)/.exec(b.size)?.[1] ?? 0);
      return na - nb;
    });
    assert.deepEqual(
      labels,
      numeric.map((size) => size.size),
      "live sizes are numeric ascending",
    );
  }

  console.log("PASS storefront phase 1 (live read-only)");
}

void runLiveReadOnly().catch((error) => {
  console.error(error);
  process.exit(1);
});
