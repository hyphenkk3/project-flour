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
      <div>
        <h2 className="font-display text-ink text-xl tracking-tight sm:text-2xl">
          Today&apos;s Fresh Pick
        </h2>
        <p className="text-skyline mt-1.5 text-sm leading-relaxed">
          Fresh Picks are currently unavailable. Check back later.
        </p>
      </div>
    );
  }

  const isToday = pick.day === "today";

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-ink text-xl tracking-tight sm:text-2xl">
          Today&apos;s Fresh Pick
        </h2>
        {isToday ? (
          <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
            New
          </p>
        ) : (
          <p className="text-skyline text-[11px] font-medium tracking-[0.14em] uppercase">
            {pick.availabilityLabel}
          </p>
        )}
      </div>
      <article>
        <div className="relative aspect-[4/3] overflow-hidden">
          {pick.imageUrl ? (
            <CakePhotoImage
              alt={pick.imageAlt || pick.cakeName}
              sizes="(min-width: 768px) 28vw, 100vw"
              src={pick.imageUrl}
            />
          ) : (
            <div className="text-skyline flex h-full min-h-[9rem] items-center justify-center px-4 text-center text-sm">
              Photo coming soon
            </div>
          )}
        </div>
        <h3 className="font-display text-ink mt-3 text-xl leading-tight tracking-tight">
          {pick.cakeName}
        </h3>
        <p className="text-skyline mt-0.5 text-sm">{pick.sizeLabel}</p>
        <p className="text-skyline mt-2 line-clamp-2 text-sm leading-relaxed">
          {pick.availabilityLabel}. Limited quantity, available for pickup
          during the stated window.
        </p>
        {pick.unitPrice != null ? (
          <p className="text-ink mt-2 tabular-nums">{formatRm(pick.unitPrice)}</p>
        ) : null}
        <Link
          className="text-ink hover:text-skyline mt-3 inline-flex min-h-11 items-center text-sm font-medium"
          href={`/extra/${pick.id}`}
        >
          View Details →
        </Link>
      </article>
    </div>
  );
}
