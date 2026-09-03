import Link from "next/link";
import { notFound } from "next/navigation";
import { CUSTOMER_PICKUP_DATE_CAKE_NOTICE } from "@/engines/menu/customer-browse";
import { StorefrontCakeDetailView } from "@/workspaces/storefront/catalog/StorefrontCakeDetailView";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";
import { getBrowsePublishedCakeById } from "@/workspaces/storefront/catalog/queries";
import { StorefrontHomeLink } from "@/workspaces/storefront/StorefrontBrand";

export const dynamic = "force-dynamic";

type CakeDetailProps = {
  cakeId: string;
  pickupScopeFrom?: string | null;
  pickupScopeTo?: string | null;
  pickupScopePickup?: string | null;
};

export async function StorefrontCakeDetail({
  cakeId,
  pickupScopeFrom = null,
  pickupScopeTo = null,
  pickupScopePickup = null,
}: CakeDetailProps) {
  const cake = await getBrowsePublishedCakeById(cakeId);

  if (!cake) {
    notFound();
  }

  const from = pickupScopeFrom?.trim().slice(0, 10) ?? "";
  const to = pickupScopeTo?.trim().slice(0, 10) ?? "";
  const fromCollection =
    /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);

  return (
    <main className="bg-mist mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <StorefrontHomeLink />

      <PreorderInProgressBar />

      <Link
        className="text-skyline hover:text-ink text-sm font-medium"
        href={fromCollection ? "/order" : "/browse"}
      >
        {fromCollection ? "← Choose your collection" : "← Browse Cakes"}
      </Link>

      <StorefrontCakeDetailView
        availabilityNote={cake.availabilityNote}
        cake={cake}
        pickupDateNotice={CUSTOMER_PICKUP_DATE_CAKE_NOTICE}
        pickupScopeFrom={pickupScopeFrom}
        pickupScopePickup={pickupScopePickup}
        pickupScopeTo={pickupScopeTo}
      />
    </main>
  );
}
