import Link from "next/link";
import {
  StorefrontStaffSignIn,
  storefrontKickerClass,
} from "@/workspaces/storefront/StorefrontBrand";
import { StorefrontTheme } from "@/workspaces/storefront/StorefrontTheme";
import { listHomepagePopularCakes } from "@/workspaces/storefront/catalog/queries";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";
import {
  getStorefrontExtraById,
  listStorefrontAvailableExtra,
} from "@/workspaces/storefront/extra/queries";
import { HomeDestinationCard } from "@/workspaces/storefront/home/HomeDestinationCard";
import { HomeFeaturedFreshPick } from "@/workspaces/storefront/home/HomeFeaturedFreshPick";
import { HomeHero } from "@/workspaces/storefront/home/HomeHero";
import { HomeMobileNav } from "@/workspaces/storefront/home/HomeMobileNav";
import {
  BrowseMark,
  CakeMark,
  SparkMark,
} from "@/workspaces/storefront/home/HomeMarks";
import { HomeOrderSummary } from "@/workspaces/storefront/home/HomeOrderSummary";
import { HomePopularCakes } from "@/workspaces/storefront/home/HomePopularCakes";
import { HomeVisitFooter } from "@/workspaces/storefront/home/HomeVisitFooter";
import { StorefrontFreshPicksCard } from "@/workspaces/storefront/home/StorefrontFreshPicksCard";

export const dynamic = "force-dynamic";

export async function StorefrontHomePage() {
  const [picks, popular] = await Promise.all([
    listStorefrontAvailableExtra(),
    listHomepagePopularCakes(),
  ]);
  const featuredSeed =
    picks.find((pick) => pick.day === "today") ?? picks[0] ?? null;
  const featured = featuredSeed
    ? ((await getStorefrontExtraById(featuredSeed.id)) ?? featuredSeed)
    : null;

  return (
    <main className="bg-paper min-h-dvh overflow-x-clip">
      <StorefrontTheme />
      <HomeHero
        header={
          <header className="px-6 pt-2 sm:px-10 md:pt-5">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 md:grid md:grid-cols-[1fr_auto_1fr] md:items-baseline">
              <p className={storefrontKickerClass}>Whitebird</p>
              <div className="flex items-center md:hidden">
                <Link
                  className="text-skyline hover:text-ink inline-flex min-h-11 items-center px-2.5 text-sm transition-colors duration-200"
                  href="/order"
                >
                  Order
                </Link>
                <HomeMobileNav />
              </div>
              <nav className="text-skyline hidden flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm md:flex">
                <Link
                  className="hover:text-ink transition-colors duration-200"
                  href="/order"
                >
                  Order
                </Link>
                <Link
                  className="hover:text-ink transition-colors duration-200"
                  href="/browse"
                >
                  Browse Cakes
                </Link>
                <Link
                  className="hover:text-ink transition-colors duration-200"
                  href="/extra"
                >
                  Fresh Picks
                </Link>
                <Link
                  className="hover:text-ink transition-colors duration-200"
                  href="/faq"
                >
                  FAQ
                </Link>
              </nav>
              <span aria-hidden="true" className="hidden md:block" />
            </div>
          </header>
        }
        orderPanel={<HomeOrderSummary />}
      />

      <section className="px-6 pb-3 sm:px-10 sm:pb-4 md:pt-2.5">
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid gap-3 md:grid-cols-3 md:gap-3.5">
            <HomeDestinationCard
              actionLabel="Start Ordering"
              ctaVariant="ink"
              description="Choose a monthly collection or Special Menu."
              href="/order"
              icon={<CakeMark className="h-3.5 w-3.5" />}
              title="Order a Cake"
              tone="blush"
            />
            <HomeDestinationCard
              actionLabel="Browse Cakes"
              ctaVariant="soft"
              description="Explore our full collection and find your favourite."
              href="/browse"
              icon={<BrowseMark className="h-3.5 w-3.5" />}
              title="Browse Cakes"
              tone="sage"
            />
            <StorefrontFreshPicksCard
              days={picks.map((pick) => pick.day)}
              icon={<SparkMark className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      </section>

      <section className="px-6 pb-9 sm:px-10 sm:pb-10">
        <div className="border-fog/70 mx-auto grid w-full max-w-6xl gap-5 border-t pt-3 md:grid-cols-[minmax(0,0.37fr)_minmax(0,0.63fr)] md:gap-8">
          <HomeFeaturedFreshPick pick={featured} />
          <HomePopularCakes cakes={popular} />
        </div>
      </section>

      <HomeVisitFooter />

      <div className="px-6 sm:px-10">
        <div className="mx-auto w-full max-w-6xl">
          <StorefrontStaffSignIn />
        </div>
      </div>

      <PreorderInProgressBar desktopRail={false} />
    </main>
  );
}
