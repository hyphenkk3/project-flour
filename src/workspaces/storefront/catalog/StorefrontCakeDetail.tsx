import Link from "next/link";
import { notFound } from "next/navigation";
import { CakeDetailPurchasePanel } from "@/workspaces/storefront/catalog/CakeDetailPurchasePanel";
import {
  getAvailableCakeById,
  getCurrentCollection,
} from "@/workspaces/storefront/catalog/queries";

export const dynamic = "force-dynamic";

type CakeDetailProps = {
  cakeId: string;
};

export async function StorefrontCakeDetail({ cakeId }: CakeDetailProps) {
  const [cake, collection] = await Promise.all([
    getAvailableCakeById(cakeId),
    getCurrentCollection(),
  ]);

  if (!cake) {
    notFound();
  }

  return (
    <main className="bg-mist mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        className="text-skyline hover:text-ink text-sm font-medium"
        href="/"
      >
        ← Collection
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-10">
        <div className="border-fog overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="bg-fog aspect-square w-full">
            {cake.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={cake.name}
                className="h-full w-full object-cover"
                src={cake.image}
              />
            ) : (
              <div className="text-skyline flex h-full items-center justify-center text-sm">
                Photo coming soon
              </div>
            )}
          </div>
        </div>

        <CakeDetailPurchasePanel cake={cake} collection={collection} />
      </div>
    </main>
  );
}
