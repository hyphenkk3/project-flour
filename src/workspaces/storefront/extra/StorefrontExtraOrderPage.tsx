import { freshPickAvailabilityLabel } from "@/engines/extra/customer-fresh-picks";
import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
} from "@/workspaces/storefront/StorefrontBrand";
import { GuestExtraOrderForm } from "@/workspaces/storefront/extra/GuestExtraOrderForm";
import { getStorefrontExtraById } from "@/workspaces/storefront/extra/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

type StorefrontExtraOrderPageProps = {
  extraId: string;
};

export async function StorefrontExtraOrderPage({
  extraId,
}: StorefrontExtraOrderPageProps) {
  const extra = await getStorefrontExtraById(extraId);

  return (
    <main className="bg-mist min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <StorefrontHomeLink />
        {!extra ? (
          <section className="border-fog mt-10 rounded-3xl border bg-white px-6 py-10">
            <h1 className="font-display text-ink text-3xl tracking-tight">
              Extra cake unavailable
            </h1>
            <p className="text-skyline mt-3 text-sm leading-relaxed">
              This Extra cake is no longer available to order.
            </p>
            <p className="mt-6">
              <Link className="text-signal text-sm font-medium" href="/extra">
                View Fresh Picks
              </Link>
            </p>
          </section>
        ) : (
          <>
            <p className="text-signal mt-8 text-[11px] font-semibold tracking-[0.14em] uppercase">
              {freshPickAvailabilityLabel(extra.day)}
            </p>
            <h1 className="font-display text-ink mt-2 text-3xl tracking-tight sm:text-4xl">
              {extra.cakeName}
            </h1>
            <p className="text-skyline mt-1 text-sm">{extra.sizeLabel}</p>
            {extra.imageUrl ? (
              <div className="border-fog mt-6 overflow-hidden rounded-3xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={extra.imageAlt || extra.cakeName}
                  className="h-full w-full object-cover"
                  src={extra.imageUrl}
                />
              </div>
            ) : null}
            <div className="mt-8">
              <GuestExtraOrderForm extra={extra} />
            </div>
          </>
        )}
        <StorefrontStaffSignIn />
      </div>
    </main>
  );
}
