"use client";

import { useMemo } from "react";
import type { StorefrontCake } from "@/types/storefront";
import { AddToOrderButton } from "@/workspaces/storefront/cart/AddToOrderSheet";
import { usePreorderDraft } from "@/workspaces/storefront/cart/usePreorderDraft";
import { BROWSE_CURRENTLY_UNAVAILABLE_NOTE } from "@/engines/menu/homepage-collection-preview";
import {
  formatPreorderRequirement,
  formatRm,
  storefrontCategoryLabel,
  storefrontTagLabel,
} from "@/workspaces/storefront/catalog/pricing";

type CakeDetailPurchasePanelProps = {
  cake: StorefrontCake;
  availabilityNote?: string | null;
  hideAddToOrder?: boolean;
  pickupDateNotice?: string | null;
  pickupScopeFrom?: string | null;
  pickupScopeTo?: string | null;
  pickupScopePickup?: string | null;
  selectedSizeId: string;
  onSelectedSizeIdChange: (sizeId: string) => void;
};

function existingQuantityForSize(
  cakeId: string,
  sizeId: string,
  items: Array<{ cakeId: string; sizeId: string; quantity: number }>,
): number {
  return items
    .filter((item) => item.cakeId === cakeId && item.sizeId === sizeId)
    .reduce((sum, item) => sum + item.quantity, 0);
}

export function CakeDetailPurchasePanel({
  cake,
  availabilityNote,
  hideAddToOrder = false,
  pickupDateNotice,
  pickupScopeFrom = null,
  pickupScopeTo = null,
  pickupScopePickup = null,
  selectedSizeId,
  onSelectedSizeIdChange,
}: CakeDetailPurchasePanelProps) {
  const draft = usePreorderDraft();
  const selectedSize = cake.sizes.find((size) => size.id === selectedSizeId);
  const category = storefrontCategoryLabel(cake);
  const tags = storefrontTagLabel(cake);
  const from = pickupScopeFrom?.trim().slice(0, 10) ?? "";
  const to = pickupScopeTo?.trim().slice(0, 10) ?? "";
  const pickupScope =
    /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? { from, to, pickup: pickupScopePickup }
      : null;

  const existingQuantity = useMemo(
    () =>
      selectedSizeId
        ? existingQuantityForSize(
            cake.id,
            selectedSizeId,
            draft?.items ?? [],
          )
        : 0,
    [cake.id, draft?.items, selectedSizeId],
  );

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <div>
        {category ? (
          <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
            {category}
          </p>
        ) : null}
        <h1 className="font-display text-ink text-[2rem] leading-tight tracking-tight sm:text-4xl">
          {cake.name}
        </h1>
        {tags ? (
          <p className="text-skyline mt-2 text-[11px] leading-snug tracking-[0.02em]">
            {tags}
          </p>
        ) : null}
        {cake.description ? (
          <p className="text-skyline mt-3 text-sm leading-relaxed sm:text-[0.95rem]">
            {cake.description}
          </p>
        ) : null}
      </div>

      {cake.sharingGuide?.trim() ? (
        <section>
          <h2 className="text-ink text-[11px] font-medium tracking-[0.16em] uppercase">
            Sharing guide
          </h2>
          <p className="text-skyline mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
            {cake.sharingGuide}
          </p>
        </section>
      ) : null}

      {cake.allergens.length > 0 ? (
        <section>
          <h2 className="text-ink text-[11px] font-medium tracking-[0.16em] uppercase">
            Allergens
          </h2>
          <p className="text-skyline mt-1.5 text-sm">{cake.allergens.join(", ")}</p>
        </section>
      ) : null}

      <section className="border-fog border-t pt-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-ink text-[11px] font-medium tracking-[0.16em] uppercase">
            Available sizes
          </h2>
          {selectedSize ? (
            <p className="text-ink text-lg font-semibold tabular-nums">
              {formatRm(selectedSize.price)}
            </p>
          ) : null}
        </div>
        <ul className="mt-3 grid gap-2">
          {cake.sizes.map((size) => {
            const selected = size.id === selectedSizeId;
            return (
              <li key={size.id}>
                <button
                  aria-pressed={selected}
                  className={
                    selected
                      ? "border-ink bg-mist text-ink flex min-h-12 w-full items-center justify-between border px-4 py-2 text-left"
                      : "border-fog text-ink hover:border-ink flex min-h-12 w-full items-center justify-between border bg-transparent px-4 py-2 text-left"
                  }
                  onClick={() => onSelectedSizeIdChange(size.id)}
                  type="button"
                >
                  <span>
                    <span className="block text-sm font-medium">{size.size}</span>
                    <span className="text-skyline mt-0.5 block text-sm">
                      {formatPreorderRequirement(size.preorderDays)}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatRm(size.price)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {availabilityNote ? (
        <p
          className={
            availabilityNote === BROWSE_CURRENTLY_UNAVAILABLE_NOTE
              ? "text-skyline text-sm"
              : "text-status-danger text-sm"
          }
        >
          {availabilityNote}
        </p>
      ) : null}

      {hideAddToOrder ? null : (
        <>
          <section className="border-fog border-t pt-4">
            <p className="text-ink text-sm leading-relaxed">
              {pickupDateNotice ??
                "Your available cakes depend on your pickup date."}
            </p>
            <p className="text-skyline mt-1 text-sm">
              We&apos;ll confirm your preorder after you submit. Payment is
              arranged afterwards — not on this website.
            </p>
          </section>

          {existingQuantity > 0 ? (
            <p className="text-skyline text-sm">
              {existingQuantity} already in your order for this size.
            </p>
          ) : null}

          <AddToOrderButton
            cake={cake}
            initialSizeId={selectedSizeId}
            pickupScope={pickupScope}
          />
          <div aria-hidden className="h-20 md:hidden" />
        </>
      )}
    </div>
  );
}
