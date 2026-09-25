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
  browseCakePreviewFromDisplay,
  mergeBrowseCakeDisplay,
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

const coreWithoutDisplay = resolveBrowsePublishedCake({
  cake: {
    ...avocado,
    photos: [],
    image: null,
    categories: [],
    categoryId: null,
    categoryName: null,
    tags: [],
  },
  cakeStatus: "active",
  catalogues: [currentMonthly],
  todayYmd: TODAY,
});
assert.equal(coreWithoutDisplay?.currentlyOffered, true);
assert.equal(coreWithoutDisplay?.sizes[0]?.price, 128);
const mergedDisplay = mergeBrowseCakeDisplay(coreWithoutDisplay!, {
  id: avocado.id,
  name: "Stale display name",
  description: "stale",
  status: "draft",
  sharing_guide: null,
  allergens: [],
  library_cake_sizes: [
    {
      id: "stale-size",
      cake_id: avocado.id,
      label: '99"',
      price: 1,
      sort_order: 0,
      preorder_days: 9,
    },
  ],
  library_cake_photos: [
    {
      id: "photo-1",
      image_url: "https://example.com/hero.jpg",
      alt_text: "Hero",
      sort_order: 0,
      cake_size_id: `${avocado.id}-6`,
      is_default: true,
    },
  ],
  library_cake_category_assignments: [
    {
      category_id: "cat-cream",
      sort_order: 1,
      library_cake_categories: {
        id: "cat-cream",
        name: "Cream",
        is_active: true,
        sort_order: 1,
      },
    },
  ],
});
assert.equal(mergedDisplay.name, "Avocado", "live commercial name stays authoritative");
assert.equal(mergedDisplay.sizes[0]?.price, 128, "live prices stay authoritative");
assert.equal(mergedDisplay.currentlyOffered, true);
assert.equal(mergedDisplay.photos[0]?.url, "https://example.com/hero.jpg");
assert.equal(mergedDisplay.categories[0]?.name, "Cream");

const preview = browseCakePreviewFromDisplay(avocado.id, {
  id: avocado.id,
  name: "Stale display name",
  description: "stale",
  status: "draft",
  sharing_guide: null,
  allergens: [],
  library_cake_sizes: [
    {
      id: "stale-size",
      cake_id: avocado.id,
      label: '99"',
      price: 1,
      sort_order: 0,
      preorder_days: 9,
    },
  ],
  library_cake_photos: [
    {
      id: "photo-1",
      image_url: "https://example.com/hero.jpg",
      alt_text: "Hero",
      sort_order: 0,
      cake_size_id: `${avocado.id}-6`,
      is_default: true,
    },
  ],
  library_cake_category_assignments: [],
});
assert.equal(preview?.name, "Stale display name");
assert.equal(preview?.photos[0]?.url, "https://example.com/hero.jpg");
assert.equal(preview?.sizes.length, 0, "preview never carries cached prices");
assert.equal(preview?.currentlyOffered, false, "preview never enables Add to Order");

const liveNoCollection = resolveBrowsePublishedCake({
  cake: avocado,
  cakeStatus: "active",
  catalogues: [],
  todayYmd: TODAY,
});
assert.equal(liveNoCollection?.id, "avocado");
assert.equal(
  liveNoCollection?.currentlyOffered,
  false,
  "live Library cake with no membership is discoverable, not orderable",
);
assert.equal(
  liveNoCollection?.availabilityNote,
  BROWSE_CURRENTLY_UNAVAILABLE_NOTE,
);

const staffOnlyLive = resolveBrowsePublishedCake({
  cake: avocado,
  cakeStatus: "active",
  catalogues: [staffOnlySpecial],
  todayYmd: TODAY,
});
assert.equal(staffOnlyLive?.id, "avocado");
assert.equal(
  staffOnlyLive?.currentlyOffered,
  false,
  "staff-only special does not make a live cake currently orderable",
);

