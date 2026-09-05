import Link from "next/link";
import {
  PAST_MENU_LABEL,
  SPECIAL_MENU_HEADING,
  catalogueHistoryPeriodLabel,
  orderCollectionHeadline,
} from "@/engines/menu/customer-browse";
import { BrowseCakeCatalogue } from "@/workspaces/storefront/catalog/BrowseCakeCatalogue";
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
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-5 sm:px-6 sm:py-10">
      <StorefrontHomeLink />
      <h1 className="font-display text-ink mt-4 text-2xl tracking-tight sm:mt-8 sm:text-3xl">
        Browse Cakes
      </h1>
      <p className="text-skyline mt-1.5 max-w-xl text-sm leading-snug sm:mt-3 sm:text-[0.95rem] sm:leading-relaxed">
        <span className="sm:hidden">
          Currently published cakes for Whitebird.
        </span>
        <span className="hidden sm:inline">
          Discover cakes currently published for Whitebird. Availability for your
          order still depends on the pickup date you choose. Past menus can be
          browsed below, but cannot be ordered.
        </span>
      </p>
      <p className="mt-2 sm:mt-3">
        <Link
          className="text-ink hover:text-skyline text-sm font-medium"
          href="/order"
        >
          Prefer a monthly collection or Special Menu? Choose a collection →
        </Link>
      </p>

      <PreorderInProgressBar />

      <section aria-labelledby="browse-cakes-heading" className="mt-4 sm:mt-8">
        <h2 className="sr-only" id="browse-cakes-heading">
          Published cakes
        </h2>
        <BrowseCakeCatalogue cakes={cakes} />
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
