import Link from "next/link";
import type { StorefrontCake } from "@/types/storefront";
import {
  formatAvailableSizes,
  formatRm,
  startingPrice,
  storefrontCategoryLabel,
} from "@/workspaces/storefront/catalog/pricing";

type StorefrontCakeCardProps = {
  cake: StorefrontCake;
  availabilityNote?: string | null;
  hideOrderCta?: boolean;
  /** Collection entry scope forwarded to cake detail. */
  detailHref?: string;
};

export function StorefrontCakeCard({
  cake,
  availabilityNote,
  hideOrderCta = false,
  detailHref,
}: StorefrontCakeCardProps) {
  const from = startingPrice(cake);
  const sizes = formatAvailableSizes(cake);
  const category = storefrontCategoryLabel(cake.category);

  return (
    <article className="border-fog flex h-full flex-col overflow-hidden rounded-2xl border bg-white">
      <div className="bg-fog aspect-[4/3] overflow-hidden">
        {cake.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={cake.photos[0]?.altText || cake.name}
            className="h-full w-full object-cover"
            src={cake.image}
          />
        ) : (
          <div className="text-skyline flex h-full items-center justify-center px-4 text-center text-sm">
            Photo coming soon
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          {category ? (
            <p className="text-signal text-[11px] font-semibold tracking-[0.14em] uppercase">
              {category}
            </p>
          ) : null}
          <h2 className="font-display text-ink mt-1 text-xl tracking-tight">
            {cake.name}
          </h2>
          {from !== null ? (
            <p className="text-ink mt-1 text-sm font-medium tabular-nums">
              From {formatRm(from)}
            </p>
          ) : null}
          {sizes ? (
            <p className="text-skyline mt-1 text-sm">{sizes}</p>
          ) : null}
          {availabilityNote ? (
            <p className="text-status-danger mt-2 text-sm">{availabilityNote}</p>
          ) : null}
        </div>
        {hideOrderCta ? null : (
          <Link
            className="bg-ink text-mist hover:bg-skyline mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-medium"
            href={detailHref ?? `/cakes/${cake.id}`}
          >
            View cake
          </Link>
        )}
      </div>
    </article>
  );
}
