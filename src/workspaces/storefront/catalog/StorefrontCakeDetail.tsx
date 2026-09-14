import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CUSTOMER_PICKUP_DATE_CAKE_NOTICE } from "@/engines/menu/customer-browse";
import { CakeDetailPickupScope } from "@/workspaces/storefront/catalog/CakeDetailPickupScope";
import { StorefrontCakeDetailView } from "@/workspaces/storefront/catalog/StorefrontCakeDetailView";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";
import {
  getBrowseCakeDisplayById,
  getBrowsePublishedCakeById,
  mergeBrowseCakeDisplay,
  type BrowseStorefrontCake,
} from "@/workspaces/storefront/catalog/queries";
import { StorefrontHomeLink } from "@/workspaces/storefront/StorefrontBrand";
import type { StorefrontCake } from "@/types/storefront";

type CakeDetailProps = {
  cakeId: string;
};

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

async function CakeDetailWithDisplay({
  cake,
  hideAddToOrder,
}: {
  cake: BrowseStorefrontCake;
  hideAddToOrder: boolean;
}) {
  const display = await getBrowseCakeDisplayById(cake.id);
  const merged = mergeBrowseCakeDisplay(cake, display);

  return (
    <Suspense
      fallback={
        <CakeDetailFallback
          availabilityNote={merged.availabilityNote}
          cake={merged}
        />
      }
    >
      <CakeDetailPickupScope
        availabilityNote={merged.availabilityNote}
        cake={merged}
        hideAddToOrder={hideAddToOrder}
        pickupDateNotice={CUSTOMER_PICKUP_DATE_CAKE_NOTICE}
      />
    </Suspense>
  );
}

export async function StorefrontCakeDetail({ cakeId }: CakeDetailProps) {
  const cake = await getBrowsePublishedCakeById(cakeId);

  if (!cake) {
    notFound();
  }

  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <StorefrontHomeLink />

      <PreorderInProgressBar />

      <Suspense
        fallback={
          <CakeDetailFallback
            availabilityNote={cake.availabilityNote}
            cake={cake}
          />
        }
      >
        <CakeDetailWithDisplay
          cake={cake}
          hideAddToOrder={cake.currentlyOffered === false}
        />
      </Suspense>
    </main>
  );
}
