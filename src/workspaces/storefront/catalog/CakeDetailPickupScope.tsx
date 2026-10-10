"use client";

import { useSyncExternalStore } from "react";
import type { CatalogueVoucherRecord } from "@/types/catalogue-voucher";
import type { StorefrontCake } from "@/types/storefront";
import type { CakeOfferVoucher } from "@/workspaces/storefront/offers/CakeOfferHint";
import {
  getStoredCakeEntryScopeSnapshot,
  resolveCakeDetailPickupScope,
  subscribeCakeEntryScope,
} from "@/workspaces/storefront/catalog/cake-entry-scope";
import { usePreorderDraft } from "@/workspaces/storefront/cart/usePreorderDraft";
import { cakeDetailPriceDate } from "@/workspaces/storefront/catalog/pickup-date-pricing";
import { StorefrontCakeDetailView } from "@/workspaces/storefront/catalog/StorefrontCakeDetailView";
import { usePickupDatePricedCakes } from "@/workspaces/storefront/catalog/usePickupDatePricedCakes";

type CakeDetailPickupScopeProps = {
  availabilityNote?: string | null;
  cake: StorefrontCake;
  hideAddToOrder?: boolean;
  pickupDateNotice?: string | null;
  offerToday?: string | null;
  offerVoucher?: CatalogueVoucherRecord | null;
  offerPromise?: Promise<CakeOfferVoucher | null>;
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
  offerPromise,
  pickupDateNotice,
  urlFrom = null,
  urlPickup = null,
  urlTo = null,
}: CakeDetailPickupScopeProps) {
  const cakeId = cake.id;
  const draft = usePreorderDraft();
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
  const priceDate = cakeDetailPriceDate(scope?.pickup, draft?.pickupDate);
  const { cakes: pricedCakes, ready: pricesReady } = usePickupDatePricedCakes(
    [cake],
    priceDate,
  );

  return (
    <StorefrontCakeDetailView
      availabilityNote={availabilityNote}
      cake={pricedCakes[0] ?? cake}
      hideAddToOrder={hideAddToOrder}
      offerToday={offerToday}
      offerVoucher={offerVoucher}
      offerPromise={offerPromise}
      pickupDateNotice={pickupDateNotice}
      pickupScopeFrom={scope?.from ?? null}
      pickupScopePickup={priceDate}
      pickupScopeTo={scope?.to ?? null}
      pickupPricesReady={pricesReady}
    />
  );
}
