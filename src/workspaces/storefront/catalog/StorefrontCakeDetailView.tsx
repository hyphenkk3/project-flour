"use client";

import { useState } from "react";
import type { StorefrontCake } from "@/types/storefront";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { CakeDetailPurchasePanel } from "@/workspaces/storefront/catalog/CakeDetailPurchasePanel";
import {
  storefrontPhotoForSize,
  storefrontPhotoGallery,
} from "@/workspaces/storefront/catalog/cake-photo-map";

type StorefrontCakeDetailViewProps = {
  cake: StorefrontCake;
  availabilityNote?: string | null;
  pickupDateNotice?: string | null;
  pickupScopeFrom?: string | null;
  pickupScopeTo?: string | null;
  pickupScopePickup?: string | null;
};

export function StorefrontCakeDetailView({
  cake,
  availabilityNote,
  pickupDateNotice,
  pickupScopeFrom,
  pickupScopeTo,
  pickupScopePickup,
}: StorefrontCakeDetailViewProps) {
  const [selectedSizeId, setSelectedSizeId] = useState(cake.sizes[0]?.id ?? "");
  const hero = storefrontPhotoForSize(cake.photos, selectedSizeId);
  const gallery = storefrontPhotoGallery(cake.photos, hero);

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-10">
      <div className="space-y-3">
        <div className="border-fog overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="bg-fog aspect-square w-full">
            {hero ? (
              <CakePhotoImage
                alt={hero.altText || cake.name}
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                src={hero.url}
              />
            ) : (
              <div className="text-skyline flex h-full items-center justify-center text-sm">
                Photo coming soon
              </div>
            )}
          </div>
        </div>
        {gallery.length > 0 ? (
          <ul className="grid grid-cols-3 gap-3">
            {gallery.map((photo) => (
              <li
                className="border-fog overflow-hidden rounded-xl border bg-white"
                key={photo.id}
              >
                <div className="bg-fog aspect-square">
                  <CakePhotoImage
                    alt={photo.altText || cake.name}
                    sizes="160px"
                    src={photo.url}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <CakeDetailPurchasePanel
        availabilityNote={availabilityNote}
        cake={cake}
        onSelectedSizeIdChange={setSelectedSizeId}
        pickupDateNotice={pickupDateNotice}
        pickupScopeFrom={pickupScopeFrom}
        pickupScopePickup={pickupScopePickup}
        pickupScopeTo={pickupScopeTo}
        selectedSizeId={selectedSizeId}
      />
    </div>
  );
}
