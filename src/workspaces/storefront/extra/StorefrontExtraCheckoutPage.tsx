import { StorefrontHomeLink } from "@/workspaces/storefront/StorefrontBrand";
import { GuestExtraCheckoutForm } from "@/workspaces/storefront/extra/GuestExtraCheckoutForm";

export const dynamic = "force-dynamic";

export function StorefrontExtraCheckoutPage() {
  return (
    <main className="bg-paper mx-auto min-h-screen max-w-5xl px-5 py-10 sm:px-6">
      <StorefrontHomeLink />
      <h1 className="font-display text-ink mt-8 text-3xl tracking-tight sm:text-4xl">
        Your Order
      </h1>
      <p className="text-skyline mt-3 max-w-xl text-[0.95rem] leading-relaxed">
        No payment is required yet. We&apos;ll confirm your Fresh Pick details
        with you after submission.
      </p>
      <div className="mt-10 max-w-lg">
        <GuestExtraCheckoutForm />
      </div>
    </main>
  );
}
