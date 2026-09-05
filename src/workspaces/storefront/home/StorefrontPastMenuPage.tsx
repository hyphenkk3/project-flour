import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  PAST_MENU_LABEL,
  SPECIAL_MENU_HEADING,
  catalogueHistoryPeriodLabel,
  orderCollectionHeadline,
} from "@/engines/menu/customer-browse";
import { toBusinessDateKey } from "@/lib/dates";
import { StorefrontCakeCard } from "@/workspaces/storefront/catalog/StorefrontCakeCard";
import {
  getCustomerSpecialCatalogueById,
  getHistoricalCatalogueById,
  getOrderableMonthlyCatalogueById,
  listAvailableCakes,
} from "@/workspaces/storefront/catalog/queries";
import { StorefrontHomeLink } from "@/workspaces/storefront/StorefrontBrand";

export const dynamic = "force-dynamic";

type StorefrontPastMenuPageProps = {
  collectionId: string;
};

export async function StorefrontPastMenuPage({
  collectionId,
}: StorefrontPastMenuPageProps) {
  const todayYmd = toBusinessDateKey();
  const historical = await getHistoricalCatalogueById(collectionId, todayYmd);
  if (!historical) {
    const monthly = await getOrderableMonthlyCatalogueById(collectionId);
    const special = monthly
      ? null
      : await getCustomerSpecialCatalogueById(collectionId);
    if (monthly || special) {
      redirect(`/order/collection/${collectionId}`);
    }
    notFound();
  }

  const cakes = await listAvailableCakes(historical.id);
  const headline =
    historical.purpose === "monthly" && historical.month
      ? orderCollectionHeadline(historical.month)
      : historical.purpose === "special"
        ? historical.name || SPECIAL_MENU_HEADING
        : historical.name;
  const period = catalogueHistoryPeriodLabel(historical);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 sm:px-6">
      <StorefrontHomeLink />
      <Link
        className="text-skyline hover:text-ink mt-6 inline-block text-sm font-medium"
        href="/browse"
      >
        ← Browse cakes
      </Link>
      <p className="text-signal mt-6 text-[11px] font-semibold tracking-[0.14em] uppercase">
        {PAST_MENU_LABEL}
      </p>
      <h1 className="font-display text-ink mt-2 text-4xl tracking-tight">
        {headline}
      </h1>
      {period ? (
        <p className="text-skyline mt-3 max-w-xl text-[0.95rem] leading-relaxed">
          {period}
        </p>
      ) : null}
      <p className="text-skyline mt-2 max-w-xl text-sm leading-relaxed">
        This is a past menu. You can browse the cakes for reference. New orders
        cannot be placed from this menu.
      </p>

      <section aria-labelledby="past-menu-cakes-heading" className="mt-8">
        <h2 className="sr-only" id="past-menu-cakes-heading">
          Cakes in this past menu
        </h2>
        {cakes.length === 0 ? (
          <p className="text-skyline text-sm">
            No cakes are listed in this menu.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-5 lg:grid-cols-3">
            {cakes.map((cake) => (
              <li className="h-full" key={cake.id}>
                <StorefrontCakeCard cake={cake} hideOrderCta />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10">
        <StorefrontHomeLink />
      </p>
    </main>
  );
}
