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
    "pointer-events-none absolute top-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-full px-2.5 py-1 text-left text-[10px] leading-tight font-semibold tracking-[0.14em] uppercase sm:text-[11px]";
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

  return (
    <article className="border-fog flex h-full flex-col overflow-hidden rounded-2xl border bg-white">
      <div className="bg-fog relative aspect-[4/3] overflow-hidden">
        {imageUrl ? (
          <CakePhotoImage
            alt={imageAlt}
            sizes="(min-width: 1024px) 33vw, 100vw"
            src={imageUrl}
          />
        ) : (
          <div className="text-skyline flex h-full items-center justify-center px-4 text-center text-sm">
            Photo coming soon
          </div>
        )}
        {preorder && preorderTone ? (
          <p aria-hidden="true" className={preorderBadgeClass(preorderTone)}>
            {preorder}
          </p>
        ) : null}
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
          {preorder ? (
            <p className="text-signal mt-1.5 text-[11px] font-semibold tracking-[0.16em] uppercase">
              {preorder}
            </p>
          ) : null}
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
          <div className="mt-auto grid gap-2">
            <AddToOrderButton cake={cake} pickupScope={pickupScope} />
            <Link
              className="text-ink inline-flex min-h-11 w-full items-center justify-center text-sm font-medium"
              href={detailHref ?? `/cakes/${cake.id}`}
            >
              View cake
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
