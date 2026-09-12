/**
 * P0.2 — cake detail loads one published cake, not the full Browse catalogue.
 * Run: npx tsx scripts/test-storefront-cake-detail-query.ts
 *
 * Static only. Does not create or mutate catalogues, cakes, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BROWSE_CURRENTLY_UNAVAILABLE_NOTE } from "@/engines/menu/homepage-collection-preview";
import type { StorefrontCake } from "@/types/storefront";
import { startingPrice } from "@/workspaces/storefront/catalog/pricing";
import {
  resolveBrowsePublishedCake,
  type BrowsePublicationCatalogue,
} from "@/workspaces/storefront/catalog/queries";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const TODAY = "2026-08-15";

function cake(id: string, extras: Partial<StorefrontCake> = {}): StorefrontCake {
  return {
    id,
    name: "Avocado",
    description: "Fresh cream avocado.",
    categoryId: "cat-cream",
    categoryName: "Cream",
    categoryActive: true,
    categorySortOrder: 1,
    categories: [
      {
        id: "cat-cream",
        name: "Cream",
        isActive: true,
        sortOrder: 1,
      },
    ],
    tags: [
      {
        id: "tag-best",
        name: "Bestseller",
        isActive: true,
        sortOrder: 0,
      },
    ],
    image: "https://example.com/avocado.jpg",
    photos: [
      {
        id: `${id}-photo`,
        url: "https://example.com/avocado.jpg",
        altText: "Avocado",
        sortOrder: 0,
        cakeSizeId: `${id}-6`,
        isDefault: true,
      },
    ],
    sharingGuide: "Serves 8",
    allergens: ["dairy"],
    sizes: [
      {
        id: `${id}-6`,
        cakeId: id,
        size: '6"',
        price: 128,
        sortOrder: 0,
        preorderDays: 2,
      },
      {
        id: `${id}-8`,
        cakeId: id,
        size: '8"',
        price: 168,
        sortOrder: 1,
        preorderDays: 3,
      },
    ],
    ...extras,
  };
}

const currentMonthly: BrowsePublicationCatalogue = {
  id: "col-aug",
  month: "2026-08-01",
  purpose: "monthly",
  status: "active",
  end_date: null,
  website_override: false,
};
const futureMonthly: BrowsePublicationCatalogue = {
  id: "col-sep",
  month: "2026-09-01",
  purpose: "monthly",
  status: "active",
  end_date: null,
  website_override: false,
};
const expiredMonthly: BrowsePublicationCatalogue = {
  id: "col-jul",
  month: "2026-07-01",
  purpose: "monthly",
  status: "active",
  end_date: null,
  website_override: false,
};
const staffOnlySpecial: BrowsePublicationCatalogue = {
  id: "col-staff",
  month: null,
  purpose: "special",
  status: "active",
  end_date: "2026-08-20",
  website_override: false,
};

const avocado = cake("avocado");

const published = resolveBrowsePublishedCake({
  cake: avocado,
  cakeStatus: "active",
  catalogues: [currentMonthly],
  todayYmd: TODAY,
});
assert.equal(published?.id, "avocado");
assert.equal(published?.name, "Avocado");
assert.equal(published?.description, "Fresh cream avocado.");
assert.equal(published?.currentlyOffered, true);
assert.equal(published?.sizes.length, 2);
assert.equal(published?.sizes[0]?.price, 128);
assert.equal(published?.sizes[0]?.preorderDays, 2);
assert.equal(published?.sizes[1]?.price, 168);
assert.equal(published?.sizes[1]?.preorderDays, 3);
assert.equal(startingPrice(published!), 128);
assert.equal(published?.photos.length, 1);
assert.equal(published?.image, "https://example.com/avocado.jpg");
assert.equal(published?.categories[0]?.name, "Cream");
assert.equal(published?.tags?.[0]?.name, "Bestseller");

assert.equal(
  resolveBrowsePublishedCake({
    cake: avocado,
    cakeStatus: "active",
    catalogues: [],
    todayYmd: TODAY,
  }),
  null,
  "nonexistent / no public membership returns null",
);

assert.equal(
  resolveBrowsePublishedCake({
    cake: avocado,
    cakeStatus: "active",
    catalogues: [staffOnlySpecial],
    todayYmd: TODAY,
  }),
  null,
  "unpublished / staff-only special remains excluded",
);

const historical = resolveBrowsePublishedCake({
  cake: avocado,
  cakeStatus: "active",
  catalogues: [expiredMonthly],
  todayYmd: TODAY,
});
assert.equal(historical?.id, "avocado");
assert.equal(historical?.currentlyOffered, false);
assert.equal(historical?.availabilityNote, BROWSE_CURRENTLY_UNAVAILABLE_NOTE);
assert.equal(historical?.sizes[0]?.price, 128);

assert.equal(
  resolveBrowsePublishedCake({
    cake: avocado,
    cakeStatus: "retired",
    catalogues: [currentMonthly],
    todayYmd: TODAY,
  }),
  null,
  "current membership still requires an offerable cake status",
);

const popularOnly = resolveBrowsePublishedCake({
  cake: avocado,
  cakeStatus: "seasonal",
  catalogues: [staffOnlySpecial],
  showInPopularCakes: true,
  todayYmd: TODAY,
});
assert.equal(popularOnly?.id, "avocado");
assert.equal(popularOnly?.currentlyOffered, true);
assert.equal(popularOnly?.availabilityNote, null);

const futureOnly = resolveBrowsePublishedCake({
  cake: avocado,
  cakeStatus: "active",
  catalogues: [futureMonthly],
  todayYmd: TODAY,
});
assert.equal(futureOnly?.currentlyOffered, true);
assert.equal(futureOnly?.availabilityNote, "Available from Sep");

assert.equal(
  resolveBrowsePublishedCake({
    cake: cake("plain", { sizes: [] }),
    cakeStatus: "active",
    catalogues: [currentMonthly],
    showInPopularCakes: true,
    todayYmd: TODAY,
  }),
  null,
  "cakes without sizes stay excluded",
);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
const detailStart = queriesSrc.indexOf(
  "export async function getBrowsePublishedCakeById",
);
assert.ok(detailStart >= 0);
const detailNext = queriesSrc.indexOf(
  "\nexport async function",
  detailStart + 1,
);
const detailFn = queriesSrc.slice(
  detailStart,
  detailNext === -1 ? undefined : detailNext,
);
assert.doesNotMatch(detailFn, /listBrowsePublishedCakes/);
assert.doesNotMatch(detailFn, /listHomepagePopularCakes/);
assert.doesNotMatch(detailFn, /\.find\(/);
assert.match(detailFn, /\.eq\(\s*"id"/);
assert.match(detailFn, /library_cakes/);
assert.match(detailFn, /library_cake_id/);
assert.match(detailFn, /maybeSingle/);
assert.match(detailFn, /resolveBrowsePublishedCake/);
assert.match(detailFn, /withCakePhotoSelectFallback/);

const detailPageSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
assert.match(detailPageSrc, /getBrowsePublishedCakeById/);
assert.match(detailPageSrc, /notFound\(\)/);

console.log("PASS storefront cake detail query");
