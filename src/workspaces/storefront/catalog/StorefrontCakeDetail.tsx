import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CUSTOMER_PICKUP_DATE_CAKE_NOTICE } from "@/engines/menu/customer-browse";
import { CakeDetailPickupScope } from "@/workspaces/storefront/catalog/CakeDetailPickupScope";
import { StorefrontCakeDetailView } from "@/workspaces/storefront/catalog/StorefrontCakeDetailView";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";
import { getBrowsePublishedCakeById } from "@/workspaces/storefront/catalog/queries";
import { StorefrontHomeLink } from "@/workspaces/storefront/StorefrontBrand";
import type { StorefrontCake } from "@/types/storefront";

type CakeDetailProps = {
  cakeId: string;
};

function CakeDetailFallback({
  availabilityNote,
  cake,
  hideAddToOrder,
}: {
  availabilityNote?: string | null;
  cake: StorefrontCake;
  hideAddToOrder: boolean;
}) {
  return (
    <>
      <Link
        className="text-skyline hover:text-ink text-sm font-medium"
        href="/browse"
      >
        ← Browse Cakes
      </Link>
      <StorefrontCakeDetailView
        availabilityNote={availabilityNote}
        cake={cake}
        hideAddToOrder={hideAddToOrder}
        pickupDateNotice={CUSTOMER_PICKUP_DATE_CAKE_NOTICE}
      />
    </>
  );
}

export async function StorefrontCakeDetail({ cakeId }: CakeDetailProps) {
  const cake = await getBrowsePublishedCakeById(cakeId);

  if (!cake) {
    notFound();
  }

  const hideAddToOrder = cake.currentlyOffered === false;

  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <StorefrontHomeLink />

      <PreorderInProgressBar />

      <Suspense
        fallback={
          <CakeDetailFallback
            availabilityNote={cake.availabilityNote}
            cake={cake}
            hideAddToOrder={hideAddToOrder}
          />
        }
      >
        <CakeDetailPickupScope
          availabilityNote={cake.availabilityNote}
          cake={cake}
          hideAddToOrder={hideAddToOrder}
          pickupDateNotice={CUSTOMER_PICKUP_DATE_CAKE_NOTICE}
        />
      </Suspense>
    </main>
  );
}
