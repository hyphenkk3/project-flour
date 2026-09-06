import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import {
  StorefrontStaffSignIn,
  storefrontKickerClass,
} from "@/workspaces/storefront/StorefrontBrand";
import { StorefrontTheme } from "@/workspaces/storefront/StorefrontTheme";
import { listStorefrontAvailableExtra } from "@/workspaces/storefront/extra/queries";
import { HomeDestinationCard } from "@/workspaces/storefront/home/HomeDestinationCard";
import { StorefrontFreshPicksCard } from "@/workspaces/storefront/home/StorefrontFreshPicksCard";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";

export const dynamic = "force-dynamic";

export async function StorefrontHomePage() {
  const picks = await listStorefrontAvailableExtra();
  const photos = picks.filter((pick) => pick.imageUrl);
  const hero = photos[0] ?? null;
  const orderPhoto = photos[1] ?? null;
  const browsePhoto = photos[2] ?? null;
  const freshPhoto = photos[0] ?? null;

  return (
    <main className="bg-paper min-h-dvh">
      <StorefrontTheme />
      <header className="px-6 pt-6 sm:px-10 sm:pt-8">
        <div className="mx-auto flex w-full max-w-5xl items-baseline justify-between gap-4">
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
              Browse
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

      <section className="px-6 pt-7 pb-4 sm:px-10 sm:pt-12 sm:pb-8">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-5 sm:gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)] lg:gap-14">
          <div>
            <h1 className="font-display text-ink max-w-xl text-[1.85rem] leading-[1.15] tracking-tight sm:text-5xl">
              Every celebration begins here.
            </h1>
            <p className="text-skyline mt-3 max-w-lg text-[0.95rem] leading-relaxed sm:mt-5 sm:text-base">
              Whether you&apos;re planning ahead or looking for a cake today,
              we&apos;ll help you find the perfect cake for your celebration.
            </p>
          </div>
          {hero?.imageUrl ? (
            <div className="relative h-28 overflow-hidden sm:h-40 lg:h-52">
              <CakePhotoImage
                alt={hero.imageAlt || hero.cakeName}
                priority
                sizes="(min-width: 1024px) 28vw, 50vw"
                src={hero.imageUrl}
              />
              <div className="from-paper absolute inset-0 bg-gradient-to-r from-10% to-transparent lg:from-paper lg:via-transparent" />
            </div>
          ) : null}
        </div>
      </section>

      <section className="px-6 pb-14 sm:px-10 sm:pb-20">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-skyline mb-3 text-[11px] font-medium tracking-[0.18em] uppercase sm:mb-5">
            Preorder · Pickup · WhatsApp
          </p>
          <PreorderInProgressBar />
          <div className="grid gap-3 md:grid-cols-3 md:gap-4">
            <HomeDestinationCard
              actionLabel="Start Ordering"
              description="Choose a monthly collection or Special Menu."
              href="/order"
              imageAlt={orderPhoto?.imageAlt}
              imageUrl={orderPhoto?.imageUrl}
              title="Order a Cake"
              tone="cream"
            />
            <HomeDestinationCard
              actionLabel="Browse Cakes"
              description="All cakes currently published for Whitebird."
              href="/browse"
              imageAlt={browsePhoto?.imageAlt}
              imageUrl={browsePhoto?.imageUrl}
              title="Browse Cakes"
              tone="sage"
            />
            <StorefrontFreshPicksCard
              days={picks.map((pick) => pick.day)}
              imageAlt={freshPhoto?.imageAlt}
              imageUrl={freshPhoto?.imageUrl}
            />
          </div>
          <StorefrontStaffSignIn />
        </div>
      </section>
    </main>
  );
}
