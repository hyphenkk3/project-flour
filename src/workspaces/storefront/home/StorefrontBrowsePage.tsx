import Link from "next/link";
import {
  PAST_MENU_LABEL,
  SPECIAL_MENU_HEADING,
  catalogueHistoryPeriodLabel,
  orderCollectionHeadline,
} from "@/engines/menu/customer-browse";
import { StorefrontCakeCard } from "@/workspaces/storefront/catalog/StorefrontCakeCard";
import {
  listBrowsePublishedCakes,
  listHistoricalCatalogues,
} from "@/workspaces/storefront/catalog/queries";
import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
} from "@/workspaces/storefront/StorefrontBrand";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";

export const dynamic = "force-dynamic";

export async function StorefrontBrowsePage() {
  const [cakes, pastMenus] = await Promise.all([
    listBrowsePublishedCakes(),
    listHistoricalCatalogues(),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 sm:px-6">
      <StorefrontHomeLink />
      <h1 className="font-display text-ink mt-8 text-3xl tracking-tight">
        Browse Cakes
      </h1>
      <p className="text-skyline mt-3 max-w-xl text-[0.95rem] leading-relaxed">
        Discover cakes currently published for Whitebird. Availability for your
        order still depends on the pickup date you choose. Past menus can be
        browsed below, but cannot be ordered.
      </p>

      <PreorderInProgressBar />

      <section aria-labelledby="browse-cakes-heading" className="mt-8">
        <h2 className="sr-only" id="browse-cakes-heading">
          Published cakes
        </h2>
        {cakes.length === 0 ? (
          <p className="text-skyline text-sm">
            No cakes are published to browse right now. Please check back soon.
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cakes.map((cake) => (
              <li className="h-full" key={cake.id}>
                <StorefrontCakeCard
                  availabilityNote={cake.availabilityNote}
                  cake={cake}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {pastMenus.length > 0 ? (
        <section aria-labelledby="past-menus-heading" className="mt-12">
          <h2
            className="font-display text-ink text-2xl tracking-tight"
            id="past-menus-heading"
          >
            Past menus
          </h2>
          <p className="text-skyline mt-2 max-w-xl text-sm leading-relaxed">
            Browse earlier catalogues for reference. These menus are no longer
            available to order.
          </p>
          <ul className="mt-5 space-y-3">
            {pastMenus.map((menu) => {
              const title =
                menu.purpose === "monthly" && menu.month
                  ? orderCollectionHeadline(menu.month)
                  : menu.purpose === "special"
                    ? menu.name || SPECIAL_MENU_HEADING
                    : menu.name;
              const period = catalogueHistoryPeriodLabel(menu);
              return (
                <li
                  className="border-fog rounded-3xl border bg-white px-6 py-6"
                  key={menu.id}
                >
                  <p className="text-signal text-[11px] font-semibold tracking-[0.14em] uppercase">
                    {PAST_MENU_LABEL}
                  </p>
                  <h3 className="font-display text-ink mt-2 text-xl tracking-tight">
                    {title}
                  </h3>
                  {period ? (
                    <p className="text-skyline mt-1.5 text-sm">{period}</p>
                  ) : null}
                  <Link
                    className="text-ink mt-5 inline-flex min-h-10 items-center text-sm font-medium"
                    href={`/browse/menu/${menu.id}`}
                  >
                    View past menu →
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="mt-10">
        <StorefrontHomeLink />
      </p>
      <StorefrontStaffSignIn />
    </main>
  );
}
