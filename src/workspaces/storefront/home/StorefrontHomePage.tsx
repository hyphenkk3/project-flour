import Link from "next/link";
import { StorefrontStaffSignIn } from "@/workspaces/storefront/StorefrontBrand";
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
    <article className="border-fog hover:border-signal/40 flex h-full flex-col rounded-3xl border bg-white p-7 transition duration-200">
      <h3 className="text-ink text-xl font-medium tracking-tight">{title}</h3>
      <p className="text-skyline mt-3 flex-1 text-sm leading-relaxed">
        {description}
      </p>
      <Link
        className="bg-ink text-mist hover:bg-skyline mt-8 inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition"
        href={href}
      >
        {actionLabel}
      </Link>
    </article>
  );
}

export async function StorefrontHomePage() {
  const picks = await listStorefrontAvailableExtra();

  return (
    <main className="bg-mist min-h-dvh">
      <section className="relative overflow-hidden px-6 pt-14 pb-10 sm:px-10 sm:pt-16 sm:pb-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#f6f8fa_0%,#eef2f5_100%)]"
        />
        <div className="relative mx-auto w-full max-w-3xl">
          <p className="text-signal text-[11px] font-semibold tracking-[0.28em] uppercase">
            Whitebird
          </p>
          <h1 className="font-display text-ink mt-6 max-w-xl text-[2rem] leading-[1.15] tracking-tight sm:text-4xl">
            Every celebration begins here.
          </h1>
          <p className="text-skyline mt-4 max-w-lg text-[0.95rem] leading-relaxed sm:text-base">
            Whether you&apos;re planning ahead or looking for a cake today,
            we&apos;ll help you find the perfect cake for your celebration.
          </p>
        </div>
      </section>

      <section className="px-6 pb-16 sm:px-10 sm:pb-20">
        <div className="mx-auto w-full max-w-5xl">
          <PreorderInProgressBar />
          <div className="grid gap-4 md:grid-cols-3 md:gap-5">
            <ActionCard
              actionLabel="Start Ordering"
              description="Ready to place an order? We'll guide you step by step."
              href="/order"
              title="Order a Cake"
            />
            <ActionCard
              actionLabel="Browse Cakes"
              description="Discover our current collection and explore some of our favourite creations."
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
