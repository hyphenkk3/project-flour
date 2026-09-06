import Link from "next/link";
import { notFound } from "next/navigation";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import {
  SPECIAL_MENU_DESCRIPTION,
  SPECIAL_MENU_HEADING,
  SPECIAL_PERIOD_CAKES_NOTE,
  catalogueMonthPickupBounds,
  clampCustomerPickupWindow,
  collectionScopedCakeHref,
  collectionScopedCheckoutHref,
  customerSpecialMenuPeriodLabel,
  monthOverlapsDateRange,
  orderCollectionHeadline,
  orderCollectionPickupCopy,
  suggestedPickupDateForCatalogueMonth,
} from "@/engines/menu/customer-browse";
import { businessYearMonth, toBusinessDateKey } from "@/lib/dates";
import { BrowseCakeCatalogue } from "@/workspaces/storefront/catalog/BrowseCakeCatalogue";
import {
  getCustomerSpecialCatalogueById,
  getOrderableMonthlyCatalogueById,
  listAvailableCakes,
  listCustomerSpecialCatalogues,
} from "@/workspaces/storefront/catalog/queries";
import { StorefrontHomeLink } from "@/workspaces/storefront/StorefrontBrand";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";

export const dynamic = "force-dynamic";

type StorefrontCollectionCakesPageProps = {
  collectionId: string;
};

function scopedCheckoutHref(
  earliest: string,
  from: string,
  to: string,
  pickupDate: string | null,
): string {
  const window = clampCustomerPickupWindow(earliest, from, to);
  if (!window) return "/order";
  return collectionScopedCheckoutHref({
    from,
    pickupDate: pickupDate && pickupDate >= window.min && pickupDate <= window.max
      ? pickupDate
      : window.min,
    to,
  });
}

export async function StorefrontCollectionCakesPage({
  collectionId,
}: StorefrontCollectionCakesPageProps) {
  const monthly = await getOrderableMonthlyCatalogueById(collectionId);
  const special = monthly
    ? null
    : await getCustomerSpecialCatalogueById(collectionId);
  if (!monthly?.month && !special) {
    notFound();
  }

  const cakes = await listAvailableCakes(monthly?.id ?? special!.id);
  const earliest = earliestPickupDateYmd();
  const todayYm =
    businessYearMonth(toBusinessDateKey()) ?? toBusinessDateKey().slice(0, 7);

  let headline: string;
  let description: string;
  let note: string | null = null;
  let checkoutHref: string;
  let collectionScope: { from: string; to: string; pickup: string | null } | null =
    null;

  if (monthly?.month) {
    const bounds = catalogueMonthPickupBounds(monthly.month);
    const suggestedPickup = suggestedPickupDateForCatalogueMonth(
      monthly.month,
      earliest,
    );
    headline = orderCollectionHeadline(monthly.month);
    description = orderCollectionPickupCopy(monthly.month, todayYm);
    checkoutHref = bounds
      ? scopedCheckoutHref(earliest, bounds.from, bounds.to, suggestedPickup)
      : suggestedPickup
        ? `/order/checkout?pickup=${suggestedPickup}`
        : "/order/checkout";
    if (bounds) {
      collectionScope = {
        from: bounds.from,
        to: bounds.to,
        pickup: suggestedPickup,
      };
    }
    const specials = await listCustomerSpecialCatalogues();
    if (
      specials.some((item) =>
        monthOverlapsDateRange(monthly.month!, item.startDate, item.endDate),
      )
    ) {
      note = SPECIAL_PERIOD_CAKES_NOTE;
    }
  } else {
    headline = SPECIAL_MENU_HEADING;
    description =
      customerSpecialMenuPeriodLabel(
        special!.startDate,
        special!.endDate,
      ) ?? SPECIAL_MENU_DESCRIPTION;
    checkoutHref = scopedCheckoutHref(
      earliest,
      special!.startDate,
      special!.endDate,
      special!.startDate,
    );
    collectionScope = {
      from: special!.startDate,
      to: special!.endDate,
      pickup: special!.startDate,
    };
  }

  const scope = collectionScope;
  const detailHrefs =
    scope == null
      ? undefined
      : Object.fromEntries(
          cakes.map((cake) => [
            cake.id,
            collectionScopedCakeHref({
              cakeId: cake.id,
              from: scope.from,
              pickupDate: scope.pickup,
              to: scope.to,
            }),
          ]),
        );

  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-5 py-4 sm:px-6 sm:py-10">
      <StorefrontHomeLink />
      <Link
        className="text-skyline hover:text-ink mt-3 inline-block text-sm font-medium sm:mt-6"
        href="/order"
      >
        ← Choose your collection
      </Link>
      <h1 className="font-display text-ink mt-3 text-3xl tracking-tight sm:mt-4 sm:text-4xl">
        {headline}
      </h1>
      <p className="text-skyline mt-2 max-w-xl text-[0.95rem] leading-relaxed sm:mt-3">
        {description}
      </p>
      {note ? (
        <p className="text-skyline mt-2 max-w-xl text-sm leading-relaxed">
          {note}
        </p>
      ) : null}

      <section aria-labelledby="collection-cakes-heading" className="mt-6 sm:mt-8">
        <h2 className="sr-only" id="collection-cakes-heading">
          Cakes in this collection
        </h2>
        <BrowseCakeCatalogue
          cakes={cakes}
          detailHrefs={detailHrefs}
          emptyMessage="No cakes are listed in this collection yet."
          pickupScope={
            scope
              ? {
                  from: scope.from,
                  to: scope.to,
                  pickup: scope.pickup,
                }
              : null
          }
        />
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-medium transition duration-200"
          href={checkoutHref}
        >
          Continue to preorder
        </Link>
        <Link
          className="text-ink hover:text-skyline inline-flex min-h-11 items-center text-sm font-medium"
          href="/browse"
        >
          Browse all published cakes
        </Link>
        <StorefrontHomeLink />
      </div>
      <PreorderInProgressBar />
    </main>
  );
}
