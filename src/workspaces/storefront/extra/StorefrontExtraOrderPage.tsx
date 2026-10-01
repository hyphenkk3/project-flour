import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { Suspense } from "react";
import {
  FRESH_PICKS_SOLD_OUT,
  FRESH_PICKS_UNAVAILABLE_BODY,
  freshPickCustomerStatusLabel,
} from "@/engines/extra/customer-fresh-picks";
import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
} from "@/workspaces/storefront/StorefrontBrand";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import { loadFreshPicksPreparationConfig } from "@/workspaces/storefront/extra/config";
import { GuestExtraOrderForm } from "@/workspaces/storefront/extra/GuestExtraOrderForm";
import { FreshPickCartShell } from "@/workspaces/storefront/extra/FreshPickCartShell";
import { getStorefrontExtraById } from "@/workspaces/storefront/extra/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

type StorefrontExtraOrderPageProps = {
  params: Promise<{ id: string }>;
};

function ExtraOrderFallback() {
  return (
    <section aria-busy="true" className="mt-10">
      <p className="sr-only" role="status">
        Opening Fresh Pick
      </p>
      <div aria-hidden className="bg-fog h-8 w-56 rounded-sm" />
      <div aria-hidden className="bg-fog mt-3 h-4 w-24 rounded-sm" />
      <div className="bg-fog mt-6 aspect-[4/3] rounded-[10px]" />
      <div aria-hidden className="bg-fog mt-8 h-11 w-full rounded-md" />
    </section>
  );
}

export function StorefrontExtraOrderPage({
  params,
}: StorefrontExtraOrderPageProps) {
  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <StorefrontHomeLink />
        <Suspense fallback={<ExtraOrderFallback />}>
          <ExtraOrderBody params={params} />
        </Suspense>
        <StorefrontStaffSignIn />
      </div>
      <FreshPickCartShell />
    </main>
  );
}

async function ExtraOrderBody({
  params,
}: StorefrontExtraOrderPageProps) {
  const { id: extraId } = await params;
  const [extra, hoursSnapshot, preparationConfig] = await Promise.all([
    getStorefrontExtraById(extraId),
    loadOperatingHoursSnapshot(),
    loadFreshPicksPreparationConfig(),
  ]);

  if (!extra) {
    return (
      <section className="border-fog mt-10 border-t pt-8">
        <h1 className="font-display text-ink text-3xl tracking-tight">
          {FRESH_PICKS_SOLD_OUT}
        </h1>
        <p className="text-skyline mt-3 text-sm leading-relaxed">
          {FRESH_PICKS_UNAVAILABLE_BODY}
        </p>
        <p className="mt-6">
          <Link className="text-signal text-sm font-medium" href="/extra">
            View Fresh Picks
          </Link>
        </p>
      </section>
    );
  }

  return (
    <>
      <p className="text-signal mt-8 text-[11px] font-medium tracking-[0.18em] uppercase">
        {freshPickCustomerStatusLabel({
          walkInHeld: extra.walkInHeld,
          days: extra.day,
        })}
      </p>
      <h1 className="font-display text-ink mt-2 text-3xl tracking-tight sm:text-4xl">
        {extra.cakeName}
      </h1>
      <p className="text-skyline mt-1 text-sm">{extra.sizeLabel}</p>
      {extra.imageUrl ? (
        <div className="bg-fog mt-6 aspect-[4/3] overflow-hidden rounded-[10px]">
          <CakePhotoImage
            alt={extra.imageAlt || extra.cakeName}
            priority
            sizes="(min-width: 768px) 48rem, 100vw"
            src={extra.imageUrl}
          />
        </div>
      ) : null}
      {extra.walkInHeld ? null : (
        <div className="mt-8">
          <GuestExtraOrderForm
            extra={extra}
            hoursSnapshot={hoursSnapshot}
            preparationConfig={preparationConfig}
          />
        </div>
      )}
    </>
  );
}
