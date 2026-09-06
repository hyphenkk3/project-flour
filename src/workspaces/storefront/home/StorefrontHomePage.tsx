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
  const extraPhotos = picks.filter((pick) => pick.imageUrl);
  const popularWithPhotos = popular.filter((cake) => cake.image);
  const orderPhoto = extraPhotos[0] ?? null;
  const browseCake = popularWithPhotos[0] ?? null;

  return (
    <main className="bg-paper min-h-dvh overflow-x-clip">
      <StorefrontTheme />
      <header className="relative z-20 px-6 pt-5 sm:px-10 sm:pt-6">
        <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-4">
          <p className={storefrontKickerClass}>Whitebird</p>
          <nav className="text-skyline flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-sm">
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
        </div>
      </header>

      <HomeHero orderPanel={<HomeOrderSummary />} />

      <section className="px-6 pb-5 sm:px-10 sm:pb-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid gap-3 md:grid-cols-3 md:gap-3.5">
            <HomeDestinationCard
              actionLabel="Start Ordering"
              ctaVariant="solid"
              description="Choose a monthly collection or Special Menu."
              href="/order"
              icon={<CakeMark className="h-3.5 w-3.5" />}
              imageAlt={orderPhoto?.imageAlt}
              imageUrl={orderPhoto?.imageUrl}
              title="Order a Cake"
              tone="blush"
            />
            <HomeDestinationCard
              actionLabel="Browse Cakes"
              description="All cakes currently published for Whitebird."
              href="/browse"
              icon={<BrowseMark className="h-3.5 w-3.5" />}
              imageAlt={browseCake?.name}
              imageUrl={browseCake?.image}
              title="Browse Cakes"
              tone="sage"
            />
            <StorefrontFreshPicksCard
              days={picks.map((pick) => pick.day)}
              icon={<SparkMark className="h-3.5 w-3.5" />}
              imageAlt={featured?.imageAlt ?? extraPhotos[0]?.imageAlt}
              imageUrl={featured?.imageUrl ?? extraPhotos[0]?.imageUrl}
            />
          </div>
        </div>
      </section>

      <section className="px-6 pb-10 sm:px-10 sm:pb-12">
        <div className="border-fog/80 mx-auto grid w-full max-w-6xl gap-7 border-t pt-5 md:grid-cols-[minmax(0,0.38fr)_minmax(0,0.62fr)] md:gap-8 lg:gap-10">
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
