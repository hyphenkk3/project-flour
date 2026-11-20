import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import {
  SPECIAL_MENU_DESCRIPTION,
  SPECIAL_MENU_HEADING,
  catalogueMonthPickupBounds,
  customerSpecialMenuPeriodLabel,
  orderCollectionHeadline,
  orderCollectionPickupCopy,
  storefrontCakeDetailHref,
  suggestedPickupDateForCatalogueMonth,
} from "@/engines/menu/customer-browse";
import { sortHomepageFreshPicks } from "@/engines/extra/customer-fresh-picks";
import {
  selectHomepageFeaturedCollections,
  type HomepageFeaturedKind,
} from "@/engines/menu/homepage-featured-collections";
import { businessYearMonth, toBusinessDateKey } from "@/lib/dates";
import {
  StorefrontStaffSignIn,
  storefrontKickerClass,
} from "@/workspaces/storefront/StorefrontBrand";
import { StorefrontTheme } from "@/workspaces/storefront/StorefrontTheme";
import { StorefrontRetryNotice } from "@/workspaces/storefront/StorefrontRetryNotice";
import {
  listHomepageCollectionPreviewCakes,
  listHomepagePopularCakes,
  listCustomerSpecialCatalogues,
  listOrderableMonthlyCatalogues,
  type StorefrontSpecialCatalogue,
} from "@/workspaces/storefront/catalog/queries";
import {
  settleStorefrontRead,
  storefrontReadFailureMessage,
} from "@/workspaces/storefront/catalog/storefront-read-resilience";
import {
  CakeEntryScopeCapture,
  CakeEntryScopeClearOnUnscopedCakeClick,
} from "@/workspaces/storefront/catalog/CakeEntryScopeCapture";
import type { CakeEntryCaptureScope } from "@/workspaces/storefront/catalog/cake-entry-scope";
import { StorefrontListingRestore } from "@/workspaces/storefront/catalog/StorefrontListingRestore";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";
import { listStorefrontAvailableExtra } from "@/workspaces/storefront/extra/queries";
import {
  HomeBrowseAllCakes,
  HomeCatalogueBlock,
} from "@/workspaces/storefront/home/HomeBrowseAllCakes";
import { HomeFeaturedCollection } from "@/workspaces/storefront/home/HomeFeaturedCollection";
import { HomeFreshPicksSection } from "@/workspaces/storefront/home/HomeFreshPicksSection";
import { HomeHero } from "@/workspaces/storefront/home/HomeHero";
import { HomeMobileNav } from "@/workspaces/storefront/home/HomeMobileNav";
import { HomeMoreCollections } from "@/workspaces/storefront/home/HomeMoreCollections";
import { HomeOrderSummary } from "@/workspaces/storefront/home/HomeOrderSummary";
import { HomePopularCakes } from "@/workspaces/storefront/home/HomePopularCakes";
import { HomeVisitFooter } from "@/workspaces/storefront/home/HomeVisitFooter";
import { StorefrontCakePrefetch } from "@/workspaces/storefront/home/StorefrontCakePrefetch";
import type { StorefrontCake } from "@/types/storefront";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import {
  buildTargetedPromotionBadgeByCakeId,
  cakeHasNewMerchandisingTag,
  sortCakesForCataloguePromotionPresentation,
} from "@/engines/vouchers/catalogue-promotion-presentation";
import { cataloguePromotionPeriodFromWindow } from "@/engines/vouchers/catalogue-voucher";
import { listPublicCatalogueVouchersStrict } from "@/workspaces/vouchers/catalogue-queries";

function monthDisplayName(monthYmd: string): string {
  return orderCollectionHeadline(monthYmd).replace(/ \d{4}/, "");
}

