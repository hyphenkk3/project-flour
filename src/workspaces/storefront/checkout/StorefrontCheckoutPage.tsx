import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestCheckoutForm } from "@/workspaces/storefront/checkout/GuestCheckoutForm";
import {
  getCurrentCollection,
  listAvailableCakes,
} from "@/workspaces/storefront/catalog/queries";

export const dynamic = "force-dynamic";

export async function StorefrontCheckoutPage() {
  const collection = await getCurrentCollection();
  if (!collection) {
    notFound();
  }

  const cakes = await listAvailableCakes(collection.id);
  if (cakes.length === 0) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <Link className="text-skyline hover:text-ink text-sm font-medium" href="/">
        ← Collection
      </Link>
      <h1 className="font-display text-ink mt-4 text-3xl tracking-tight">
        Your Preorder
      </h1>
      <p className="text-skyline mt-2 text-sm leading-relaxed">
        No payment is required yet. We&apos;ll confirm your preorder details
        with you after submission.
      </p>
      <div className="mt-6">
        <GuestCheckoutForm cakes={cakes} />
      </div>
    </main>
  );
}
