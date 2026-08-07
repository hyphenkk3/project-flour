import Link from "next/link";
import type { StorefrontCake } from "@/types/storefront";
import {
  formatRm,
  startingPrice,
} from "@/workspaces/storefront/catalog/pricing";

type StorefrontCakeCardProps = {
  cake: StorefrontCake;
};

export function StorefrontCakeCard({ cake }: StorefrontCakeCardProps) {
  const from = startingPrice(cake);

  return (
    <article className="border-fog overflow-hidden rounded-2xl border bg-white">
      <div className="bg-fog aspect-[4/3] overflow-hidden">
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
      <div className="space-y-3 p-4">
        <div>
          <h2 className="text-ink font-display text-xl tracking-tight">
            {cake.name}
          </h2>
          {from !== null ? (
            <p className="text-skyline mt-1 text-sm">From {formatRm(from)}</p>
          ) : null}
        </div>
        <Link
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-medium"
          href={`/cakes/${cake.id}`}
        >
          View Details
        </Link>
      </div>
    </article>
  );
}
