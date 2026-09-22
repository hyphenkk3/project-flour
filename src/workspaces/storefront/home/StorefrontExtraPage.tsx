import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { Suspense } from "react";
import {
  FRESH_PICKS_ADD_TO_CART_CTA,
  freshPickAvailabilityDateLabel,
  freshPickCustomerStatusLabel,
} from "@/engines/extra/customer-fresh-picks";
import { toBusinessDateKey } from "@/lib/dates";
import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
} from "@/workspaces/storefront/StorefrontBrand";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  listStorefrontAvailableExtra,
  type StorefrontExtraPick,
} from "@/workspaces/storefront/extra/queries";
import { FreshPickCartShell } from "@/workspaces/storefront/extra/FreshPickCartShell";
import { FreshPickCatalogueAddCta } from "@/workspaces/storefront/extra/FreshPickCatalogueAddCta";

export const dynamic = "force-dynamic";

function FreshPicksCatalogueFallback() {
  return (
    <section aria-busy="true" className="mt-10">
      <p className="sr-only" role="status">
        Opening Fresh Picks
      </p>
      <div className="border-fog space-y-4 border-t pt-6">
        <div className="bg-fog aspect-[4/3] rounded-[10px] md:h-[12rem] md:aspect-auto" />
        <div aria-hidden className="bg-fog h-6 w-48 rounded-sm" />
        <div aria-hidden className="bg-fog h-4 w-32 rounded-sm" />
      </div>
    </section>
  );
}

export function StorefrontExtraPage() {
  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <StorefrontHomeLink />
        <h1 className="font-display text-ink mt-8 text-3xl tracking-tight sm:text-4xl">
          Fresh Picks
        </h1>
        <p className="text-skyline mt-3 max-w-xl text-[0.95rem] leading-relaxed">
          Extra cakes available today or tomorrow.
          Limited quantities, available for pickup, dine-in, or delivery
          during the stated window.
        </p>

        <Suspense fallback={<FreshPicksCatalogueFallback />}>
          <FreshPicksCatalogue />
        </Suspense>

        <p className="mt-10">
          <StorefrontHomeLink />
        </p>
        <StorefrontStaffSignIn />
      </div>
      <FreshPickCartShell />
    </main>
  );
}

async function FreshPicksCatalogue() {
  const picks = await listStorefrontAvailableExtra();
  const todayYmd = toBusinessDateKey();

  if (picks.length === 0) {
    return (
      <section className="border-fog mt-10 border-t pt-8">
        <h2 className="text-ink text-lg font-medium tracking-tight">
          No Fresh Picks right now
        </h2>
        <p className="text-skyline mt-2 text-sm leading-relaxed">
          Check back later — Bakery may add cakes for today or tomorrow.
        </p>
      </section>
    );
  }

  return (
    <ul className="mt-10 space-y-4">
      {picks.map((pick) => (
        <li key={pick.id}>
          <FreshPickCatalogueRow pick={pick} todayYmd={todayYmd} />
        </li>
      ))}
    </ul>
  );
}

function FreshPickCatalogueRow({
  pick,
  todayYmd,
}: {
  pick: StorefrontExtraPick;
  todayYmd: string;
}) {
  const held = pick.walkInHeld;
  const dateLabel = held
    ? null
    : freshPickAvailabilityDateLabel(pick.days, todayYmd);
  return (
    <article className="border-fog grid gap-5 border-t pt-6 md:grid-cols-[minmax(0,1fr)_13rem] md:items-start md:gap-8">
      <div className="order-2 flex flex-col justify-center md:order-1">
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
          {freshPickCustomerStatusLabel({
            walkInHeld: held,
            days: pick.days,
          })}
        </p>
        {dateLabel ? (
          <p className="text-skyline mt-1 text-[11px] font-medium tracking-[0.14em] uppercase">
            {dateLabel}
          </p>
        ) : null}
        <h2 className="font-display text-ink mt-3 text-2xl tracking-tight">
          {pick.cakeName}
        </h2>
        <p className="text-skyline mt-1 text-sm">{pick.sizeLabel}</p>
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
        {held ? null : (
          <FreshPickCatalogueAddCta
            extraStockIds={pick.extraStockIds}
            href={`/extra/${pick.id}`}
          >
            {FRESH_PICKS_ADD_TO_CART_CTA}
          </FreshPickCatalogueAddCta>
        )}
      </div>
      <div className="bg-fog relative order-1 aspect-[4/3] overflow-hidden rounded-[10px] md:order-2 md:aspect-auto md:h-[12rem]">
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
  );
}
