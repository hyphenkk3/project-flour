import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import type { StorefrontCake } from "@/types/storefront";
import { AddToOrderButton, type AddToOrderPickupScope } from "@/workspaces/storefront/cart/AddToOrderSheet";
import { storefrontDefaultPhoto } from "@/workspaces/storefront/catalog/cake-photo-map";
import {
  cakeCardPreorderBadgeTone,
  cakeCardPreorderLabel,
  formatAvailableSizes,
  formatRm,
  startingPrice,
  storefrontCategoryLabel,
  type CakeCardPreorderBadgeTone,
} from "@/workspaces/storefront/catalog/pricing";

type StorefrontCakeCardProps = {
  cake: StorefrontCake;
  availabilityNote?: string | null;
  hideOrderCta?: boolean;
  /** Collection entry scope forwarded to cake detail. */
  detailHref?: string;
  pickupScope?: AddToOrderPickupScope | null;
};

function preorderBadgeClass(tone: CakeCardPreorderBadgeTone): string {
  const base =
    "pointer-events-none absolute top-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-full px-2 py-0.5 text-left text-[10px] leading-tight font-semibold tracking-[0.14em] uppercase sm:px-2.5 sm:py-1 sm:text-[11px]";
  if (tone === "longer") {
    return `${base} bg-ink/85 text-mist shadow-sm backdrop-blur-sm`;
  }
  if (tone === "varies") {
    return `${base} bg-mist/95 text-skyline shadow-sm ring-1 ring-ink/10 backdrop-blur-sm`;
  }
  return `${base} bg-mist/95 text-ink shadow-sm ring-1 ring-ink/10 backdrop-blur-sm`;
}

export function StorefrontCakeCard({
  cake,
  availabilityNote,
  hideOrderCta = false,
  detailHref,
  pickupScope = null,
}: StorefrontCakeCardProps) {
  const from = startingPrice(cake);
  const sizes = formatAvailableSizes(cake);
  const category = storefrontCategoryLabel(cake.categoryName);
  const preorder = cakeCardPreorderLabel(cake);
  const preorderTone = cakeCardPreorderBadgeTone(cake);
  const hero = storefrontDefaultPhoto(cake.photos);
  const imageUrl = cake.image ?? hero?.url ?? null;
  const imageAlt = hero?.altText || cake.name;
  const href = detailHref ?? `/cakes/${cake.id}`;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl sm:rounded-2xl sm:border sm:border-fog sm:bg-white">
      <div className="bg-fog relative aspect-[4/3] overflow-hidden rounded-xl sm:rounded-none">
        {hideOrderCta ? (
          imageUrl ? (
            <CakePhotoImage
              alt={imageAlt}
              sizes="(min-width: 1024px) 33vw, 50vw"
              src={imageUrl}
            />
          ) : (
            <div className="text-skyline flex h-full items-center justify-center px-3 text-center text-xs sm:px-4 sm:text-sm">
              Photo coming soon
            </div>
          )
        ) : (
          <Link
            aria-label={`View ${cake.name}`}
            className="absolute inset-0"
            href={href}
          >
            {imageUrl ? (
              <CakePhotoImage
                alt={imageAlt}
                sizes="(min-width: 1024px) 33vw, 50vw"
                src={imageUrl}
              />
            ) : (
              <div className="text-skyline flex h-full items-center justify-center px-3 text-center text-xs sm:px-4 sm:text-sm">
                Photo coming soon
              </div>
            )}
          </Link>
        )}
        {preorder && preorderTone ? (
          <p aria-hidden="true" className={preorderBadgeClass(preorderTone)}>
            {preorder}
          </p>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 pt-2.5 sm:gap-3 sm:p-4">
        <div className="min-w-0">
          {category ? (
            <p className="text-signal text-[10px] font-semibold tracking-[0.14em] uppercase sm:text-[11px]">
              {category}
            </p>
          ) : null}
          <h2 className="font-display text-ink mt-0.5 text-[1.05rem] leading-snug tracking-tight sm:mt-1 sm:text-xl">
            {hideOrderCta ? (
              cake.name
            ) : (
              <Link className="hover:text-skyline" href={href}>
                {cake.name}
              </Link>
            )}
          </h2>
          {preorder ? (
            <p className="text-signal mt-1.5 hidden text-[11px] font-semibold tracking-[0.16em] uppercase sm:block">
              {preorder}
            </p>
          ) : null}
          {from !== null ? (
            <p className="text-ink mt-1 text-sm font-medium tabular-nums">
              From {formatRm(from)}
            </p>
          ) : null}
          {sizes ? (
            <p className="text-skyline mt-0.5 text-xs sm:mt-1 sm:text-sm">
              {sizes}
            </p>
          ) : null}
          {availabilityNote ? (
            <p className="text-status-danger mt-1.5 text-xs sm:mt-2 sm:text-sm">
              {availabilityNote}
            </p>
          ) : null}
        </div>
        {hideOrderCta ? null : (
          <div className="mt-auto grid gap-1 pt-1 sm:gap-2 sm:pt-0">
            <AddToOrderButton
              buttonClassName="border-ink bg-mist text-ink hover:bg-white active:bg-fog inline-flex h-11 min-h-11 w-full items-center justify-center rounded-xl border px-3 text-[15px] leading-none font-medium transition disabled:opacity-50 sm:h-auto sm:min-h-11 sm:rounded-full sm:border-0 sm:bg-ink sm:px-4 sm:text-sm sm:leading-normal sm:text-mist sm:hover:bg-skyline sm:active:bg-skyline"
              cake={cake}
              pickupScope={pickupScope}
            />
            <Link
              className="text-ink hidden min-h-11 w-full items-center justify-center text-sm font-medium sm:inline-flex"
              href={href}
            >
              View cake
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