function collectionCakeEntries(input: {
  kind: HomepageFeaturedKind;
  month: string | null;
  startDate?: string;
  endDate?: string;
  cakes: readonly StorefrontCake[];
}): {
  hrefs: Record<string, string>;
  scopes: Record<string, CakeEntryCaptureScope>;
  fulfilmentFrom: string | null;
  fulfilmentTo: string | null;
} {
  const earliest = earliestPickupDateYmd();
  let from = "";
  let to = "";
  let pickup: string | null = null;

  if (input.kind === "special" && input.startDate && input.endDate) {
    from = input.startDate;
    to = input.endDate;
    pickup = input.startDate;
  } else if (input.month) {
    const bounds = catalogueMonthPickupBounds(input.month);
    if (!bounds) {
      return { hrefs: {}, scopes: {}, fulfilmentFrom: null, fulfilmentTo: null };
    }
    from = bounds.from;
    to = bounds.to;
    pickup = suggestedPickupDateForCatalogueMonth(input.month, earliest);
  } else {
    return { hrefs: {}, scopes: {}, fulfilmentFrom: null, fulfilmentTo: null };
  }

  const scope: CakeEntryCaptureScope = {
    from,
    to,
    pickup,
    origin: "home",
  };
  return {
    hrefs: Object.fromEntries(
      input.cakes.map((cake) => [cake.id, storefrontCakeDetailHref(cake.id)]),
    ),
    scopes: Object.fromEntries(
      input.cakes.map((cake) => [cake.id, scope]),
    ),
    fulfilmentFrom: from,
    fulfilmentTo: to,
  };
}

function featuredCopy(input: {
  kind: HomepageFeaturedKind;
  month: string | null;
  todayYm: string;
  special?: StorefrontSpecialCatalogue;
}): {
  kicker: string;
  heading: string;
  description: string;
  viewAllLabel: string;
  moreSupporting: string;
} {
  if (input.kind === "special") {
    const heading = input.special?.name?.trim() || SPECIAL_MENU_HEADING;
    const period = input.special
      ? customerSpecialMenuPeriodLabel(
          input.special.startDate,
          input.special.endDate,
        )
      : null;
    return {
      kicker: "Special Menu",
      heading,
      description: period ?? SPECIAL_MENU_DESCRIPTION,
      viewAllLabel: `View all ${heading} →`,
      moreSupporting: period ?? "Now accepting orders",
    };
  }

  const heading = input.month ? monthDisplayName(input.month) : "Collection";
  if (input.kind === "current_monthly") {
    return {
      kicker: "Current collection",
      heading,
      description: "Our current selection of cakes for your celebrations.",
      viewAllLabel: `View all ${heading} →`,
      moreSupporting: input.month
        ? orderCollectionPickupCopy(input.month, input.todayYm)
        : "Now accepting orders",
    };
  }

  return {
    kicker: "Now accepting orders",
    heading,
    description: input.month
      ? orderCollectionPickupCopy(input.month, input.todayYm)
      : "Preorders are now open.",
    viewAllLabel: `View all ${heading} →`,
    moreSupporting: "Now accepting orders",
  };
}

function HomeHeroHeader() {
  return (
    <header className="px-6 pt-2 sm:px-10 md:pt-5">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 md:grid md:grid-cols-[1fr_auto_1fr] md:items-baseline">
        <p className={storefrontKickerClass}>Whitebird</p>
        <div className="md:hidden">
          <HomeMobileNav />
        </div>
        <nav className="text-skyline hidden flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm md:flex">
          <Link
            className="hover:text-ink active:opacity-70 transition-colors duration-200"
            href="/order"
          >
            Order
          </Link>
          <Link
            className="hover:text-ink active:opacity-70 transition-colors duration-200"
            href="/browse"
          >
            Browse Cakes
          </Link>
          <Link
            className="hover:text-ink active:opacity-70 transition-colors duration-200"
            href="/offers"
          >
            Current Offers
          </Link>
          <Link
            className="hover:text-ink active:opacity-70 transition-colors duration-200"
            href="/extra"
          >
            Fresh Picks
          </Link>
          <Link
            className="hover:text-ink active:opacity-70 transition-colors duration-200"
            href="/faq"
          >
            FAQ
          </Link>
        </nav>
        <span aria-hidden="true" className="hidden md:block" />
      </div>
    </header>
  );
}

