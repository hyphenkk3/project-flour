import Link from "next/link";
import { StorefrontCakeCard } from "@/workspaces/storefront/catalog/StorefrontCakeCard";
import {
  getCurrentCollection,
  listAvailableCakes,
} from "@/workspaces/storefront/catalog/queries";

export const dynamic = "force-dynamic";

export async function StorefrontHomePage() {
  const collection = await getCurrentCollection();
  const cakes = collection ? await listAvailableCakes(collection.id) : [];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-10 space-y-3">
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
          Whitebird Cake House
        </p>
        <h1 className="font-display text-ink text-4xl tracking-tight sm:text-5xl">
          {collection?.name ?? "This month’s collection"}
        </h1>
        <p className="text-skyline max-w-xl text-base leading-relaxed">
          Choose a cake for your celebration. We&apos;ll confirm your preorder
          details with you after submission.
        </p>
      </header>

      {cakes.length === 0 ? (
        <p className="text-skyline text-sm">
          No cakes are available right now. Please check back soon.
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cakes.map((cake) => (
            <li key={cake.id}>
              <StorefrontCakeCard cake={cake} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-skyline mt-12 text-center text-sm">
        Staff?{" "}
        <Link className="text-signal font-medium underline" href="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
