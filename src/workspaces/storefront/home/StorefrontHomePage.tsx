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
import {
  BrowseMark,
  CakeMark,
  SparkMark,
} from "@/workspaces/storefront/home/HomeMarks";
import { HomeOrderSummary } from "@/workspaces/storefront/home/HomeOrderSummary";
import { HomePopularCakes } from "@/workspaces/storefront/home/HomePopularCakes";
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
          <header className="px-6 pt-4 sm:px-10 sm:pt-5">
            <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-4 md:grid md:grid-cols-[1fr_auto_1fr]">
              <p className={storefrontKickerClass}>Whitebird</p>
              <nav className="text-skyline flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-sm md:justify-center">
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
                  <span className="md:hidden">Browse</span>
                  <span className="hidden md:inline">Browse Cakes</span>
                </Link>
                <Link
                  className="hover:text-ink transition-colors duration-200"
                  href="/extra"
                >
                  Fresh Picks
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

      <div className="px-6 sm:px-10">
        <div className="mx-auto w-full max-w-6xl">
          <StorefrontStaffSignIn />
        </div>
      </div>

      <PreorderInProgressBar desktopRail={false} />
    </main>
  );
}
