import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import {
  FRESH_PICKS_ORDER_CTA,
  freshPickAvailabilityLabel,
  homepageFeaturedFreshPickDateYmd,
} from "@/engines/extra/customer-fresh-picks";
import { formatShortBusinessDate, toBusinessDateKey } from "@/lib/dates";
import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
} from "@/workspaces/storefront/StorefrontBrand";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import { listStorefrontAvailableExtra } from "@/workspaces/storefront/extra/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function StorefrontExtraPage() {
  const picks = await listStorefrontAvailableExtra();
  const todayYmd = toBusinessDateKey();

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <StorefrontHomeLink />
        <h1 className="font-display text-ink mt-8 text-3xl tracking-tight sm:text-4xl">
          Fresh Picks
        </h1>
        <p className="text-skyline mt-3 max-w-xl text-[0.95rem] leading-relaxed">
          Extra cakes available today or tomorrow.
          Limited quantities, available for pickup during the stated window.
        </p>

        {picks.length === 0 ? (
          <section className="border-fog mt-10 border-t pt-8">
            <h2 className="text-ink text-lg font-medium tracking-tight">
              No Fresh Picks right now
            </h2>
            <p className="text-skyline mt-2 text-sm leading-relaxed">
              Check back later — Bakery may add cakes for today or tomorrow.
            </p>
          </section>
        ) : (
          <ul className="mt-10 space-y-4">
            {picks.map((pick) => {
              const dateYmd = homepageFeaturedFreshPickDateYmd(
                pick.day,
                todayYmd,
              );
              const dateLabel = dateYmd
                ? formatShortBusinessDate(dateYmd)
                : null;
              return (
                <li key={pick.id}>
                  <article className="border-fog grid gap-5 border-t pt-6 md:grid-cols-[minmax(0,1fr)_13rem] md:items-start md:gap-8">
                    <div className="order-2 flex flex-col justify-center md:order-1">
                      <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
                        {freshPickAvailabilityLabel(pick.day)}
                      </p>
                      {dateLabel ? (
                        <p className="text-skyline mt-1 text-[11px] font-medium tracking-[0.14em] uppercase">
                          {dateLabel}
                        </p>
                      ) : null}
                      <h2 className="font-display text-ink mt-3 text-2xl tracking-tight">
                        {pick.cakeName}
                      </h2>
                      <p className="text-skyline mt-1 text-sm">
                        {pick.sizeLabel}
                      </p>
                      {pick.description ? (
                        <p className="text-skyline mt-3 text-sm leading-relaxed">
                          {pick.description}
                        </p>
                      ) : null}
                      {pick.unitPrice != null ? (
                        <p className="text-ink mt-3 text-sm tabular-nums">
                          {formatRm(pick.unitPrice)}
                        </p>
                      ) : null}
                      <Link
                        className="bg-ink text-mist hover:bg-skyline mt-6 inline-flex min-h-11 w-fit items-center justify-center rounded-md px-5 text-sm font-medium transition duration-200"
                        href={`/extra/${pick.id}`}
                      >
                        {FRESH_PICKS_ORDER_CTA}
                      </Link>
                    </div>
                    <div className="bg-fog order-1 aspect-[4/3] overflow-hidden rounded-[10px] md:order-2 md:aspect-auto md:min-h-[12rem]">
                      {pick.imageUrl ? (
                        <CakePhotoImage
                          alt={pick.imageAlt || pick.cakeName}
                          sizes="(min-width: 768px) 13rem, 100vw"
                          src={pick.imageUrl}
                        />
                      ) : (
                        <div className="text-skyline flex h-full min-h-[10rem] items-center justify-center px-4 text-center text-sm">
                          Photo coming soon
                        </div>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-10">
          <StorefrontHomeLink />
        </p>
        <StorefrontStaffSignIn />
      </div>
    </main>
  );
}
