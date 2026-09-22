import { Suspense } from "react";
import Link from "next/link";
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
import {
  listHomepageCollectionPreviewCakes,
  listHomepagePopularCakes,
  listCustomerSpecialCatalogues,
  listOrderableMonthlyCatalogues,
  type StorefrontSpecialCatalogue,
} from "@/workspaces/storefront/catalog/queries";
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
    if (!bounds) return { hrefs: {}, scopes: {} };
    from = bounds.from;
    to = bounds.to;
    pickup = suggestedPickupDateForCatalogueMonth(input.month, earliest);
  } else {
    return { hrefs: {}, scopes: {} };
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

export function StorefrontHomePage() {
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
  const rawPicks = await listStorefrontAvailableExtra();
  const picks = sortHomepageFreshPicks(rawPicks);
  return <HomeFreshPicksSection picks={picks} />;
}

async function HomeMerchandisingIsland() {
  const todayYmd = toBusinessDateKey();
  const todayYm = businessYearMonth(todayYmd) ?? todayYmd.slice(0, 7);
  const popularPromise = listHomepagePopularCakes();
  const [catalogues, specials] = await Promise.all([
    listOrderableMonthlyCatalogues(todayYmd),
    listCustomerSpecialCatalogues(todayYmd),
  ]);
  const selection = selectHomepageFeaturedCollections({
    todayYearMonth: todayYm,
    specials,
    monthlies: catalogues,
  });

  const [popular, featured] = await Promise.all([
    popularPromise,
    Promise.all(
      selection.featured.map(async (candidate) => {
      const monthly =
        catalogues.find((catalogue) => catalogue.id === candidate.id) ?? null;
      const special =
        specials.find((row) => row.id === candidate.id) ?? null;
      const cakes = await listHomepageCollectionPreviewCakes(candidate.id);
      const copy = featuredCopy({
        kind: candidate.kind,
        month: monthly?.month ?? null,
        todayYm,
        special: special ?? undefined,
      });
      const cakeEntries = collectionCakeEntries({
        kind: candidate.kind,
        month: monthly?.month ?? null,
        startDate: special?.startDate,
        endDate: special?.endDate,
        cakes,
      });
      return {
        id: candidate.id,
        href: `/order/collection/${candidate.id}`,
        cakes,
        cakeHrefs: cakeEntries.hrefs,
        cakeScopes: cakeEntries.scopes,
        ...copy,
      };
      }),
    ),
  ]);

  const more = selection.more.map((candidate) => {
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
      <StorefrontCakePrefetch
        excludeIds={popular.map((cake) => cake.id)}
        hrefs={featured.flatMap((collection) =>
          Object.values(collection.cakeHrefs),
        )}
      />
      {featured.map((collection) => (
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
            viewAllHref={collection.href}
            viewAllLabel={collection.viewAllLabel}
          />
        </CakeEntryScopeCapture>
      ))}
      <CakeEntryScopeCapture
        scopes={Object.fromEntries(
          popular.map((cake) => [cake.id, { origin: "home" as const }]),
        )}
      >
        <HomePopularCakes cakes={popular} />
      </CakeEntryScopeCapture>
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
