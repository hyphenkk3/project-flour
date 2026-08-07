"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StorefrontCake, StorefrontCollection } from "@/types/storefront";
import {
  formatCollectionAvailabilityLabel,
  formatRm,
} from "@/workspaces/storefront/catalog/pricing";

type CakeDetailPurchasePanelProps = {
  cake: StorefrontCake;
  collection: StorefrontCollection | null;
};

export function CakeDetailPurchasePanel({
  cake,
  collection,
}: CakeDetailPurchasePanelProps) {
  const router = useRouter();
  const [selectedSizeId, setSelectedSizeId] = useState(cake.sizes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const selectedSize = cake.sizes.find((size) => size.id === selectedSizeId);

  function handlePreorder() {
    if (!selectedSizeId) {
      setError("Please choose a size.");
      return;
    }
    setError(null);
    router.push(`/order?cake=${cake.id}&size=${selectedSizeId}`);
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <div>
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

      {collection ? (
        <section className="border-fog rounded-2xl border bg-white px-4 py-4 sm:px-5">
          <p className="text-status-success text-[11px] font-semibold tracking-[0.14em] uppercase">
            Available this collection
          </p>
          <p className="text-ink mt-2 text-base font-semibold">
            {formatCollectionAvailabilityLabel(collection)}
          </p>
          <p className="text-skyline mt-1 text-sm">
            Available for preorder during this collection.
          </p>
        </section>
      ) : null}

      <button
        className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 text-sm font-medium disabled:opacity-50"
        disabled={cake.sizes.length === 0}
        onClick={handlePreorder}
        type="button"
      >
        Preorder This Cake
      </button>
    </div>
  );
}
