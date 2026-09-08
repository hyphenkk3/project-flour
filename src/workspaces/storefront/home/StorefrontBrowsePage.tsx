import Link from "next/link";
import { BrowseCakeCatalogue } from "@/workspaces/storefront/catalog/BrowseCakeCatalogue";
import { listBrowsePublishedCakes } from "@/workspaces/storefront/catalog/queries";
import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
} from "@/workspaces/storefront/StorefrontBrand";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";

export const dynamic = "force-dynamic";

export async function StorefrontBrowsePage() {
  const cakes = await listBrowsePublishedCakes();

  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-5 py-4 sm:px-6 sm:py-10">
      <StorefrontHomeLink />
      <h1 className="font-display text-ink mt-3 text-2xl tracking-tight sm:mt-8 sm:text-4xl">
        Browse Cakes
      </h1>
      <p className="text-skyline mt-1.5 max-w-xl text-sm leading-snug sm:mt-3 sm:text-[0.95rem] sm:leading-relaxed">
        <span className="sm:hidden">
          Explore cakes Whitebird has offered. Availability still depends on your
          pickup date.
        </span>
        <span className="hidden sm:inline">
          Explore the full Whitebird collection, including flavours from earlier
          menus. Availability for your order still depends on the pickup date you
          choose.
        </span>
      </p>
      <p className="mt-1.5 sm:mt-3">
        <Link
          className="text-ink hover:text-skyline text-sm font-medium transition-colors duration-200"
          href="/order"
        >
          Prefer a monthly collection or Special Menu? Choose a collection →
        </Link>
      </p>

      <section aria-labelledby="browse-cakes-heading" className="mt-8 sm:mt-8">
        <h2 className="sr-only" id="browse-cakes-heading">
          All cakes
        </h2>
        <BrowseCakeCatalogue cakes={cakes} />
      </section>

      <p className="mt-10">
        <StorefrontHomeLink />
      </p>
      <StorefrontStaffSignIn />
      <PreorderInProgressBar />
    </main>
  );
}
