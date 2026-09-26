import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CUSTOMER_PICKUP_DATE_CAKE_NOTICE } from "@/engines/menu/customer-browse";
import { isDevPerfEnabled } from "@/lib/perf/dev-only-shared";
import { CakeDetailBackNav } from "@/workspaces/storefront/catalog/CakeDetailBackNav";
import { CakeDetailPickupScope } from "@/workspaces/storefront/catalog/CakeDetailPickupScope";
import { StorefrontCakeDetailPerfProbe } from "@/workspaces/storefront/catalog/StorefrontCakeDetailPerfProbe";
import { StorefrontCakeDetailView } from "@/workspaces/storefront/catalog/StorefrontCakeDetailView";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";
import {
  loadCakeOfferVoucher,
  type CakeOfferVoucher,
} from "@/workspaces/storefront/offers/CakeOfferHint";
import {
  browseCakePreviewFromDisplay,
  getBrowseCakeDisplayById,
  getBrowsePublishedCakeById,
  mergeBrowseCakeDisplay,
} from "@/workspaces/storefront/catalog/queries";
import type { StorefrontCake } from "@/types/storefront";

type CakeDetailSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

type CakeDetailProps = {
  params: Promise<{ id: string }>;
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
  offer,
}: {
  availabilityNote?: string | null;
  cake: StorefrontCake;
  offer: CakeOfferVoucher | null;
}) {
  return (
    <>
      {isDevPerfEnabled() ? (
        <StorefrontCakeDetailPerfProbe cakeId={cake.id} phase="preview" />
      ) : null}
      <StorefrontCakeDetailView
        availabilityNote={availabilityNote}
        cake={cake}
        hideAddToOrder
        offerToday={offer?.today ?? null}
        offerVoucher={offer?.voucher ?? null}
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
  displayPromise,
  livePromise,
  offerPromise,
  searchParams,
}: {
  displayPromise: ReturnType<typeof getBrowseCakeDisplayById>;
  livePromise: ReturnType<typeof getBrowsePublishedCakeById>;
  offerPromise: ReturnType<typeof loadCakeOfferVoucher>;
  searchParams: CakeDetailSearchParams;
}) {
  const [display, cake, query] = await Promise.all([
    displayPromise,
    livePromise,
    searchParams,
  ]);
  if (!cake) {
    notFound();
  }
  const merged = mergeBrowseCakeDisplay(cake, display);

  return (
    <>
      {isDevPerfEnabled() ? (
        <StorefrontCakeDetailPerfProbe cakeId={merged.id} phase="live" />
      ) : null}
      <CakeDetailPickupScope
        availabilityNote={merged.availabilityNote}
        cake={merged}
        hideAddToOrder={cake.currentlyOffered === false}
        offerPromise={offerPromise}
        pickupDateNotice={CUSTOMER_PICKUP_DATE_CAKE_NOTICE}
        urlFrom={ymdQueryValue(query.from)}
        urlPickup={ymdQueryValue(query.pickup)}
        urlTo={ymdQueryValue(query.to)}
      />
    </>
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
  const query = await searchParams;
  const offerPromise = loadCakeOfferVoucher(cakeId, {
    fulfilmentFrom: ymdQueryValue(query.from) ?? ymdQueryValue(query.pickup),
    fulfilmentTo: ymdQueryValue(query.to) ?? ymdQueryValue(query.pickup),
  });
  const display = await displayPromise;
  const preview = browseCakePreviewFromDisplay(cakeId, display);

  return (
    <Suspense
      fallback={
        preview ? (
          <CakeDetailFallback cake={preview} offer={null} />
        ) : (
          <CakeDetailBodyFallback />
        )
      }
    >
      <CakeDetailLive
        displayPromise={displayPromise}
        livePromise={livePromise}
        offerPromise={offerPromise}
        searchParams={searchParams}
      />
    </Suspense>
  );
}

async function CakeDetailResolved({
  params,
  searchParams,
}: CakeDetailProps) {
  const { id } = await params;
  return (
    <>
      <CakeDetailBackNav cakeId={id} />
      <PreorderInProgressBar />
      <Suspense fallback={<CakeDetailBodyFallback />}>
        <CakeDetailWithDisplay cakeId={id} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

export function StorefrontCakeDetail({
  params,
  searchParams,
}: CakeDetailProps) {
  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Suspense fallback={<CakeDetailBodyFallback />}>
        <CakeDetailResolved params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
