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
import { StorefrontCakeCard } from "@/workspaces/storefront/catalog/StorefrontCakeCard";
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

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 sm:px-6">
      <StorefrontHomeLink />
      <Link
        className="text-skyline hover:text-ink mt-6 inline-block text-sm font-medium"
        href="/order"
      >
        ← Choose your collection
      </Link>
      <h1 className="font-display text-ink mt-4 text-4xl tracking-tight">
        {headline}
      </h1>
      <p className="text-skyline mt-3 max-w-xl text-[0.95rem] leading-relaxed">
        {description}
      </p>
      {note ? (
        <p className="text-skyline mt-2 max-w-xl text-sm leading-relaxed">
          {note}
        </p>
      ) : null}

      <PreorderInProgressBar />

      <section aria-labelledby="collection-cakes-heading" className="mt-8">
        <h2 className="sr-only" id="collection-cakes-heading">
          Cakes in this collection
        </h2>
        {cakes.length === 0 ? (
          <p className="text-skyline text-sm">
            No cakes are listed in this collection yet.
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cakes.map((cake) => (
              <li className="h-full" key={cake.id}>
                <StorefrontCakeCard
                  cake={cake}
                  detailHref={
                    collectionScope
                      ? collectionScopedCakeHref({
                          cakeId: cake.id,
                          from: collectionScope.from,
                          pickupDate: collectionScope.pickup,
                          to: collectionScope.to,
                        })
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium"
          href={checkoutHref}
        >
          Continue to preorder
        </Link>
        <StorefrontHomeLink />
      </div>
    </main>
  );
}
