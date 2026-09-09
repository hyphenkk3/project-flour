import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import type { StorefrontCake } from "@/types/storefront";
import {
  storefrontDefaultPhoto,
  storefrontPhotoForSize,
} from "@/workspaces/storefront/catalog/cake-photo-map";
import {
  cakeCardPreorderLabel,
  formatHomepagePrice,
} from "@/workspaces/storefront/catalog/pricing";
import { storefrontKickerClass } from "@/workspaces/storefront/StorefrontBrand";

type HomePopularCakesProps = {
  cakes: readonly StorefrontCake[];
};

export function HomePopularCakes({ cakes }: HomePopularCakesProps) {
  return (
    <section className="border-ink/[0.1] mt-8 min-w-0 border-t px-6 pt-8">
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <p className={storefrontKickerClass}>Favourites</p>
          <h2 className="font-display text-ink mt-2 text-xl tracking-tight sm:text-2xl">
            Popular Cakes
          </h2>
        </div>
        <Link
          className="text-ink hover:text-skyline inline-flex items-center text-sm font-medium"
          href="/browse"
        >
          View all →
        </Link>
      </div>
      {cakes.length > 0 ? (
        <div className="-mx-6 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex w-max gap-2.5 px-6 pr-8">
            {cakes.map((cake) => {
              const size = cake.sizes[0] ?? null;
              const photo =
                storefrontPhotoForSize(cake.photos, size?.id) ??
                storefrontDefaultPhoto(cake.photos);
              const from = formatHomepagePrice(cake);
              const preorder = cakeCardPreorderLabel(cake);
              return (
                <li className="w-24 shrink-0" key={cake.id}>
                  <Link className="group block" href={`/cakes/${cake.id}`}>
                    <div className="relative aspect-square h-24 w-24 overflow-hidden rounded-[10px]">
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
                    <h3 className="font-display text-ink group-hover:text-skyline mt-1.5 line-clamp-2 min-h-[2.3em] text-[0.88rem] leading-snug tracking-tight">
                      {cake.name}
                    </h3>
                    {from != null ? (
                      <p className="text-ink mt-0.5 text-xs tabular-nums">
                        {from}
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
        </div>
      ) : null}
    </section>
  );
}