assert.equal(
  resolveBrowsePublishedCake({
    cake: avocado,
    cakeStatus: "draft",
    catalogues: [],
    todayYmd: TODAY,
  }),
  null,
  "draft cakes remain excluded from Cake Detail",
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
assert.equal(
  popularOnly?.currentlyOffered,
  false,
  "Popular Cakes is merchandising, not currentlyOffered",
);
assert.equal(popularOnly?.availabilityNote, BROWSE_CURRENTLY_UNAVAILABLE_NOTE);

const futureOnly = resolveBrowsePublishedCake({
  cake: avocado,
  cakeStatus: "active",
  catalogues: [futureMonthly],
  todayYmd: TODAY,
});
assert.equal(futureOnly?.currentlyOffered, true);
assert.equal(futureOnly?.availabilityNote, "Available from Sep");

const lemonDetail = resolveBrowsePublishedCake({
  cake: cake("aecba146-e10c-4d69-b165-3afb02611f90", {
    name: "Refreshing Lemon",
  }),
  cakeStatus: "active",
  catalogues: [],
  showInPopularCakes: false,
  todayYmd: TODAY,
});
assert.equal(lemonDetail?.name, "Refreshing Lemon");
assert.equal(lemonDetail?.currentlyOffered, false);
assert.equal(lemonDetail?.availabilityNote, BROWSE_CURRENTLY_UNAVAILABLE_NOTE);

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
const membershipFn = queriesSrc.slice(
  queriesSrc.indexOf("async function listCakePublicationCatalogues"),
  queriesSrc.indexOf("type CurrentCollectionRpcRow"),
);
const detailStart = queriesSrc.indexOf(
  "async function loadLibraryCakeDisplayById",
);
assert.ok(detailStart >= 0);
const detailNext = queriesSrc.indexOf(
  "\nexport async function listHomepagePopularCakes",
  detailStart + 1,
);
const detailFn =
  membershipFn +
  "\n" +
  queriesSrc.slice(
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
assert.match(detailFn, /createPublicClient/);
assert.match(detailFn, /Promise\.all/);
assert.match(detailFn, /unstable_cache/);
assert.match(detailFn, /\["browse-cake-display"/);
assert.match(detailFn, /loadLiveCakeCommercialState/);
assert.match(detailFn, /listCakePublicationCatalogues/);
assert.match(detailFn, /void readCachedLibraryCakeDisplay/);
assert.match(detailFn, /mergeBrowseCakeDisplay/);
assert.doesNotMatch(detailFn, /\["browse-published-cake-by-id"/);
assert.doesNotMatch(detailFn, /await createClient\(/);
assert.doesNotMatch(detailFn, /cookies\(/);

const detailPageSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
assert.match(detailPageSrc, /getBrowsePublishedCakeById/);
assert.match(detailPageSrc, /getBrowseCakeDisplayById/);
assert.match(detailPageSrc, /mergeBrowseCakeDisplay/);
assert.match(detailPageSrc, /browseCakePreviewFromDisplay/);
assert.match(detailPageSrc, /CakeDetailWithDisplay/);
assert.match(detailPageSrc, /displayPromise/);
assert.match(detailPageSrc, /Promise\.all/);
assert.match(detailPageSrc, /notFound\(\)/);
assert.match(detailPageSrc, /hideAddToOrder=\{cake\.currentlyOffered === false\}/);
assert.doesNotMatch(detailPageSrc, /force-dynamic/);
assert.doesNotMatch(detailPageSrc, /useSearchParams/);

const cardSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeCard.tsx",
);
assert.match(cardSrc, /StorefrontCakeDetailLink/);
assert.doesNotMatch(cardSrc, /prefetch=\{false\}/);
assert.doesNotMatch(cardSrc, /detailIntent/);
assert.doesNotMatch(cardSrc, /onIntent/);

const detailLinkSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailLink.tsx",
);
assert.match(detailLinkSrc, /prefetch=\{false\}/);
assert.match(detailLinkSrc, /canonicalCakeDetailPath/);
assert.match(detailLinkSrc, /onPointerDown/);
assert.match(detailLinkSrc, /prefetchCanonicalCakeDetail/);
assert.match(detailLinkSrc, /router\.prefetch/);
assert.doesNotMatch(detailLinkSrc, /setDetailIntent|onIntent/);

const popularSrc = readSrc(
  "src/workspaces/storefront/home/HomePopularCakes.tsx",
);
assert.match(popularSrc, /prefetch=\{false\}/);

const homeSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontHomePage.tsx",
);
assert.match(homeSrc, /StorefrontCakePrefetch/);
assert.doesNotMatch(
  readSrc("src/workspaces/storefront/home/StorefrontCakePrefetch.tsx"),
  /<Link/,
);
assert.match(
  readSrc("src/workspaces/storefront/home/StorefrontCakePrefetch.tsx"),
  /HOMEPAGE_COLLECTION_PREVIEW_DISPLAY_MAX_LG/,
);
assert.match(homeSrc, /excludeIds=\{popular\.map/);
assert.match(homeSrc, /Suspense/);
assert.doesNotMatch(homeSrc, /force-dynamic/);

console.log("PASS storefront cake detail query");
