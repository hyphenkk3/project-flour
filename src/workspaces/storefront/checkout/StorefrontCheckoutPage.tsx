import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import {
  CUSTOMER_PICKUP_DATE_CAKE_NOTICE,
  enumerateYmdInclusive,
  isFullMonthPickupScope,
  latestOrderableCataloguePickupEnd,
  monthOverlapsDateRange,
  resolveCheckoutPickupScope,
} from "@/engines/menu/customer-browse";
import {
  listCustomerSpecialCatalogues,
  listOrderableMonthlyCatalogues,
} from "@/workspaces/storefront/catalog/queries";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import { GuestCheckoutForm } from "@/workspaces/storefront/checkout/GuestCheckoutForm";
import { listClosedPickupOrderDates } from "@/workspaces/storefront/checkout/order-availability";
import { StorefrontHomeLink } from "@/workspaces/storefront/StorefrontBrand";

export const dynamic = "force-dynamic";

function ymdQuery(value: string | null | undefined): string | null {
  const key = value?.trim().slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

type StorefrontCheckoutPageProps = {
  pickupQuery?: string | null;
  fromQuery?: string | null;
  toQuery?: string | null;
};

export async function StorefrontCheckoutPage({
  pickupQuery = null,
  fromQuery = null,
  toQuery = null,
}: StorefrontCheckoutPageProps) {
  const fromDate = earliestPickupDateYmd();
  const [catalogues, specials] = await Promise.all([
    listOrderableMonthlyCatalogues(),
    listCustomerSpecialCatalogues(),
  ]);
  const catalogueMaxPickup = latestOrderableCataloguePickupEnd(
    catalogues.map((catalogue) => catalogue.month ?? ""),
  );
  const scopeFrom = ymdQuery(fromQuery);
  const scopeTo = ymdQuery(toQuery);
  const scope = resolveCheckoutPickupScope({
    earliest: fromDate,
    scopeFrom,
    scopeTo,
    globalMax: catalogueMaxPickup,
  });
  const pickupFromQuery = ymdQuery(pickupQuery);
  const suggestedPickupDate =
    pickupFromQuery &&
    pickupFromQuery >= scope.minPickupDate &&
    (!scope.maxPickupDate || pickupFromQuery <= scope.maxPickupDate)
      ? pickupFromQuery
      : scope.suggestedPickupDate;
  const toDate = scope.maxPickupDate ?? scope.minPickupDate;
  const closedDates = await listClosedPickupOrderDates(
    scope.minPickupDate,
    toDate,
  );
  const hoursSnapshot = await loadOperatingHoursSnapshot();

  /** Special-menu dates blocked for monthly-collection entry (empty cart). */
  const entrySpecialUnavailableDates =
    scopeFrom &&
    scopeTo &&
    isFullMonthPickupScope(scopeFrom, scopeTo)
      ? [
          ...new Set(
            specials
              .filter((special) =>
                monthOverlapsDateRange(
                  scopeFrom,
                  special.startDate,
                  special.endDate,
                ),
              )
              .flatMap((special) =>
                enumerateYmdInclusive(special.startDate, special.endDate),
              ),
          ),
        ].sort()
      : [];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 sm:px-6">
      <StorefrontHomeLink />
      <h1 className="sr-only">Your Order</h1>
      <p className="text-skyline mt-8 max-w-xl text-[0.95rem] leading-relaxed">
        No payment is required yet. We&apos;ll confirm your preorder details
        with you after submission. {CUSTOMER_PICKUP_DATE_CAKE_NOTICE}
      </p>
      <div className="mt-10">
        <GuestCheckoutForm
          closedDates={closedDates}
          entrySpecialUnavailableDates={entrySpecialUnavailableDates}
          hoursSnapshot={hoursSnapshot}
          maxPickupDate={scope.maxPickupDate}
          minPickupDate={scope.minPickupDate}
          pickupScopeConstrainsBounds={scope.scopeConstrainsBounds}
          pickupScopeFrom={scopeFrom}
          pickupScopeTo={scopeTo}
          suggestedPickupDate={suggestedPickupDate}
        />
      </div>
    </main>
  );
}
