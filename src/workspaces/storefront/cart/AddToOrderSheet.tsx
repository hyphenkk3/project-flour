"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import type { StorefrontCake } from "@/types/storefront";
import { isFullMonthPickupScope } from "@/engines/menu/customer-browse";
import { storefrontPhotoForSize } from "@/workspaces/storefront/catalog/cake-photo-map";
import {
  formatPreorderRequirement,
  formatRm,
} from "@/workspaces/storefront/catalog/pricing";
import {
  emptyPreorderDraft,
  mergeDraftItem,
  readPreorderDraft,
  writePreorderDraft,
} from "@/workspaces/storefront/checkout/preorder-draft";

export type AddToOrderPickupScope = {
  from: string;
  to: string;
  pickup?: string | null;
};

type AddToOrderSheetProps = {
  cake: StorefrontCake;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  pickupScope?: AddToOrderPickupScope | null;
  initialSizeId?: string;
};

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim().slice(0, 10));
}

export function AddToOrderSheet({
  cake,
  open,
  onClose,
  onAdded,
  pickupScope = null,
  initialSizeId,
}: AddToOrderSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [sizeId, setSizeId] = useState(
    initialSizeId || cake.sizes[0]?.id || "",
  );
  const [quantity, setQuantity] = useState(1);

  const selected = cake.sizes.find((size) => size.id === sizeId);
  const photo = storefrontPhotoForSize(cake.photos, sizeId);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  function addToOrder() {
    if (!selected) return;
    const draft = readPreorderDraft() ?? emptyPreorderDraft();
    const next = mergeDraftItem(draft, {
      cakeId: cake.id,
      sizeId: selected.id,
      quantity,
      cakeName: cake.name,
      sizeLabel: selected.size,
      unitPrice: selected.price,
      preorderDays: selected.preorderDays,
    });
    const from = pickupScope?.from?.trim().slice(0, 10) ?? "";
    const to = pickupScope?.to?.trim().slice(0, 10) ?? "";
    if (isYmd(from) && isYmd(to)) {
      next.pickupScopeFrom = from;
      next.pickupScopeTo = to;
      next.pickupScopeConstrainsBounds = !isFullMonthPickupScope(from, to);
    }
    writePreorderDraft(next);
    onAdded();
  }

  return (
    <dialog
      aria-labelledby={titleId}
      className="border-fog bg-mist text-ink w-full max-w-none rounded-t-2xl border p-0 shadow-lg backdrop:bg-ink/40 open:fixed open:inset-x-0 open:bottom-0 open:mt-auto open:mb-0 md:open:inset-auto md:open:top-1/2 md:open:left-1/2 md:open:bottom-auto md:open:max-w-md md:open:-translate-x-1/2 md:open:-translate-y-1/2 md:rounded-2xl"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      ref={dialogRef}
    >
      <form
        className="flex flex-col gap-5 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:pt-5 md:pb-6"
        onSubmit={(event) => {
          event.preventDefault();
          addToOrder();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-signal text-[11px] font-semibold tracking-[0.18em] uppercase">
              Add to Order
            </p>
            <h2
              className="font-display text-ink mt-1 text-2xl tracking-tight"
              id={titleId}
            >
              {cake.name}
            </h2>
          </div>
          <button
            aria-label="Close"
            className="text-skyline hover:text-ink inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-medium"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="bg-fog aspect-[4/3] overflow-hidden rounded-xl">
          {photo ? (
            <CakePhotoImage
              alt={photo.altText || cake.name}
              sizes="(min-width: 768px) 28rem, 100vw"
              src={photo.url}
            />
          ) : (
            <div className="text-skyline flex h-full items-center justify-center px-4 text-center text-sm">
              Photo coming soon
            </div>
          )}
        </div>

        {cake.sizes.length === 0 ? (
          <p className="text-skyline text-sm">This cake has no sizes yet.</p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="text-ink text-sm font-medium">Size</legend>
            <ul className="grid gap-2">
              {cake.sizes.map((size) => {
                const selectedSize = size.id === sizeId;
                return (
                  <li key={size.id}>
                    <label
                      className={
                        selectedSize
                          ? "border-ink bg-white flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 px-4 py-3"
                          : "border-fog bg-white hover:border-skyline flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3"
                      }
                    >
                      <span className="min-w-0">
                        <input
                          checked={selectedSize}
                          className="sr-only"
                          name="add-to-order-size"
                          onChange={() => setSizeId(size.id)}
                          type="radio"
                          value={size.id}
                        />
                        <span className="text-ink block text-sm font-medium">
                          {size.size}
                        </span>
                        <span className="text-skyline mt-0.5 block text-sm">
                          {formatPreorderRequirement(size.preorderDays)}
                        </span>
                      </span>
                      <span className="text-ink shrink-0 text-sm font-semibold tabular-nums">
                        {formatRm(size.price)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-ink text-sm font-medium" id={`${titleId}-qty`}>
            Quantity
          </p>
          <div
            aria-labelledby={`${titleId}-qty`}
            className="flex items-center gap-2"
            role="group"
          >
            <button
              aria-label="Decrease quantity"
              className="border-fog text-ink inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border bg-white text-lg disabled:opacity-40"
              disabled={quantity <= 1}
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              type="button"
            >
              −
            </button>
            <span
              aria-live="polite"
              className="text-ink min-w-8 text-center text-sm font-medium tabular-nums"
            >
              {quantity}
            </span>
            <button
              aria-label="Increase quantity"
              className="border-fog text-ink inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border bg-white text-lg"
              onClick={() => setQuantity((value) => Math.min(99, value + 1))}
              type="button"
            >
              +
            </button>
          </div>
        </div>

        <button
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-medium disabled:opacity-50"
          disabled={!selected}
          type="submit"
        >
          Add
        </button>
      </form>
    </dialog>
  );
}

type AddToOrderButtonProps = {
  cake: StorefrontCake;
  pickupScope?: AddToOrderPickupScope | null;
  initialSizeId?: string;
  className?: string;
};

export function AddToOrderButton({
  cake,
  pickupScope = null,
  initialSizeId,
  className = "",
}: AddToOrderButtonProps) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 2200);
    return () => window.clearTimeout(timer);
  }, [added]);

  return (
    <div className={className}>
      <button
        className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-medium disabled:opacity-50"
        disabled={cake.sizes.length === 0}
        onClick={() => setOpen(true)}
        type="button"
      >
        Add to Order
      </button>
      {added ? (
        <p
          className="text-ink mt-2 text-center text-sm"
          role="status"
        >
          Added to your order
        </p>
      ) : null}
      {open ? (
        <AddToOrderSheet
          cake={cake}
          initialSizeId={initialSizeId}
          key={`${cake.id}:${initialSizeId ?? ""}`}
          onAdded={() => {
            setOpen(false);
            setAdded(true);
          }}
          onClose={() => setOpen(false)}
          open
          pickupScope={pickupScope}
        />
      ) : null}
    </div>
  );
}
