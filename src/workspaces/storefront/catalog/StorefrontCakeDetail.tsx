import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CUSTOMER_PICKUP_DATE_CAKE_NOTICE } from "@/engines/menu/customer-browse";
import { CakeDetailPickupScope } from "@/workspaces/storefront/catalog/CakeDetailPickupScope";
import { StorefrontCakeDetailView } from "@/workspaces/storefront/catalog/StorefrontCakeDetailView";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";
import {
  browseCakePreviewFromDisplay,
  getBrowseCakeDisplayById,
  getBrowsePublishedCakeById,
  mergeBrowseCakeDisplay,
} from "@/workspaces/storefront/catalog/queries";
import { StorefrontHomeLink } from "@/workspaces/storefront/StorefrontBrand";
import type { StorefrontCake } from "@/types/storefront";

type CakeDetailSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

type CakeDetailProps = {
  cakeId: string;
  searchParams: CakeDetailSearchParams;
};

function ymdQueryValue(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const key = raw?.trim().slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function CakeDetailFallback({
  availabilityNote,
  cake,
}: {
  availabilityNote?: string | null;
  cake: StorefrontCake;
}) {
  return (
    <>
      <Link
        className="text-skyline hover:text-ink text-sm font-medium"
        href="/browse"
        prefetch
      >
        ← Browse Cakes
      </Link>
      <StorefrontCakeDetailView
        availabilityNote={availabilityNote}
        cake={cake}
        hideAddToOrder
        pickupDateNotice={CUSTOMER_PICKUP_DATE_CAKE_NOTICE}
      />
    </>
  );
}

function CakeDetailBodyFallback() {
  return (
    <div aria-busy="true" className="mt-6">
      <p className="sr-only" role="status">
        Opening cake
      </p>
      <p className="text-skyline text-sm font-medium">Opening cake</p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-10">
        <div className="bg-fog aspect-square w-full rounded-[10px]" />
        <div className="flex flex-col gap-5">
          <div aria-hidden className="bg-fog h-8 w-3/4 rounded-sm" />
          <div aria-hidden className="bg-fog h-4 w-full rounded-sm" />
          <div aria-hidden className="bg-fog h-11 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

async function CakeDetailLive({
  display,
  livePromise,
  searchParams,
}: {
  display: Awaited<ReturnType<typeof getBrowseCakeDisplayById>>;
  livePromise: ReturnType<typeof getBrowsePublishedCakeById>;
  searchParams: CakeDetailSearchParams;
}) {
  const [cake, query] = await Promise.all([livePromise, searchParams]);
  if (!cake) {
    notFound();
  }
  const merged = mergeBrowseCakeDisplay(cake, display);

  return (
    <CakeDetailPickupScope
      availabilityNote={merged.availabilityNote}
      cake={merged}
      hideAddToOrder={cake.currentlyOffered === false}
      pickupDateNotice={CUSTOMER_PICKUP_DATE_CAKE_NOTICE}
      urlFrom={ymdQueryValue(query.from)}
      urlPickup={ymdQueryValue(query.pickup)}
      urlTo={ymdQueryValue(query.to)}
    />
  );
}

async function CakeDetailWithDisplay({
  cakeId,
  searchParams,
}: {
  cakeId: string;
  searchParams: CakeDetailSearchParams;
}) {
  const displayPromise = getBrowseCakeDisplayById(cakeId);
  const livePromise = getBrowsePublishedCakeById(cakeId);
  const display = await displayPromise;
  const preview = browseCakePreviewFromDisplay(cakeId, display);

  return (
    <Suspense
      fallback={
        preview ? (
          <CakeDetailFallback cake={preview} />
        ) : (
          <CakeDetailBodyFallback />
        )
      }
    >
      <CakeDetailLive
        display={display}
        livePromise={livePromise}
        searchParams={searchParams}
      />
    </Suspense>
  );
}

export function StorefrontCakeDetail({
  cakeId,
  searchParams,
}: CakeDetailProps) {
  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <StorefrontHomeLink />

      <PreorderInProgressBar />

      <Suspense fallback={<CakeDetailBodyFallback />}>
        <CakeDetailWithDisplay cakeId={cakeId} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
