"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { StorefrontCake } from "@/types/storefront";
import { StorefrontCakeDetailView } from "@/workspaces/storefront/catalog/StorefrontCakeDetailView";

function readYmd(value: string | null): string {
  return value?.trim().slice(0, 10) ?? "";
}

type CakeDetailPickupScopeProps = {
  availabilityNote?: string | null;
  cake: StorefrontCake;
  hideAddToOrder?: boolean;
  pickupDateNotice?: string | null;
};

export function CakeDetailPickupScope({
  availabilityNote,
  cake,
  hideAddToOrder = false,
  pickupDateNotice,
}: CakeDetailPickupScopeProps) {
  const query = useSearchParams();
  const from = readYmd(query.get("from"));
  const to = readYmd(query.get("to"));
  const pickup = readYmd(query.get("pickup"));
  const fromCollection =
    /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);

  return (
    <>
      <Link
        className="text-skyline hover:text-ink text-sm font-medium"
        href={fromCollection ? "/order" : "/browse"}
      >
        {fromCollection ? "← Choose your collection" : "← Browse Cakes"}
      </Link>
      <StorefrontCakeDetailView
        availabilityNote={availabilityNote}
        cake={cake}
        hideAddToOrder={hideAddToOrder}
        pickupDateNotice={pickupDateNotice}
        pickupScopeFrom={from || null}
        pickupScopePickup={pickup || null}
        pickupScopeTo={to || null}
      />
    </>
  );
}
