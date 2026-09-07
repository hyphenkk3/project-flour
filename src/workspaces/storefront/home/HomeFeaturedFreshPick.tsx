import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { homepageFeaturedFreshPickDateYmd } from "@/engines/extra/customer-fresh-picks";
import {
  formatShortBusinessDate,
  toBusinessDateKey,
} from "@/lib/dates";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontExtraPick } from "@/workspaces/storefront/extra/queries";

type HomeFeaturedFreshPickProps = {
  pick: StorefrontExtraPick | null;
};

const headingClass =
  "font-display text-ink text-xl tracking-tight sm:text-2xl";

export function HomeFeaturedFreshPick({ pick }: HomeFeaturedFreshPickProps) {
  if (!pick) {
    return (
      <div>
        <h2 className={headingClass}>Fresh Pick</h2>
        <p className="text-skyline mt-1.5 max-w-sm text-sm leading-relaxed">
          Fresh Picks are currently unavailable. Check back later.
        </p>
      </div>
    );
  }

  const dateYmd = homepageFeaturedFreshPickDateYmd(
    pick.day,
    toBusinessDateKey(),
  );
  const dateLabel = dateYmd ? formatShortBusinessDate(dateYmd) : null;

  return (
    <div>
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <h2 className={headingClass}>Fresh Pick</h2>
        <div className="text-skyline shrink-0 text-right text-[11px] font-medium tracking-[0.14em] uppercase">
          <p>{pick.availabilityLabel}</p>
          {dateLabel ? <p>{dateLabel}</p> : null}
        </div>
      </div>
      <article className="flex gap-3.5">
        <div className="relative h-[6.75rem] w-[6.75rem] shrink-0 overflow-hidden rounded-[10px] sm:h-[7.5rem] sm:w-[7.5rem]">
          {pick.imageUrl ? (
            <CakePhotoImage
              alt={pick.imageAlt || pick.cakeName}
              sizes="120px"
              src={pick.imageUrl}
            />
          ) : (
            <div className="text-skyline flex h-full items-center justify-center px-2 text-center text-[11px]">
              Photo coming soon
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-ink text-[1.15rem] leading-tight tracking-tight sm:text-xl">
            {pick.cakeName}
          </h3>
          <p className="text-skyline mt-0.5 text-sm">{pick.sizeLabel}</p>
          <p className="text-skyline mt-1.5 line-clamp-2 text-[13px] leading-relaxed">
            Limited quantity, available for pickup during the stated window.
          </p>
          {pick.unitPrice != null ? (
            <p className="text-ink mt-1.5 text-sm tabular-nums">
              {formatRm(pick.unitPrice)}
            </p>
          ) : null}
          <Link
            className="text-ink hover:text-skyline mt-2 inline-flex items-center text-sm font-medium"
            href={`/extra/${pick.id}`}
          >
            View Details →
          </Link>
        </div>
      </article>
    </div>
  );
}
