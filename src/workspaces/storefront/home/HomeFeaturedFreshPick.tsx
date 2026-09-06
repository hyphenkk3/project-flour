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
      <section className="px-6 pb-10 sm:px-10 sm:pb-12">
        <div className="border-fog mx-auto w-full max-w-6xl border-t pt-6">
          <h2 className="font-display text-ink text-2xl tracking-tight">
            Today&apos;s Fresh Pick
          </h2>
          <p className="text-skyline mt-2 max-w-lg text-sm leading-relaxed">
            Fresh Picks are currently unavailable. Check back later.
          </p>
        </div>
      </section>
    );
  }

  const isToday = pick.day === "today";

  return (
    <section className="px-6 pb-10 sm:px-10 sm:pb-14">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex items-baseline justify-between gap-3 sm:mb-6">
          <h2 className="font-display text-ink text-2xl tracking-tight sm:text-3xl">
            {isToday ? "Today's Fresh Pick" : "Fresh Pick"}
          </h2>
          {isToday ? (
            <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
              New
            </p>
          ) : (
            <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
              {pick.availabilityLabel}
            </p>
          )}
        </div>
        <article className="grid overflow-hidden md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:items-center md:gap-10">
          <div className="bg-fog relative aspect-[5/4] md:aspect-auto md:min-h-[18rem] lg:min-h-[22rem]">
            {pick.imageUrl ? (
              <CakePhotoImage
                alt={pick.imageAlt || pick.cakeName}
                sizes="(min-width: 768px) 50vw, 100vw"
                src={pick.imageUrl}
              />
            ) : (
              <div className="text-skyline flex h-full min-h-[12rem] items-center justify-center px-4 text-center text-sm">
                Photo coming soon
              </div>
            )}
          </div>
          <div className="pt-4 md:pt-0">
            <h3 className="font-display text-ink text-2xl leading-tight tracking-tight sm:text-3xl">
              {pick.cakeName}
            </h3>
            <p className="text-skyline mt-1 text-sm">{pick.sizeLabel}</p>
            <p className="text-skyline mt-3 max-w-sm text-sm leading-relaxed">
              {pick.availabilityLabel}. Limited quantity, available for pickup
              during the stated window.
            </p>
            {pick.unitPrice != null ? (
              <p className="text-ink mt-4 font-medium tabular-nums">
                {formatRm(pick.unitPrice)}
              </p>
            ) : null}
            <Link
              className="text-ink hover:text-skyline mt-5 inline-flex min-h-11 items-center text-sm font-medium"
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
