import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/lib/design-tokens";
import {
  CAKE_DETAIL_BADGE_LABEL,
  type CakeDetail,
  type CakeDetailBadge,
} from "@/workspaces/customer-website/browse/cake-detail-demo";
import { CakeOrderPanel } from "@/workspaces/customer-website/order/CakeOrderPanel";

const BADGE_TONE: Record<CakeDetailBadge, StatusTone> = {
  less_sweet: "info",
  bestseller: "warning",
  seasonal: "success",
};

type CakeDetailPageProps = {
  cake: CakeDetail;
  journeyActive?: boolean;
};

export function CakeDetailPage({
  cake,
  journeyActive = false,
}: CakeDetailPageProps) {
  const isClassic = cake.section === "classics";

  return (
    <main className="bg-mist min-h-dvh">
      <div className="mx-auto w-full max-w-6xl px-6 pt-8 pb-24 sm:px-10 sm:pt-12 sm:pb-28">
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
          href={journeyActive ? "/browse?step=website" : "/browse"}
        >
          ← Browse Cakes
        </Link>

        <div className="mt-8 grid gap-10 lg:mt-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-14">
          <div className="motion-safe:animate-fade-in relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-white sm:aspect-[5/6] lg:sticky lg:top-10">
            <Image
              alt={cake.imageAlt}
              className={`object-cover ${isClassic ? "opacity-95" : ""}`}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              src={cake.imageUrl}
            />
          </div>

          <div className="motion-safe:animate-rise space-y-10">
            <header className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {cake.badges.map((badge) => (
                  <StatusBadge
                    key={badge}
                    label={CAKE_DETAIL_BADGE_LABEL[badge]}
                    tone={BADGE_TONE[badge]}
                  />
                ))}
                {isClassic ? (
                  <StatusBadge label="Whitebird Classic" tone="neutral" />
                ) : null}
              </div>

              <h1 className="font-display text-ink text-4xl tracking-tight sm:text-5xl">
                {cake.name}
              </h1>

              <p className="text-skyline max-w-xl text-base leading-relaxed sm:text-lg">
                {cake.story}
              </p>
            </header>

            <section className="space-y-3">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                Flavour profile
              </h2>
              <p className="text-ink text-base leading-relaxed sm:text-lg">
                {cake.flavourProfile}
              </p>
              <ul className="flex flex-wrap gap-2 pt-1">
                {cake.flavourNotes.map((note) => (
                  <li
                    className="border-fog text-skyline rounded-md border bg-white px-3 py-1 text-sm"
                    key={note}
                  >
                    {note}
                  </li>
                ))}
              </ul>
            </section>

            <section className="border-fog space-y-3 rounded-3xl border bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={
                    cake.availableThisMonth
                      ? "Available This Month"
                      : "Not This Month"
                  }
                  tone={cake.availableThisMonth ? "success" : "neutral"}
                />
              </div>
              <div>
                <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                  Next available collection
                </h2>
                <p className="font-display text-ink mt-2 text-2xl tracking-tight">
                  {cake.nextCollectionLabel}
                </p>
                <p className="text-skyline mt-2 text-sm leading-relaxed">
                  {cake.nextCollectionNote}
                </p>
              </div>
            </section>

            <CakeOrderPanel cake={cake} journeyActive={journeyActive} />
          </div>
        </div>
      </div>
    </main>
  );
}
