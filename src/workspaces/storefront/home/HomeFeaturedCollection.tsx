import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import {
  HOMEPAGE_COLLECTION_PREVIEW_DISPLAY_MAX,
  takeHomepageCollectionPreviewCakes,
} from "@/engines/menu/homepage-collection-preview";
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
  const previewCakes = takeHomepageCollectionPreviewCakes(cakes);

  return (
    <section className="border-ink/[0.1] mt-8 border-t px-6 pt-8 sm:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <p className={storefrontKickerClass}>{kicker}</p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-ink text-[1.45rem] leading-tight tracking-tight">
            {heading}
          </h2>
          <Link
            className="text-skyline hover:text-ink shrink-0 text-[13px] font-medium"
            href={viewAllHref}
          >
            View all →
          </Link>
        </div>
        <p className="text-skyline mt-1.5 max-w-[20rem] text-[13px] leading-relaxed">
          {description}
        </p>
        {previewCakes.length > 0 ? (
          <div className="-mx-6 mt-4 overflow-x-auto overscroll-x-contain sm:-mx-10 lg:mx-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex w-max gap-3 px-6 pr-8 sm:px-10 sm:pr-12 lg:w-full lg:pl-0 lg:pr-0">
              {previewCakes.map((cake, index) => {
                const size = cake.sizes[0] ?? null;
                const photo =
                  storefrontPhotoForSize(cake.photos, size?.id) ??
                  storefrontDefaultPhoto(cake.photos);
                const price = formatHomepagePrice(cake);
                const preorder = cakeCardPreorderLabel(cake);
                const href = cakeHrefs[cake.id] ?? viewAllHref;
                const hideOnMobile =
                  index >= HOMEPAGE_COLLECTION_PREVIEW_DISPLAY_MAX;
                return (
                  <li
                    className={`w-[8.5rem] shrink-0 lg:min-w-0 lg:w-[calc((100%-3.75rem)/6)]${hideOnMobile ? " max-lg:hidden" : ""}`}
                    key={cake.id}
                  >
                    <Link className="group block" href={href}>
                      <div className="relative aspect-square w-[8.5rem] overflow-hidden rounded-[10px] lg:w-full">
                        {photo?.url ? (
                          <CakePhotoImage
                            alt={photo.altText || cake.name}
                            sizes="(min-width: 1024px) 182px, 136px"
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
                      {price ? (
                        <p className="text-ink mt-0.5 text-xs tabular-nums">
                          {price}
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
              <li className="w-[8.5rem] shrink-0 lg:min-w-0 lg:w-[calc((100%-3.75rem)/6)]">
                <Link
                  aria-label={viewAllLabel}
                  className="group block"
                  href={viewAllHref}
                >
                  <div className="flex aspect-square w-[8.5rem] items-end rounded-[10px] bg-ink/[0.035] px-3.5 py-3.5 lg:w-full">
                    <span
                      aria-hidden="true"
                      className="text-ink text-[1.15rem] leading-none"
                    >
                      →
                    </span>
                  </div>
                  <p className="text-ink group-hover:text-skyline mt-1.5 text-[0.88rem] leading-snug font-medium tracking-tight">
                    View all
                  </p>
                  <p className="text-skyline mt-0.5 text-[10px] leading-tight">
                    {heading} →
                  </p>
                </Link>
              </li>
            </ul>
          </div>
        ) : (
          <Link
            className="text-ink mt-4 inline-flex items-center text-[13px] font-medium"
            href={viewAllHref}
          >
            {viewAllLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
