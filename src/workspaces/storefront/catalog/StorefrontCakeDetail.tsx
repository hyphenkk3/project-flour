import Link from "next/link";
import { notFound } from "next/navigation";
import { CUSTOMER_PICKUP_DATE_CAKE_NOTICE } from "@/engines/menu/customer-browse";
import { CakeDetailPurchasePanel } from "@/workspaces/storefront/catalog/CakeDetailPurchasePanel";
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

  const photos = cake.photos.length > 0 ? cake.photos : [];
  const hero = photos[0];
  const morePhotos = photos.slice(1);

  return (
    <main className="bg-mist mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <StorefrontHomeLink />

      <PreorderInProgressBar />

      <Link
        className="text-skyline hover:text-ink text-sm font-medium"
        href="/browse"
      >
        ← Browse Cakes
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-10">
        <div className="space-y-3">
          <div className="border-fog overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="bg-fog aspect-square w-full">
              {hero ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={hero.altText || cake.name}
                  className="h-full w-full object-cover"
                  src={hero.url}
                />
              ) : (
                <div className="text-skyline flex h-full items-center justify-center text-sm">
                  Photo coming soon
                </div>
              )}
            </div>
          </div>
          {morePhotos.length > 0 ? (
            <ul className="grid grid-cols-3 gap-3">
              {morePhotos.map((photo) => (
                <li
                  className="border-fog overflow-hidden rounded-xl border bg-white"
                  key={photo.url}
                >
                  <div className="bg-fog aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={photo.altText || cake.name}
                      className="h-full w-full object-cover"
                      src={photo.url}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <CakeDetailPurchasePanel
          availabilityNote={cake.availabilityNote}
          cake={cake}
          pickupDateNotice={CUSTOMER_PICKUP_DATE_CAKE_NOTICE}
          pickupScopeFrom={pickupScopeFrom}
          pickupScopePickup={pickupScopePickup}
          pickupScopeTo={pickupScopeTo}
        />
      </div>
    </main>
  );
}
