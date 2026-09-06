import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontExtraPick } from "@/workspaces/storefront/extra/queries";

type HomeFeaturedFreshPickProps = {
  pick: StorefrontExtraPick | null;
};

export function HomeFeaturedFreshPick({ pick }: HomeFeaturedFreshPickProps) {
  if (!pick) {
    return (
      <section className="px-6 pb-8 sm:px-10 sm:pb-10">
        <div className="border-fog/80 mx-auto w-full max-w-6xl border-t pt-5">
          <h2 className="font-display text-ink text-xl tracking-tight sm:text-2xl">
            Today&apos;s Fresh Pick
          </h2>
          <p className="text-skyline mt-1.5 max-w-lg text-sm leading-relaxed">
            Fresh Picks are currently unavailable. Check back later.
          </p>
        </div>
      </section>
    );
  }

  const isToday = pick.day === "today";

  return (
    <section className="px-6 pb-8 sm:px-10 sm:pb-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-3 flex items-baseline justify-between gap-3 sm:mb-4">
          <h2 className="font-display text-ink text-xl tracking-tight sm:text-2xl">
            {isToday ? "Today's Fresh Pick" : "Fresh Pick"}
          </h2>
          <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
            {isToday ? "New" : pick.availabilityLabel}
          </p>
        </div>
        <article className="grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] md:items-center md:gap-8 lg:gap-12">
          <div className="relative aspect-[5/4] overflow-hidden md:aspect-auto md:min-h-[15.5rem] lg:min-h-[17.5rem]">
            {pick.imageUrl ? (
              <>
                <CakePhotoImage
                  alt={pick.imageAlt || pick.cakeName}
                  sizes="(min-width: 768px) 50vw, 100vw"
                  src={pick.imageUrl}
                />
                <div className="from-paper absolute inset-y-0 right-0 hidden w-1/4 bg-gradient-to-l to-transparent md:block" />
              </>
            ) : (
              <div className="text-skyline flex h-full min-h-[11rem] items-center justify-center px-4 text-center text-sm">
                Photo coming soon
              </div>
            )}
          </div>
          <div className="pt-3 md:pt-0">
            <h3 className="font-display text-ink text-[1.65rem] leading-tight tracking-tight sm:text-3xl">
              {pick.cakeName}
            </h3>
            <p className="text-skyline mt-1 text-sm">{pick.sizeLabel}</p>
            <p className="text-skyline mt-3 max-w-sm text-sm leading-relaxed">
              {pick.availabilityLabel}. Limited quantity, available for pickup
              during the stated window.
            </p>
            {pick.unitPrice != null ? (
              <p className="text-ink mt-3 tabular-nums">
                {formatRm(pick.unitPrice)}
              </p>
            ) : null}
            <Link
              className="text-ink hover:text-skyline mt-4 inline-flex min-h-11 items-center text-sm font-medium"
              href={`/extra/${pick.id}`}
            >
              View Details →
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
