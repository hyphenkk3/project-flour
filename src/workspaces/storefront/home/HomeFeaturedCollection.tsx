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
import { storefrontKickerClass } from "@/workspaces/storefront/StorefrontBrand";

export type HomeFeaturedCollectionProps = {
  kicker: string;
  heading: string;
  description: string;
  viewAllHref: string;
  viewAllLabel: string;
  cakes: readonly StorefrontCake[];
  cakeHrefs: Readonly<Record<string, string>>;
};

export function HomeFeaturedCollection({
  kicker,
  heading,
  description,
  viewAllHref,
  viewAllLabel,
  cakes,
  cakeHrefs,
}: HomeFeaturedCollectionProps) {
  return (
    <section className="px-6 pt-6">
      <p className={storefrontKickerClass}>{kicker}</p>
      <h2 className="font-display text-ink mt-2 text-[1.45rem] leading-tight tracking-tight">
        {heading}
      </h2>
      <p className="text-skyline mt-1.5 max-w-[20rem] text-[13px] leading-relaxed">
        {description}
      </p>
      {cakes.length > 0 ? (
        <ul className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {cakes.map((cake) => {
            const size = cake.sizes[0] ?? null;
            const photo =
              storefrontPhotoForSize(cake.photos, size?.id) ??
              storefrontDefaultPhoto(cake.photos);
            const from = startingPrice(cake);
            const preorder = cakeCardPreorderLabel(cake);
            const href = cakeHrefs[cake.id] ?? viewAllHref;
            return (
              <li className="w-[8.5rem] shrink-0" key={cake.id}>
                <Link className="group block" href={href}>
                  <div className="relative aspect-square overflow-hidden rounded-[10px]">
                    {photo?.url ? (
                      <CakePhotoImage
                        alt={photo.altText || cake.name}
                        sizes="136px"
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
      <Link
        className="text-ink mt-4 inline-flex items-center text-[13px] font-medium"
        href={viewAllHref}
      >
        {viewAllLabel}
      </Link>
    </section>
  );
}
