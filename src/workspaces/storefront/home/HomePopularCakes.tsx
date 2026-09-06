import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import type { StorefrontCake } from "@/types/storefront";
import {
  storefrontDefaultPhoto,
  storefrontPhotoForSize,
} from "@/workspaces/storefront/catalog/cake-photo-map";
import {
  cakeCardPreorderLabel,
  formatRm,
  startingPrice,
} from "@/workspaces/storefront/catalog/pricing";

type HomePopularCakesProps = {
  cakes: readonly StorefrontCake[];
};

export function HomePopularCakes({ cakes }: HomePopularCakesProps) {
  if (cakes.length === 0) return null;

  return (
    <section className="px-6 pb-12 sm:px-10 sm:pb-16">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-3 flex items-baseline justify-between gap-3 sm:mb-4">
          <h2 className="font-display text-ink text-xl tracking-tight sm:text-2xl">
            Popular Cakes
          </h2>
          <Link
            className="text-ink hover:text-skyline inline-flex min-h-11 items-center text-sm font-medium"
            href="/browse"
          >
            View all →
          </Link>
        </div>
        <ul className="flex gap-3 overflow-x-auto pb-1 sm:gap-3.5">
          {cakes.map((cake) => {
            const size = cake.sizes[0] ?? null;
            const photo =
              storefrontPhotoForSize(cake.photos, size?.id) ??
              storefrontDefaultPhoto(cake.photos);
            const from = startingPrice(cake);
            const preorder = cakeCardPreorderLabel(cake);
            return (
              <li className="w-[9.5rem] shrink-0 sm:w-[12rem]" key={cake.id}>
                <Link className="group block" href={`/cakes/${cake.id}`}>
                  <div className="relative aspect-[4/5] overflow-hidden">
                    {photo?.url ? (
                      <CakePhotoImage
                        alt={photo.altText || cake.name}
                        sizes="184px"
                        src={photo.url}
                      />
                    ) : (
                      <div className="text-skyline flex h-full items-center justify-center px-3 text-center text-xs">
                        Photo coming soon
                      </div>
                    )}
                  </div>
                  <h3 className="font-display text-ink mt-2.5 text-[1.02rem] leading-snug tracking-tight group-hover:text-skyline">
                    {cake.name}
                  </h3>
                  {size ? (
                    <p className="text-skyline mt-0.5 text-xs">{size.size}</p>
                  ) : null}
                  {from != null ? (
                    <p className="text-ink mt-1 text-sm tabular-nums">
                      {formatRm(from)}
                    </p>
                  ) : null}
                  {preorder ? (
                    <p className="text-skyline mt-1 text-[11px]">{preorder}</p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
