import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import {
  FRESH_PICKS_ORDER_CTA,
  freshPickAvailabilityLabel,
} from "@/engines/extra/customer-fresh-picks";
import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
} from "@/workspaces/storefront/StorefrontBrand";
import { listStorefrontAvailableExtra } from "@/workspaces/storefront/extra/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function StorefrontExtraPage() {
  const picks = await listStorefrontAvailableExtra();

  return (
    <main className="bg-mist min-h-screen">
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
          <section className="border-fog mt-10 rounded-3xl border bg-white px-6 py-10">
            <h2 className="text-ink text-lg font-medium tracking-tight">
              No Fresh Picks right now
            </h2>
            <p className="text-skyline mt-2 text-sm leading-relaxed">
              Check back later — Bakery may add cakes for today or tomorrow.
            </p>
          </section>
        ) : (
          <ul className="mt-10 space-y-4">
            {picks.map((pick) => (
              <li key={pick.id}>
                <article className="border-fog grid overflow-hidden rounded-3xl border bg-white md:grid-cols-[minmax(0,1fr)_13rem]">
                  <div className="order-2 flex flex-col justify-center px-6 py-6 md:order-1 sm:px-7">
                    <p className="text-signal text-[11px] font-semibold tracking-[0.14em] uppercase">
                      {freshPickAvailabilityLabel(pick.day)}
                    </p>
                    <h2 className="font-display text-ink mt-2 text-2xl tracking-tight">
                      {pick.cakeName}
                    </h2>
                    <p className="text-skyline mt-1 text-sm">{pick.sizeLabel}</p>
                    <Link
                      className="bg-ink text-mist hover:bg-skyline mt-6 inline-flex min-h-11 w-fit items-center justify-center rounded-full px-5 text-sm font-medium"
                      href={`/extra/${pick.id}`}
                    >
                      {FRESH_PICKS_ORDER_CTA}
                    </Link>
                  </div>
                  <div className="bg-fog order-1 aspect-[4/3] md:order-2 md:aspect-auto md:min-h-[12rem]">
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
            ))}
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
