import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { BROWSE_CURRENTLY_UNAVAILABLE_NOTE } from "@/engines/menu/homepage-collection-preview";
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
  hideAddToOrder?: boolean;
  /** Collection entry scope forwarded to cake detail. */
  detailHref?: string;
  pickupScope?: AddToOrderPickupScope | null;
};

const PREORDER_BADGE_BASE =
  "pointer-events-none absolute top-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-full px-2.5 py-1 text-left text-[10px] leading-tight font-medium tracking-[0.16em] uppercase sm:text-[11px]";

const PREORDER_BADGE_TONE: Record<CakeCardPreorderBadgeTone, string> = {
  standard: "bg-ink/40 text-mist",
  longer: "bg-ink text-paper",
  varies: "bg-ink/70 text-paper",
};

export function StorefrontCakeCard({
  cake,
  availabilityNote,
  hideOrderCta = false,
  hideAddToOrder = false,
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
    <article className="flex h-full flex-col overflow-hidden">
      <div className="bg-fog group relative aspect-[4/3] overflow-hidden rounded-[10px]">
        {hideOrderCta ? (
          imageUrl ? (
            <CakePhotoImage
              alt={imageAlt}
              sizes="(min-width: 1024px) 33vw, 50vw"
              src={imageUrl}
              zoomOnHover
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
                zoomOnHover
              />
            ) : (
              <div className="text-skyline flex h-full items-center justify-center px-3 text-center text-xs sm:px-4 sm:text-sm">
                Photo coming soon
              </div>
            )}
          </Link>
        )}
        {preorder && preorderTone ? (
          <p
            aria-hidden="true"
            className={`${PREORDER_BADGE_BASE} ${PREORDER_BADGE_TONE[preorderTone]}`}
          >
            {preorder}
          </p>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 pt-2.5 sm:gap-2.5 sm:pt-3">
        <div className="min-w-0">
          {category ? (
            <p className="text-signal text-[10px] font-medium tracking-[0.16em] uppercase sm:text-[11px]">
              {category}
            </p>
          ) : null}
          <h2 className="font-display text-ink mt-0.5 text-[1.05rem] leading-snug tracking-tight sm:mt-1 sm:text-xl">
            {hideOrderCta ? (
              cake.name
            ) : (
              <Link
                className="hover:text-skyline transition-colors duration-200"
                href={href}
              >
                {cake.name}
              </Link>
            )}
          </h2>
          {preorder ? (
            <p className="text-skyline mt-1.5 hidden text-[11px] font-medium tracking-[0.16em] uppercase sm:block">
              {preorder}
            </p>
          ) : null}
          {from !== null ? (
            <p className="text-ink mt-1 text-sm tabular-nums">
              From {formatRm(from)}
            </p>
          ) : null}
          {sizes ? (
            <p className="text-skyline mt-0.5 text-xs sm:mt-1 sm:text-sm">
              {sizes}
            </p>
          ) : null}
          {availabilityNote ? (
            <p
              className={`${
                availabilityNote === BROWSE_CURRENTLY_UNAVAILABLE_NOTE
                  ? "text-skyline"
                  : "text-status-danger"
              } mt-1.5 text-xs sm:mt-2 sm:text-sm`}
            >
              {availabilityNote}
            </p>
          ) : null}
        </div>
        {hideOrderCta ? null : (
          <div className="mt-auto grid gap-1 pt-1 sm:gap-1.5 sm:pt-0">
            {hideAddToOrder ? null : (
              <AddToOrderButton
                buttonClassName="border-ink bg-mist text-ink hover:border-skyline inline-flex h-11 min-h-11 w-full items-center justify-center rounded-md border px-3 text-[15px] leading-none font-medium transition duration-200 disabled:opacity-50 sm:h-auto sm:min-h-11 sm:rounded-md sm:border-fog sm:bg-transparent sm:px-4 sm:text-sm sm:leading-normal sm:hover:border-ink sm:hover:bg-transparent sm:active:bg-transparent"
                cake={cake}
                pickupScope={pickupScope}
              />
            )}
            <Link
              className="text-skyline hover:text-ink hidden min-h-11 w-full items-center justify-center text-sm font-medium transition-colors duration-200 sm:inline-flex"
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
