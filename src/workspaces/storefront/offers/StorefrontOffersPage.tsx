import Link from "next/link";
import { isCatalogueVoucherDiscoverable } from "@/engines/vouchers/catalogue-voucher";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
} from "@/workspaces/storefront/StorefrontBrand";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";
import { CatalogueOfferCard } from "@/workspaces/storefront/offers/CatalogueOfferCard";
import { listPublicCatalogueVouchers } from "@/workspaces/vouchers/catalogue-queries";

export async function StorefrontOffersPage() {
  const today = singaporeDateFromIso(new Date().toISOString());
  const vouchers = (await listPublicCatalogueVouchers()).filter((voucher) =>
    isCatalogueVoucherDiscoverable(voucher, today),
  );

  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-5 py-4 sm:px-6 sm:py-10">
      <StorefrontHomeLink />
      <h1 className="font-display text-ink mt-3 text-2xl tracking-tight sm:mt-8 sm:text-4xl">
        Current Offers
      </h1>
      <p className="text-skyline mt-1.5 max-w-xl text-sm leading-snug sm:mt-3 sm:text-[0.95rem] sm:leading-relaxed">
        Promotions you can use on a qualifying cake order. Eligibility is
        confirmed when you place or pay for the order.
      </p>
      {vouchers.length > 0 ? (
        <section className="mt-8 grid gap-5 sm:grid-cols-2">
          {vouchers.map((voucher) => (
            <CatalogueOfferCard key={voucher.id} voucher={voucher} />
          ))}
        </section>
      ) : (
        <p className="text-skyline mt-8 text-sm">
          There are no catalogue offers to show right now.
        </p>
      )}
      <p className="mt-10">
        <Link
          className="text-ink hover:text-skyline text-sm font-medium"
          href="/browse"
        >
          Browse cakes →
        </Link>
      </p>
      <StorefrontStaffSignIn />
      <PreorderInProgressBar />
    </main>
  );
}
