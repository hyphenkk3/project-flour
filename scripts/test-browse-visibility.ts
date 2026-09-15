/**
 * Browse existence vs currently-orderable.
 * Run: npx tsx scripts/test-browse-visibility.ts
 *
 * Static only. Does not create or mutate catalogues, cakes, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BROWSE_CURRENTLY_UNAVAILABLE_NOTE } from "@/engines/menu/homepage-collection-preview";
import {
  isBrowseDiscoverableLibraryCake,
  isLiveLibraryCakeStatus,
} from "@/engines/menu/browse-visibility";
import type { StorefrontCake } from "@/types/storefront";
import {
  resolveBrowsePublishedCake,
  type BrowsePublicationCatalogue,
} from "@/workspaces/storefront/catalog/queries";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const TODAY = "2026-09-14";

function sizedCake(id: string, name: string): StorefrontCake {
  return {
    id,
    name,
    description: `${name} description`,
    categoryId: "cat-fruit",
    categoryName: "Fruit",
    categoryActive: true,
    categorySortOrder: 2,
    categories: [
      { id: "cat-fruit", name: "Fruit", isActive: true, sortOrder: 2 },
    ],
    tags: [],
    image: null,
    photos: [],
    sharingGuide: null,
    allergens: [],
    sizes: [
      {
        id: `${id}-6`,
        cakeId: id,
        size: '6"',
        price: 125,
        sortOrder: 0,
        preorderDays: 2,
      },
    ],
  };
}

const september: BrowsePublicationCatalogue = {
  id: "col-sep",
  month: "2026-09-01",
  purpose: "monthly",
  status: "active",
  end_date: null,
  website_override: false,
};
const archivedAugust: BrowsePublicationCatalogue = {
  id: "col-aug",
  month: "2026-08-01",
  purpose: "monthly",
  status: "archived",
  end_date: null,
  website_override: false,
};

assert.equal(isLiveLibraryCakeStatus("active"), true);
assert.equal(isLiveLibraryCakeStatus("seasonal"), true);
assert.equal(isLiveLibraryCakeStatus("draft"), false);
assert.equal(isLiveLibraryCakeStatus("ready_for_release"), false);
assert.equal(isLiveLibraryCakeStatus("retired"), false);

assert.equal(
  isBrowseDiscoverableLibraryCake({
    status: "active",
    sizeCount: 1,
    hasQualifyingCustomerFacingCatalogue: false,
  }),
  true,
  "1. active cake + zero collection membership appears on Browse",
);
assert.equal(
  isBrowseDiscoverableLibraryCake({
    status: "seasonal",
    sizeCount: 1,
    hasQualifyingCustomerFacingCatalogue: false,
  }),
  true,
  "2. seasonal cake + zero collection membership appears on Browse",
);
assert.equal(
  isBrowseDiscoverableLibraryCake({
    status: "active",
    sizeCount: 1,
    hasQualifyingCustomerFacingCatalogue: true,
  }),
  true,
  "3. active cake + valid collection membership still appears",
);
assert.equal(
  isBrowseDiscoverableLibraryCake({
    status: "retired",
    sizeCount: 1,
    hasQualifyingCustomerFacingCatalogue: true,
  }),
  true,
  "4. historical customer-facing cake still appears",
);
assert.equal(
  isBrowseDiscoverableLibraryCake({
    status: "draft",
    sizeCount: 1,
    hasQualifyingCustomerFacingCatalogue: false,
  }),
  false,
  "5. draft cake does not appear",
);
assert.equal(
  isBrowseDiscoverableLibraryCake({
    status: "ready_for_release",
    sizeCount: 1,
    hasQualifyingCustomerFacingCatalogue: false,
  }),
  false,
  "6. ready_for_release cake does not appear",
);
assert.equal(
  isBrowseDiscoverableLibraryCake({
    status: "retired",
    sizeCount: 1,
    hasQualifyingCustomerFacingCatalogue: false,
  }),
  false,
  "7. retired cake with no qualifying historical membership is excluded",
);
assert.equal(
  isBrowseDiscoverableLibraryCake({
    status: "active",
    sizeCount: 0,
    hasQualifyingCustomerFacingCatalogue: false,
  }),
  false,
  "8. no-size cake does not appear",
);

const lemon = resolveBrowsePublishedCake({
  cake: sizedCake("aecba146-e10c-4d69-b165-3afb02611f90", "Refreshing Lemon"),
  cakeStatus: "active",
  catalogues: [],
  showInPopularCakes: false,
  todayYmd: TODAY,
});
assert.equal(lemon?.name, "Refreshing Lemon");
assert.equal(lemon?.currentlyOffered, false, "9. Lemon is not currently orderable");
assert.equal(lemon?.availabilityNote, BROWSE_CURRENTLY_UNAVAILABLE_NOTE);

const decadent = resolveBrowsePublishedCake({
  cake: sizedCake(
    "578100b4-8951-43ce-b495-7f7e1350fdfc",
    "Decadent Chocolate (Dark Chocolate, Slightly Sweeter)",
  ),
  cakeStatus: "active",
  catalogues: [],
  todayYmd: TODAY,
});
assert.equal(
  decadent?.name,
  "Decadent Chocolate (Dark Chocolate, Slightly Sweeter)",
);
assert.equal(decadent?.currentlyOffered, false, "10. Decadent is not currently orderable");

const avocado = resolveBrowsePublishedCake({
  cake: sizedCake("avocado", "Avocado"),
  cakeStatus: "active",
  catalogues: [september],
  todayYmd: TODAY,
});
assert.equal(avocado?.currentlyOffered, true, "3. membership remains currently offered");

const historical = resolveBrowsePublishedCake({
  cake: sizedCake("old", "Archived Flavour"),
  cakeStatus: "retired",
  catalogues: [archivedAugust],
  todayYmd: TODAY,
});
assert.equal(historical?.currentlyOffered, false);
assert.equal(historical?.availabilityNote, BROWSE_CURRENTLY_UNAVAILABLE_NOTE);

assert.equal(
  resolveBrowsePublishedCake({
    cake: sizedCake("draft", "Draft Cake"),
    cakeStatus: "draft",
    catalogues: [],
    showInPopularCakes: true,
    todayYmd: TODAY,
  }),
  null,
  "16. Cake Detail still rejects draft cakes, including Popular Cakes",
);

assert.equal(
  resolveBrowsePublishedCake({
    cake: sizedCake("ready", "Ready Cake"),
    cakeStatus: "ready_for_release",
    catalogues: [],
    todayYmd: TODAY,
  }),
  null,
);

const popularNoCollection = resolveBrowsePublishedCake({
  cake: sizedCake("popular", "Popular Seasonal"),
  cakeStatus: "seasonal",
  catalogues: [],
  showInPopularCakes: true,
  todayYmd: TODAY,
});
assert.equal(popularNoCollection?.currentlyOffered, false, "12. Popular Cakes is not orderability");
assert.equal(
  popularNoCollection?.availabilityNote,
  BROWSE_CURRENTLY_UNAVAILABLE_NOTE,
);

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
const browseFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listBrowsePublishedCakes"),
  queriesSrc.indexOf("type LiveCakeCommercialRow"),
);
assert.match(browseFn, /collection_cakes/);
assert.match(browseFn, /from\("library_cakes"\)/);
assert.match(browseFn, /\.in\("status", \["active", "seasonal"\]\)/);
assert.match(browseFn, /cakeById\.has/);
assert.match(browseFn, /isCurrentlyCustomerOrderable/);
assert.match(browseFn, /isCustomerFacingHistoricalCatalogue/);
assert.doesNotMatch(browseFn, /submit_guest_preorder/);
assert.doesNotMatch(browseFn, /listAvailableCakes/);
assert.doesNotMatch(browseFn, /listOfferableLibraryCakes/);
assert.doesNotMatch(browseFn, /bakery_notes/);

assert.match(
  queriesSrc,
  /isBrowseDiscoverableLibraryCake/,
  "Browse list and Cake Detail share the visibility helper",
);
assert.match(
  readSrc("src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx"),
  /hideAddToOrder=\{cake\.currentlyOffered === false\}/,
  "11. no-collection live cake hides Add to Order",
);
assert.match(
  readSrc("src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx"),
  /hideAddToOrder=\{cake\.currentlyOffered === false\}/,
);

console.log("PASS browse visibility");