function HomeFreshPicksFallback() {
  return (
    <section aria-busy="true" className="px-6 pt-4 pb-2 sm:px-10 md:pt-8">
      <div className="mx-auto w-full max-w-6xl">
        <p className={storefrontKickerClass}>Last-minute</p>
        <h2 className="font-display text-ink mt-2 text-[1.45rem] tracking-tight">
          Fresh Picks
        </h2>
        <div className="bg-fog mt-4 h-[5.5rem] w-[5.5rem] rounded-[10px] lg:h-[10.5rem] lg:w-[10.5rem]" />
      </div>
    </section>
  );
}

function HomeMerchandisingFallback() {
  return (
    <section aria-busy="true" className="border-ink/[0.1] mt-8 border-t px-6 pt-8 sm:px-10">
      <div className="mx-auto flex w-full max-w-6xl gap-3">
        <div className="bg-fog h-24 w-24 shrink-0 rounded-[10px] lg:h-[10.5rem] lg:w-[10.5rem]" />
        <div className="bg-fog h-24 w-24 shrink-0 rounded-[10px] lg:h-[10.5rem] lg:w-[10.5rem]" />
        <div className="bg-fog h-24 w-24 shrink-0 rounded-[10px] lg:h-[10.5rem] lg:w-[10.5rem]" />
      </div>
    </section>
  );
}

export async function StorefrontHomePage() {
  await connection();

  return (
    <main className="bg-paper min-h-dvh overflow-x-clip">
      <StorefrontTheme />
      <HomeHero header={<HomeHeroHeader />} orderPanel={<HomeOrderSummary />} />

      <Suspense fallback={<HomeFreshPicksFallback />}>
        <HomeFreshPicksIsland />
      </Suspense>
      <CakeEntryScopeClearOnUnscopedCakeClick />
      <Suspense fallback={<HomeMerchandisingFallback />}>
        <HomeMerchandisingIsland />
      </Suspense>

      <PreorderInProgressBar desktopRail={false} />
    </main>
  );
}

async function HomeFreshPicksIsland() {
  let listing: Awaited<ReturnType<typeof listStorefrontAvailableExtra>> | null =
    null;
  let failed = false;

  try {
    listing = await listStorefrontAvailableExtra();
  } catch {
    failed = true;
  }

  if (failed || !listing) {
    return (
      <section className="px-6 pt-4 pb-2 sm:px-10 md:pt-8">
        <div className="mx-auto w-full max-w-6xl">
          <p className={storefrontKickerClass}>Last-minute</p>
          <h2 className="font-display text-ink mt-2 text-[1.45rem] tracking-tight">
            Fresh Picks
          </h2>
          <StorefrontRetryNotice
            title="Fresh Picks are temporarily unavailable"
            message="We couldn’t check current Fresh Pick stock. This does not mean that no stock is available."
          />
        </div>
      </section>
    );
  }

  const rawPicks = listing.picks;
  const picks = sortHomepageFreshPicks(rawPicks);
  return (
    <HomeFreshPicksSection
      picks={picks}
      temporarilyUnavailable={listing.temporarilyUnavailable}
    />
  );
}

async function HomeMerchandisingIsland() {
  try {
    return await HomeMerchandisingContent();
  } catch {
    return (
      <section className="border-ink/[0.1] mt-8 border-t px-6 pt-8 sm:px-10">
        <div className="mx-auto w-full max-w-6xl">
          <StorefrontRetryNotice
            title="Cake collections are temporarily unavailable"
            message="We couldn’t load the latest cake selections. This does not mean cakes or collection dates are unavailable."
          />
          <div className="mt-5">
            <HomeBrowseAllCakes />
          </div>
          <HomeVisitFooter lead={<HomeCatalogueBlock />} />
        </div>
      </section>
    );
  }
}

