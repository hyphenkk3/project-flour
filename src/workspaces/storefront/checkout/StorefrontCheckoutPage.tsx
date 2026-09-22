"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import {
  CUSTOMER_PICKUP_DATE_CAKE_NOTICE,
  resolveCheckoutPickupScope,
} from "@/engines/menu/customer-browse";
import { GuestCheckoutForm } from "@/workspaces/storefront/checkout/GuestCheckoutForm";
import { StorefrontHomeLink } from "@/workspaces/storefront/StorefrontBrand";

function ymdQuery(value: string | null | undefined): string | null {
  const key = value?.trim().slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

type StorefrontCheckoutPageProps = {
  pickupQuery?: string | null;
  fromQuery?: string | null;
  toQuery?: string | null;
};

function StorefrontCheckoutPreparing() {
  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-5 py-10 sm:px-6">
      <StorefrontHomeLink />
      <h1 className="sr-only">Your Order</h1>
      <p className="text-skyline mt-8 text-sm" aria-live="polite">
        Preparing your preorder…
      </p>
    </main>
  );
}

function StorefrontCheckoutPageInner({
  pickupQuery = null,
  fromQuery = null,
  toQuery = null,
}: StorefrontCheckoutPageProps) {
  const searchParams = useSearchParams();
  const fromDate = earliestPickupDateYmd();
  const scopeFrom = ymdQuery(fromQuery ?? searchParams.get("from"));
  const scopeTo = ymdQuery(toQuery ?? searchParams.get("to"));
  const scope = resolveCheckoutPickupScope({
    earliest: fromDate,
    globalMax: null,
    scopeFrom,
    scopeTo,
  });
  const pickupFromQuery = ymdQuery(
    pickupQuery ?? searchParams.get("pickup"),
  );
  const suggestedPickupDate =
    pickupFromQuery &&
    pickupFromQuery >= scope.minPickupDate &&
    (!scope.maxPickupDate || pickupFromQuery <= scope.maxPickupDate)
      ? pickupFromQuery
      : scope.suggestedPickupDate;

  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-5 py-10 sm:px-6">
      <StorefrontHomeLink />
      <h1 className="sr-only">Your Order</h1>
      <p className="text-skyline mt-8 max-w-xl text-[0.95rem] leading-relaxed">
        No payment is required yet. We&apos;ll confirm your preorder details
        with you after submission. {CUSTOMER_PICKUP_DATE_CAKE_NOTICE}
      </p>
      <div className="mt-10">
        <GuestCheckoutForm
          maxPickupDate={scope.maxPickupDate}
          minPickupDate={scope.minPickupDate}
          pickupScopeConstrainsBounds={scope.scopeConstrainsBounds}
          pickupScopeFrom={scopeFrom}
          pickupScopeTo={scopeTo}
          suggestedPickupDate={suggestedPickupDate}
        />
      </div>
    </main>
  );
}

export function StorefrontCheckoutPage(props: StorefrontCheckoutPageProps) {
  return (
    <Suspense fallback={<StorefrontCheckoutPreparing />}>
      <StorefrontCheckoutPageInner {...props} />
    </Suspense>
  );
}
