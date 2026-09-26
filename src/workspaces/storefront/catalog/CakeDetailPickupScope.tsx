"use client";

import { useSyncExternalStore } from "react";
import type { CatalogueVoucherRecord } from "@/types/catalogue-voucher";
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
  offerToday?: string | null;
  offerVoucher?: CatalogueVoucherRecord | null;
  urlFrom?: string | null;
  urlPickup?: string | null;
  urlTo?: string | null;
};

export function CakeDetailPickupScope({
  availabilityNote,
  cake,
  hideAddToOrder = false,
  offerToday = null,
  offerVoucher = null,
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

  return (
    <StorefrontCakeDetailView
      availabilityNote={availabilityNote}
      cake={cake}
      hideAddToOrder={hideAddToOrder}
      offerToday={offerToday}
      offerVoucher={offerVoucher}
      pickupDateNotice={pickupDateNotice}
      pickupScopeFrom={scope?.from ?? null}
      pickupScopePickup={scope?.pickup ?? null}
      pickupScopeTo={scope?.to ?? null}
    />
  );
}
