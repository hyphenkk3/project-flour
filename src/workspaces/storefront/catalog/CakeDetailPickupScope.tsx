"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { StorefrontCake } from "@/types/storefront";
import {
  getStoredCakeEntryScopeSnapshot,
  resolveCakeDetailPickupScope,
  subscribeCakeEntryScope,
} from "@/workspaces/storefront/catalog/cake-entry-scope";
import { StorefrontCakeDetailView } from "@/workspaces/storefront/catalog/StorefrontCakeDetailView";

type CakeDetailPickupScopeProps = {
  availabilityNote?: string | null;
  cake: StorefrontCake;
  hideAddToOrder?: boolean;
  pickupDateNotice?: string | null;
  urlFrom?: string | null;
  urlPickup?: string | null;
  urlTo?: string | null;
};

export function CakeDetailPickupScope({
  availabilityNote,
  cake,
  hideAddToOrder = false,
  pickupDateNotice,
  urlFrom = null,
  urlPickup = null,
  urlTo = null,
}: CakeDetailPickupScopeProps) {
  const cakeId = cake.id;
  const stored = useSyncExternalStore(
    subscribeCakeEntryScope,
    () => getStoredCakeEntryScopeSnapshot(cakeId),
    () => null,
  );
  const scope = resolveCakeDetailPickupScope({
    cakeId,
    searchParams: {
      get(name: string) {
        if (name === "from") return urlFrom;
        if (name === "to") return urlTo;
        if (name === "pickup") return urlPickup;
        return null;
      },
    },
    stored,
  });
  const fromCollection = scope != null;

  return (
    <>
      <Link
        className="text-skyline hover:text-ink text-sm font-medium"
        href={fromCollection ? "/order" : "/browse"}
        prefetch
      >
        {fromCollection ? "← Choose your collection" : "← Browse Cakes"}
      </Link>
      <StorefrontCakeDetailView
        availabilityNote={availabilityNote}
        cake={cake}
        hideAddToOrder={hideAddToOrder}
        pickupDateNotice={pickupDateNotice}
        pickupScopeFrom={scope?.from ?? null}
        pickupScopePickup={scope?.pickup ?? null}
        pickupScopeTo={scope?.to ?? null}
      />
    </>
  );
}
