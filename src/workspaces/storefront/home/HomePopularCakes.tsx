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
  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-ink text-xl tracking-tight sm:text-2xl">
          Popular Cakes
        </h2>
        <Link
          className="text-ink hover:text-skyline inline-flex items-center text-sm font-medium"
          href="/browse"
        >
          View all →
        </Link>
      </div>
      {cakes.length > 0 ? (
        <ul className="flex gap-2.5 overflow-x-auto pb-1">
          {cakes.map((cake) => {
            const size = cake.sizes[0] ?? null;
            const photo =
              storefrontPhotoForSize(cake.photos, size?.id) ??
              storefrontDefaultPhoto(cake.photos);
            const from = startingPrice(cake);
            const preorder = cakeCardPreorderLabel(cake);
            return (
              <li className="w-24 shrink-0" key={cake.id}>
                <Link className="group block" href={`/cakes/${cake.id}`}>
                  <div className="relative h-24 w-24 overflow-hidden rounded-[10px]">
                    {photo?.url ? (
                      <CakePhotoImage
                        alt={photo.altText || cake.name}
                        sizes="96px"
                        src={photo.url}
                      />
                    ) : (
                      <div className="text-skyline flex h-full items-center justify-center px-2 text-center text-[11px]">
                        Photo coming soon
                      </div>
                    )}
                  </div>
                  <h3 className="font-display text-ink group-hover:text-skyline mt-1.5 line-clamp-2 text-[0.88rem] leading-snug tracking-tight">
                    {cake.name}
                  </h3>
                  {from != null ? (
                    <p className="text-ink mt-0.5 text-xs tabular-nums">
                      {formatRm(from)}
                    </p>
                  ) : null}
                  {preorder ? (
                    <p className="text-skyline mt-0.5 text-[10px] leading-tight">
                      {preorder}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
