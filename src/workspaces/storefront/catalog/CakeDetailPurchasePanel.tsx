"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StorefrontCake } from "@/types/storefront";
import {
  formatRm,
  storefrontCategoryLabel,
} from "@/workspaces/storefront/catalog/pricing";
import {
  emptyPreorderDraft,
  mergeDraftItem,
  readPreorderDraft,
  writePreorderDraft,
  type PreorderDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";
import { isFullMonthPickupScope } from "@/engines/menu/customer-browse";

type CakeDetailPurchasePanelProps = {
  cake: StorefrontCake;
  availabilityNote?: string | null;
  pickupDateNotice?: string | null;
  pickupScopeFrom?: string | null;
  pickupScopeTo?: string | null;
  pickupScopePickup?: string | null;
};

function existingQuantityForSize(
  items: PreorderDraftItem[],
  cakeId: string,
  sizeId: string,
): number {
  return items
    .filter((item) => item.cakeId === cakeId && item.sizeId === sizeId)
    .reduce((sum, item) => sum + item.quantity, 0);
}

export function CakeDetailPurchasePanel({
  cake,
  availabilityNote,
  pickupDateNotice,
  pickupScopeFrom = null,
  pickupScopeTo = null,
  pickupScopePickup = null,
}: CakeDetailPurchasePanelProps) {
  const router = useRouter();
  const [selectedSizeId, setSelectedSizeId] = useState(cake.sizes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<PreorderDraftItem[]>([]);

  const selectedSize = cake.sizes.find((size) => size.id === selectedSizeId);
  const category = storefrontCategoryLabel(cake.category);

  useEffect(() => {
    const draft = readPreorderDraft();
    setDraftItems(draft?.items ?? []);
  }, []);

  const existingQuantity = useMemo(
    () =>
      selectedSizeId
        ? existingQuantityForSize(draftItems, cake.id, selectedSizeId)
        : 0,
    [draftItems, cake.id, selectedSizeId],
  );

  function handlePrimaryAction() {
    if (!selectedSize) {
      setError("Please choose a size.");
      return;
    }
    setError(null);
    const draft = readPreorderDraft() ?? emptyPreorderDraft();
    const scopeFrom = pickupScopeFrom?.trim().slice(0, 10) ?? "";
    const scopeTo = pickupScopeTo?.trim().slice(0, 10) ?? "";
    const hasScope =
      /^\d{4}-\d{2}-\d{2}$/.test(scopeFrom) &&
      /^\d{4}-\d{2}-\d{2}$/.test(scopeTo);
    writePreorderDraft({
      ...mergeDraftItem(draft, {
        cakeId: cake.id,
        sizeId: selectedSize.id,
        quantity: 1,
        cakeName: cake.name,
        sizeLabel: selectedSize.size,
        unitPrice: selectedSize.price,
      }),
      pickupScopeFrom: hasScope ? scopeFrom : draft.pickupScopeFrom,
      pickupScopeTo: hasScope ? scopeTo : draft.pickupScopeTo,
      pickupScopeConstrainsBounds: hasScope
        ? !isFullMonthPickupScope(scopeFrom, scopeTo)
        : draft.pickupScopeConstrainsBounds,
    });
    if (hasScope) {
      const params = new URLSearchParams();
      params.set("from", scopeFrom);
      params.set("to", scopeTo);
      const pickup = pickupScopePickup?.trim().slice(0, 10) ?? "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(pickup)) {
        params.set("pickup", pickup);
      }
      router.push(`/order/checkout?${params.toString()}`);
      return;
    }
    router.push("/order/checkout");
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <div>
        {category ? (
          <p className="text-signal text-[11px] font-semibold tracking-[0.14em] uppercase">
            {category}
          </p>
        ) : null}
        <h1 className="font-display text-ink text-[2rem] leading-tight tracking-tight sm:text-4xl">
          {cake.name}
        </h1>
        {cake.description ? (
          <p className="text-skyline mt-3 text-sm leading-relaxed sm:text-[0.95rem]">
            {cake.description}
          </p>
        ) : null}
      </div>

      {cake.sharingGuide?.trim() ? (
        <section>
          <h2 className="text-ink text-[11px] font-semibold tracking-[0.14em] uppercase">
            Sharing guide
          </h2>
          <p className="text-skyline mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
            {cake.sharingGuide}
          </p>
        </section>
      ) : null}

      {cake.allergens.length > 0 ? (
        <section>
          <h2 className="text-ink text-[11px] font-semibold tracking-[0.14em] uppercase">
            Allergens
          </h2>
          <p className="text-skyline mt-1.5 text-sm">{cake.allergens.join(", ")}</p>
        </section>
      ) : null}

      <section className="border-fog rounded-2xl border bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-ink text-[11px] font-semibold tracking-[0.14em] uppercase">
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
                      ? "border-ink bg-mist text-ink flex min-h-12 w-full items-center justify-between rounded-xl border-2 px-4 text-left"
                      : "border-fog text-ink hover:border-skyline flex min-h-12 w-full items-center justify-between rounded-xl border bg-white px-4 text-left"
                  }
                  onClick={() => {
                    setSelectedSizeId(size.id);
                    setError(null);
                  }}
                  type="button"
                >
                  <span className="text-sm font-medium">{size.size}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatRm(size.price)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {error ? (
          <p className="text-status-danger mt-2 text-sm">{error}</p>
        ) : null}
      </section>

      {availabilityNote ? (
        <p className="text-status-danger text-sm">{availabilityNote}</p>
      ) : null}

      <section className="border-fog rounded-2xl border bg-white px-4 py-4 sm:px-5">
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
          {existingQuantity} already in your preorder for this size.
        </p>
      ) : null}

      <button
        className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 text-sm font-medium disabled:opacity-50"
        disabled={cake.sizes.length === 0}
        onClick={handlePrimaryAction}
        type="button"
      >
        Add to preorder
      </button>
    </div>
  );
}