async function HomeMerchandisingContent() {
  const todayYmd = toBusinessDateKey();
  const todayYm = businessYearMonth(todayYmd) ?? todayYmd.slice(0, 7);
  const [catalogueResult, specialResult, popularResult, voucherResult] =
    await Promise.all([
      settleStorefrontRead(() => listOrderableMonthlyCatalogues(todayYmd)),
      settleStorefrontRead(() => listCustomerSpecialCatalogues(todayYmd)),
      settleStorefrontRead(() => listHomepagePopularCakes()),
      settleStorefrontRead(() => listPublicCatalogueVouchersStrict()),
    ]);
  const catalogues = catalogueResult.ok ? catalogueResult.value : [];
  const specials = specialResult.ok ? specialResult.value : [];
  const popular = popularResult.ok ? popularResult.value : [];
  const vouchers = voucherResult.ok ? voucherResult.value : [];
  const collectionListError = (() => {
    if (!catalogueResult.ok) return catalogueResult.error;
    if (!specialResult.ok) return specialResult.error;
    return null;
  })();
  const selection =
    catalogueResult.ok && specialResult.ok
      ? selectHomepageFeaturedCollections({
          todayYearMonth: todayYm,
          specials,
          monthlies: catalogues,
        })
      : null;

  const featuredResults = await Promise.all(
    (selection?.featured ?? []).map(async (candidate) => {
      const monthly =
        catalogues.find((catalogue) => catalogue.id === candidate.id) ?? null;
      const special = specials.find((row) => row.id === candidate.id) ?? null;
      const copy = featuredCopy({
        kind: candidate.kind,
        month: monthly?.month ?? null,
        todayYm,
        special: special ?? undefined,
      });
      const previewResult = await settleStorefrontRead(() =>
        listHomepageCollectionPreviewCakes(candidate.id),
      );
      if (!previewResult.ok) {
        return {
          ok: false as const,
          candidate,
          copy,
          error: previewResult.error,
        };
      }
      const cakes = previewResult.value;
      const cakeEntries = collectionCakeEntries({
        kind: candidate.kind,
        month: monthly?.month ?? null,
        startDate: special?.startDate,
        endDate: special?.endDate,
        cakes,
      });
      return {
        ok: true as const,
        collection: {
          id: candidate.id,
          href: `/order/collection/${candidate.id}`,
          cakes,
          cakeHrefs: cakeEntries.hrefs,
          cakeScopes: cakeEntries.scopes,
          fulfilmentFrom: cakeEntries.fulfilmentFrom,
          fulfilmentTo: cakeEntries.fulfilmentTo,
          ...copy,
        },
      };
    }),
  );
  const offerToday = singaporeDateFromIso(new Date().toISOString());
  const featuredWithPromotions = featuredResults.flatMap((result) => {
    if (!result.ok) return [];
    const collection = result.collection;
    const period =
      collection.fulfilmentFrom && collection.fulfilmentTo
        ? cataloguePromotionPeriodFromWindow({
            today: offerToday,
            fulfilmentFrom: collection.fulfilmentFrom,
            fulfilmentTo: collection.fulfilmentTo,
          })
        : null;
    const promotions = Object.fromEntries(
      buildTargetedPromotionBadgeByCakeId(
        vouchers,
        offerToday,
        "preorder",
        period,
        { collectionMerchandising: true },
      ),
    );
    return [
      {
        ...collection,
        promotions,
        cakes: sortCakesForCataloguePromotionPresentation(collection.cakes, {
          isNew: cakeHasNewMerchandisingTag,
          isTargetedPromotion: (cake) => Boolean(promotions[cake.id]),
          manualOrder: (_cake, index) => index + 1,
        }),
      },
    ];
  });

  const more = (selection?.more ?? []).map((candidate) => {
    const monthly =
      catalogues.find((catalogue) => catalogue.id === candidate.id) ?? null;
    const special = specials.find((row) => row.id === candidate.id) ?? null;
    const copy = featuredCopy({
      kind: candidate.kind,
      month: monthly?.month ?? null,
      todayYm,
      special: special ?? undefined,
    });
    return {
      href: `/order/collection/${candidate.id}`,
      heading: copy.heading,
      supporting: copy.moreSupporting,
    };
  });

  return (
    <>
      {!catalogueResult.ok || !specialResult.ok ? (
        <section className="border-ink/[0.1] mt-8 border-t px-6 pt-8 sm:px-10">
          <div className="mx-auto w-full max-w-6xl">
            <StorefrontRetryNotice
              title="Cake collections are temporarily unavailable"
              message={storefrontReadFailureMessage(
                collectionListError,
                "cake collection list",
              )}
            />
          </div>
        </section>
      ) : null}
      {!voucherResult.ok ? (
        <StorefrontRetryNotice
          title="Current offers are temporarily unavailable"
          message={storefrontReadFailureMessage(
            voucherResult.error,
            "current offer details",
          )}
        />
      ) : null}
      {featuredResults.map((result) =>
        result.ok ? null : (
          <section
            className="border-ink/[0.1] mt-8 border-t px-6 pt-8 sm:px-10"
            key={result.candidate.id}
          >
            <div className="mx-auto w-full max-w-6xl">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-ink text-[1.45rem] leading-tight tracking-tight">
                  {result.copy.heading}
                </h2>
                <Link
                  className="text-skyline hover:text-ink shrink-0 text-[13px] font-medium"
                  data-storefront-collection-intent
                  href={`/order/collection/${result.candidate.id}`}
                  prefetch={false}
                >
                  View all →
                </Link>
              </div>
              <StorefrontRetryNotice
                title={`${result.copy.heading} preview is temporarily unavailable`}
                message={storefrontReadFailureMessage(
                  result.error,
                  `${result.copy.heading} cake preview`,
                )}
              />
            </div>
          </section>
        ),
      )}
      <StorefrontCakePrefetch
        excludeIds={popular.map((cake) => cake.id)}
        hrefs={featuredWithPromotions.flatMap((collection) =>
          Object.values(collection.cakeHrefs),
        )}
      />
      {featuredWithPromotions.map((collection) => (
        <CakeEntryScopeCapture
          key={collection.id}
          scopes={collection.cakeScopes}
        >
          <HomeFeaturedCollection
            cakeHrefs={collection.cakeHrefs}
            cakes={collection.cakes}
            description={collection.description}
            heading={collection.heading}
            kicker={collection.kicker}
            promotions={collection.promotions}
            viewAllHref={collection.href}
            viewAllLabel={collection.viewAllLabel}
          />
        </CakeEntryScopeCapture>
      ))}
      {popularResult.ok ? (
        <CakeEntryScopeCapture
          scopes={Object.fromEntries(
            popular.map((cake) => [cake.id, { origin: "home" as const }]),
          )}
        >
          <HomePopularCakes cakes={popular} />
        </CakeEntryScopeCapture>
      ) : (
        <section className="border-ink/[0.1] mt-8 min-w-0 border-t px-6 pt-8 sm:px-10">
          <div className="mx-auto w-full max-w-6xl">
            <h2 className="font-display text-ink text-xl tracking-tight sm:text-2xl">
              Popular Cakes
            </h2>
            <StorefrontRetryNotice
              title="Popular Cakes are temporarily unavailable"
              message={storefrontReadFailureMessage(
                popularResult.error,
                "Popular Cakes",
              )}
            />
          </div>
        </section>
      )}
      <StorefrontListingRestore origin="home" />
      <HomeMoreCollections items={more} />
      <HomeBrowseAllCakes />

      <HomeVisitFooter lead={<HomeCatalogueBlock />} />

      <div className="px-6 sm:px-10">
        <div className="mx-auto w-full max-w-6xl">
          <StorefrontStaffSignIn />
        </div>
      </div>
    </>
  );
}
