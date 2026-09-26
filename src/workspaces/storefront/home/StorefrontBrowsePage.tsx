import { Suspense } from "react";
import Link from "next/link";
import { BrowseCakeCatalogue } from "@/workspaces/storefront/catalog/BrowseCakeCatalogue";
import { StorefrontBrowsePerfProbe } from "@/workspaces/storefront/catalog/StorefrontBrowsePerfProbe";
import { CakePhotoDisclaimer } from "@/workspaces/storefront/catalog/CakePhotoDisclaimer";
import {
  CakeEntryScopeCapture,
  CakeEntryScopeClearOnUnscopedCakeClick,
} from "@/workspaces/storefront/catalog/CakeEntryScopeCapture";
import { StorefrontListingRestore } from "@/workspaces/storefront/catalog/StorefrontListingRestore";
import { listBrowsePublishedCakes } from "@/workspaces/storefront/catalog/queries";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import { buildTargetedPromotionBadgeByCakeId } from "@/engines/vouchers/catalogue-promotion-presentation";
import { listPublicCatalogueVouchers } from "@/workspaces/vouchers/catalogue-queries";
import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
} from "@/workspaces/storefront/StorefrontBrand";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";

function BrowseCatalogueFallback() {
  return (
    <section aria-busy="true" className="mt-8">
      <p className="sr-only" role="status">
        Loading cakes
      </p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-fog aspect-[4/3] rounded-[10px]" />
        <div className="bg-fog aspect-[4/3] rounded-[10px]" />
        <div className="bg-fog aspect-[4/3] rounded-[10px]" />
      </div>
    </section>
  );
}

async function BrowseCatalogueIsland() {
  const [cakes, vouchers] = await Promise.all([
    listBrowsePublishedCakes(),
    listPublicCatalogueVouchers(),
  ]);
  const today = singaporeDateFromIso(new Date().toISOString());
  const promotions = Object.fromEntries(
    buildTargetedPromotionBadgeByCakeId(vouchers, today, "preorder"),
  );
  const cakeScopes = Object.fromEntries(
    cakes.map((cake) => [cake.id, { origin: "browse" as const }]),
  );
  return (
    <section aria-labelledby="browse-cakes-heading" className="mt-8 sm:mt-8">
      <h2 className="sr-only" id="browse-cakes-heading">
        All cakes
      </h2>
      <CakeEntryScopeCapture scopes={cakeScopes}>
        <StorefrontBrowsePerfProbe cakeCount={cakes.length} />
        <BrowseCakeCatalogue cakes={cakes} promotions={promotions} />
        <StorefrontListingRestore origin="browse" />
      </CakeEntryScopeCapture>
    </section>
  );
}

export function StorefrontBrowsePage() {
  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-5 py-4 sm:px-6 sm:py-10">
      <CakeEntryScopeClearOnUnscopedCakeClick />
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
      <CakePhotoDisclaimer className="mt-3 max-w-xl sm:mt-4" />
      <p className="mt-1.5 sm:mt-3">
        <Link
          className="text-ink hover:text-skyline text-sm font-medium transition-colors duration-200"
          href="/order"
        >
          Prefer a monthly collection or Special Menu? Choose a collection →
        </Link>
      </p>
      <p className="mt-1.5 sm:mt-2">
        <Link
          className="text-ink hover:text-skyline text-sm font-medium transition-colors duration-200"
          href="/offers"
        >
          Current offers →
        </Link>
      </p>

      <Suspense fallback={<BrowseCatalogueFallback />}>
        <BrowseCatalogueIsland />
      </Suspense>

      <p className="mt-10">
        <StorefrontHomeLink />
      </p>
      <StorefrontStaffSignIn />
      <PreorderInProgressBar />
    </main>
  );
}
