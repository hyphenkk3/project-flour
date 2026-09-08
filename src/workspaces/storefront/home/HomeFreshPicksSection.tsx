import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import {
  freshPickAvailabilityDateLabel,
  freshPickAvailabilityLabel,
} from "@/engines/extra/customer-fresh-picks";
import { toBusinessDateKey } from "@/lib/dates";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontExtraPick } from "@/workspaces/storefront/extra/queries";

const FRESH_PICKS_DESCRIPTION =
  "Extra cakes available for selected dates. For last-minute orders, subject to availability.";

type HomeFreshPicksSectionProps = {
  picks: readonly StorefrontExtraPick[];
};

export function HomeFreshPicksSection({ picks }: HomeFreshPicksSectionProps) {
  const todayYmd = toBusinessDateKey();
  const empty = picks.length <= 0;

  return (
    <section className="px-6 pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-ink text-[1.45rem] tracking-tight">
          Fresh Picks
        </h2>
        <Link
          className="text-skyline hover:text-ink shrink-0 text-[13px] font-medium"
          href="/extra"
        >
          See all →
        </Link>
      </div>
      <p className="text-skyline mt-1.5 max-w-[22rem] text-[13px] leading-relaxed">
        {FRESH_PICKS_DESCRIPTION}
      </p>
      {empty ? (
        <div className="mt-4 max-w-[22rem]">
          <p className="text-skyline text-[13px] leading-relaxed">
            Nothing extra is available right now.
          </p>
          <p className="text-skyline mt-1 text-[13px] leading-relaxed">
            Check back here for last-minute cake availability.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {picks.map((pick) => {
            const dateLabel = freshPickAvailabilityDateLabel(
              pick.days,
              todayYmd,
            );
            return (
              <li key={pick.id}>
                <article className="flex gap-3.5">
                  <Link
                    aria-label={pick.cakeName}
                    className="bg-fog relative aspect-square h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-[10px]"
                    href={`/extra/${pick.id}`}
                  >
                    {pick.imageUrl ? (
                      <CakePhotoImage
                        alt={pick.imageAlt || pick.cakeName}
                        sizes="88px"
                        src={pick.imageUrl}
                      />
                    ) : (
                      <span className="text-skyline flex h-full items-center justify-center px-1.5 text-center text-[10px]">
                        Photo coming soon
                      </span>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="text-skyline text-[11px] leading-tight">
                      {freshPickAvailabilityLabel(pick.days)}
                      {dateLabel ? ` · ${dateLabel}` : ""}
                    </p>
                    <h3 className="font-display text-ink mt-1 line-clamp-2 text-[1.02rem] leading-snug tracking-tight">
                      {pick.cakeName}
                    </h3>
                    {pick.unitPrice != null ? (
                      <p className="text-ink mt-0.5 text-xs tabular-nums">
                        {formatRm(pick.unitPrice)}
                      </p>
                    ) : null}
                    <Link
                      className="text-ink mt-2 inline-flex items-center text-[13px] font-medium"
                      href={`/extra/${pick.id}`}
                    >
                      Order →
                    </Link>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
