import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import {
  StorefrontStaffSignIn,
  storefrontKickerClass,
} from "@/workspaces/storefront/StorefrontBrand";
import { StorefrontTheme } from "@/workspaces/storefront/StorefrontTheme";
import { listStorefrontAvailableExtra } from "@/workspaces/storefront/extra/queries";
import { StorefrontFreshPicksCard } from "@/workspaces/storefront/home/StorefrontFreshPicksCard";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";

export const dynamic = "force-dynamic";

type ActionCardProps = {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
};

function ActionCard({
  title,
  description,
  actionLabel,
  href,
}: ActionCardProps) {
  return (
    <article className="border-fog flex h-full flex-col border-t pt-6">
      <h3 className="font-display text-ink text-2xl tracking-tight">{title}</h3>
      <p className="text-skyline mt-3 flex-1 text-sm leading-relaxed">
        {description}
      </p>
      <Link
        className="text-ink hover:text-skyline mt-8 inline-flex min-h-11 items-center text-sm font-medium transition-colors duration-200"
        href={href}
      >
        {actionLabel} →
      </Link>
    </article>
  );
}

export async function StorefrontHomePage() {
  const picks = await listStorefrontAvailableExtra();
  const hero = picks.find((pick) => pick.imageUrl) ?? null;

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

      <section className="px-6 pt-10 pb-10 sm:px-10 sm:pt-16 sm:pb-14">
        <div className="mx-auto grid w-full max-w-5xl items-end gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div>
            <h1 className="font-display text-ink max-w-xl text-[1.85rem] leading-[1.15] tracking-tight sm:text-5xl">
              Every celebration begins here.
            </h1>
            <p className="text-skyline mt-4 max-w-lg text-[0.95rem] leading-relaxed sm:mt-6 sm:text-base">
              Whether you&apos;re planning ahead or looking for a cake today,
              we&apos;ll help you find the perfect cake for your celebration.
            </p>
          </div>
          {hero?.imageUrl ? (
            <div className="bg-fog relative aspect-[4/3] overflow-hidden sm:aspect-[5/4]">
              <CakePhotoImage
                alt={hero.imageAlt || hero.cakeName}
                priority
                sizes="(min-width: 1024px) 40vw, 100vw"
                src={hero.imageUrl}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="px-6 pb-16 sm:px-10 sm:pb-20">
        <div className="mx-auto w-full max-w-5xl">
          <PreorderInProgressBar />
          <div className="grid gap-8 md:grid-cols-3 md:gap-10">
            <ActionCard
              actionLabel="Start Ordering"
              description="Choose a monthly collection or Special Menu."
              href="/order"
              title="Order a Cake"
            />
            <ActionCard
              actionLabel="Browse Cakes"
              description="All cakes currently published for Whitebird."
              href="/browse"
              title="Browse Cakes"
            />
            <StorefrontFreshPicksCard days={picks.map((pick) => pick.day)} />
          </div>
          <StorefrontStaffSignIn />
        </div>
      </section>
    </main>
  );
}
