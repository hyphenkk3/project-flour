"use client";

import {
  cakeSizeAvailability,
  validCakeSizeSelection,
} from "@/engines/menu/cake-size-availability";
import { validateCartSizeAvailability } from "@/workspaces/storefront/cart/actions";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import { usePreorderDraft } from "@/workspaces/storefront/cart/usePreorderDraft";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { StorefrontOverlay } from "@/workspaces/storefront/StorefrontOverlay";
import type { StorefrontCake } from "@/types/storefront";
import { isFullMonthPickupScope } from "@/engines/menu/customer-browse";
import { storefrontPhotoForSize } from "@/workspaces/storefront/catalog/cake-photo-map";
import {
  formatPreorderRequirement,
  formatRm,
} from "@/workspaces/storefront/catalog/pricing";
import { usePickupDatePricedCakes } from "@/workspaces/storefront/catalog/usePickupDatePricedCakes";
import { openStorefrontOrder } from "@/workspaces/storefront/cart/open-order";
import {
  draftLineQuantity,
  emptyPreorderDraft,
  mergeDraftItem,
  readPreorderDraft,
  setDraftLineQuantity,
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
  onAdded: (result: "added" | "updated") => void;
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
  const titleId = useId();
  const draftState = usePreorderDraft();
  const [chosenPickupDate, setChosenPickupDate] = useState<string | null>(null);
  const pickupDate =
    chosenPickupDate ?? pickupScope?.pickup ?? draftState?.pickupDate ?? null;
  const pickupDateRef = useRef(pickupDate);
  useLayoutEffect(() => {
    pickupDateRef.current = pickupDate;
  }, [pickupDate]);
  const addingRef = useRef(false);
  const { cakes: pricedCakes, ready: pickupPricesReady } =
    usePickupDatePricedCakes([cake], pickupDate);
  const pricedCake = pricedCakes[0] ?? cake;
  const initialSelectedId = initialSizeId || cake.sizes[0]?.id || "";
  const [requestedSizeId, setSizeId] = useState(initialSelectedId);
  const sizeId = validCakeSizeSelection(
    pricedCake.sizes,
    requestedSizeId,
    pickupDate,
  );
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  // Clear invalid selection before rendering the changed date, without picking a replacement.
  if (requestedSizeId && !sizeId) setSizeId("");
  const [quantity, setQuantity] = useState(() => {
    const existing = draftLineQuantity(
      readPreorderDraft(),
      cake.id,
      initialSelectedId,
    );
    return existing > 0 ? existing : 1;
  });
  const [adding, setAdding] = useState(false);

  const selected = pricedCake.sizes.find((size) => size.id === sizeId);
  const photo = storefrontPhotoForSize(pricedCake.photos, sizeId);
  const existingQuantity = selected
    ? draftLineQuantity(readPreorderDraft(), pricedCake.id, selected.id)
    : 0;
  const editingExisting = existingQuantity > 0;

  function selectSize(nextSizeId: string) {
    setSizeId(nextSizeId);
    const existing = draftLineQuantity(
      readPreorderDraft(),
      pricedCake.id,
      nextSizeId,
    );
    setQuantity(existing > 0 ? existing : 1);
  }

  async function addToOrder() {
    if (!selected || !pickupPricesReady || addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    setAvailabilityError(null);
    const checkedDate = pickupDate || null;
    const draftSnapshot = JSON.stringify(readPreorderDraft());
    const result = await validateCartSizeAvailability(
      [{ cakeId: pricedCake.id, sizeId: selected.id }],
      checkedDate,
    ).catch(() => ({
      error: "Unable to check cake size availability. Please try again.",
    }));
    const currentDate = pickupDateRef.current || null;
    if (
      result.error ||
      checkedDate !== currentDate ||
      draftSnapshot !== JSON.stringify(readPreorderDraft())
    ) {
      setAvailabilityError(
        result.error ?? "Pickup date changed. Please check the size again.",
      );
      addingRef.current = false;
      setAdding(false);
      return;
    }
    const draft = readPreorderDraft() ?? emptyPreorderDraft();
    const existing = draftLineQuantity(draft, pricedCake.id, selected.id);
    if (existing > 0) {
      const updated = setDraftLineQuantity(
        pricedCake.id,
        selected.id,
        quantity,
      );
      if (pickupDate) writePreorderDraft({ ...updated, pickupDate });
      onAdded("updated");
      return;
    }
    const next = mergeDraftItem(draft, {
      cakeId: pricedCake.id,
      sizeId: selected.id,
      quantity,
      cakeName: pricedCake.name,
      sizeLabel: selected.size,
      unitPrice: selected.price,
      preorderDays: selected.preorderDays,
      availableFrom: selected.availableFrom ?? null,
      availableUntil: selected.availableUntil ?? null,
      imageUrl: photo?.url ?? pricedCake.image ?? undefined,
      sizeChoices: pricedCake.sizes.map((size) => ({
        id: size.id,
        size: size.size,
        price: size.price,
        preorderDays: size.preorderDays,
        availableFrom: size.availableFrom ?? null,
        availableUntil: size.availableUntil ?? null,
        imageUrl:
          storefrontPhotoForSize(pricedCake.photos, size.id)?.url ??
          pricedCake.image ??
          undefined,
      })),
    });
    const from = pickupScope?.from?.trim().slice(0, 10) ?? "";
    const to = pickupScope?.to?.trim().slice(0, 10) ?? "";
    if (isYmd(from) && isYmd(to)) {
      next.pickupScopeFrom = from;
      next.pickupScopeTo = to;
      next.pickupScopeConstrainsBounds = !isFullMonthPickupScope(from, to);
    }
    if (pickupDate) next.pickupDate = pickupDate;
    writePreorderDraft(next);
    onAdded("added");
  }

  if (!open) return null;

  return (
    <StorefrontOverlay
      labelledBy={titleId}
      panelClassName="border-fog bg-mist text-ink flex max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden rounded-t-lg border md:max-h-[calc(100dvh-5rem)] md:max-w-md md:rounded-lg"
    >
      <form
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:pt-5 md:pb-6"
        onSubmit={(event) => {
          event.preventDefault();
          addToOrder();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-signal text-[11px] font-medium tracking-[0.22em] uppercase">
              {editingExisting ? "Already in your order" : "Add to Order"}
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
            className="text-skyline hover:text-ink inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center text-sm font-medium"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="bg-fog aspect-[4/3] overflow-hidden rounded-[10px]">
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

        {cake.sizes.some(
          (size) => size.availableFrom || size.availableUntil,
        ) ? (
          <PickupSlotFields
            dateId={`${titleId}-pickup-date`}
            defaultDate={pickupDate ?? ""}
            includeFieldNames={false}
            showTime={false}
            required={false}
            minDate={pickupScope?.from}
            maxDate={pickupScope?.to}
            onDateChange={(date) => {
              setChosenPickupDate(date);
              setAvailabilityError(null);
            }}
          />
        ) : null}
        {pricedCake.sizes.length === 0 ? (
          <p className="text-skyline text-sm">This cake has no sizes yet.</p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="text-ink text-sm font-medium">Size</legend>
            <ul className="grid gap-2">
              {pricedCake.sizes.map((size) => {
                const selectedSize = size.id === sizeId;
                const availability = cakeSizeAvailability(size, pickupDate);
                return (
                  <li key={size.id}>
                    <label
                      className={
                        !availability.available
                          ? "border-fog flex cursor-not-allowed items-center justify-between gap-3 border px-4 py-3 opacity-60"
                          : selectedSize
                            ? "border-ink bg-mist flex cursor-pointer items-center justify-between gap-3 border px-4 py-3"
                            : "border-fog hover:border-ink flex cursor-pointer items-center justify-between gap-3 border bg-transparent px-4 py-3"
                      }
                    >
                      <span className="min-w-0">
                        <input
                          checked={selectedSize}
                          disabled={!availability.available || adding}
                          className="sr-only"
                          name="add-to-order-size"
                          onChange={() => selectSize(size.id)}
                          type="radio"
                          value={size.id}
                        />
                        <span className="text-ink block text-sm font-medium">
                          {size.size}
                        </span>
                        <span className="text-skyline mt-0.5 block text-sm">
                          {formatPreorderRequirement(size.preorderDays)}
                          {availability.message ? (
                            <span className="mt-1 block">
                              {availability.message}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="text-ink shrink-0 text-sm font-semibold tabular-nums">
                        {pickupPricesReady ? formatRm(size.price) : "Checking…"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}

        {editingExisting ? (
          <p className="text-ink text-sm" role="status">
            {existingQuantity} × {selected?.size} already in your order
          </p>
        ) : null}
        {!pickupPricesReady ? (
          <p className="text-skyline text-sm" role="status">
            Checking price for your pickup date…
          </p>
        ) : null}

        {availabilityError ? (
          <p className="text-status-danger text-sm" role="alert">
            {availabilityError}
          </p>
        ) : null}
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
              className="text-ink inline-flex min-h-11 min-w-11 items-center justify-center text-lg disabled:opacity-40"
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
              className="text-ink inline-flex min-h-11 min-w-11 items-center justify-center text-lg"
              onClick={() => setQuantity((value) => Math.min(99, value + 1))}
              type="button"
            >
              +
            </button>
          </div>
        </div>

        <button
          aria-busy={adding}
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-md px-5 text-sm font-medium transition duration-200 disabled:opacity-50"
          disabled={!selected || !pickupPricesReady || adding}
          type="submit"
        >
          {adding
            ? editingExisting
              ? "Updated ✓"
              : "Added ✓"
            : editingExisting
              ? "Update Order"
              : "Add"}
        </button>
        {editingExisting ? (
          <button
            className="text-ink hover:text-skyline inline-flex min-h-11 w-full cursor-pointer items-center justify-center text-sm font-medium"
            onClick={() => {
              onClose();
              openStorefrontOrder();
            }}
            type="button"
          >
            View Order
          </button>
        ) : null}
      </form>
    </StorefrontOverlay>
  );
}

const defaultAddToOrderButtonClassName =
  "bg-ink text-mist hover:bg-skyline active:opacity-80 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md px-4 text-sm font-medium transition duration-200 disabled:opacity-50";

type AddToOrderButtonProps = {
  cake: StorefrontCake;
  pickupScope?: AddToOrderPickupScope | null;
  initialSizeId?: string;
  className?: string;
  buttonClassName?: string;
  existingQuantity?: number;
  existingSizeLabel?: string;
};

export function AddToOrderButton({
  cake,
  pickupScope = null,
  initialSizeId,
  className = "",
  buttonClassName = defaultAddToOrderButtonClassName,
  existingQuantity = 0,
  existingSizeLabel,
}: AddToOrderButtonProps) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [addedResult, setAddedResult] = useState<"added" | "updated">("added");

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 2200);
    return () => window.clearTimeout(timer);
  }, [added]);

  const showExisting = existingQuantity > 0;

  return (
    <div className={className}>
      {showExisting ? (
        <div className="flex flex-col gap-2">
          <p className="text-ink text-center text-sm font-medium" role="status">
            {existingQuantity} × {existingSizeLabel ?? "this size"} already in
            your order
          </p>
          <button
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-md px-5 text-sm font-medium transition duration-200"
            onClick={() => openStorefrontOrder()}
            type="button"
          >
            View / Edit Order
          </button>
          <button
            className="text-ink hover:text-skyline inline-flex min-h-11 w-full cursor-pointer items-center justify-center text-sm font-medium"
            onClick={() => setOpen(true)}
            type="button"
          >
            + Add Another
          </button>
        </div>
      ) : (
        <button
          className={buttonClassName}
          disabled={cake.sizes.length === 0}
          onClick={() => setOpen(true)}
          type="button"
        >
          Add to Order
        </button>
      )}
      {added ? (
        <p
          className="text-ink mt-2 text-center text-sm font-medium"
          role="status"
        >
          {addedResult === "updated" ? "Order updated" : "Added to your order"}
        </p>
      ) : null}
      <AddToOrderSheet
        cake={cake}
        initialSizeId={initialSizeId}
        key={open ? `open:${cake.id}:${initialSizeId ?? ""}` : "closed"}
        onAdded={(result) => {
          setOpen(false);
          setAddedResult(result);
          setAdded(true);
        }}
        onClose={() => setOpen(false)}
        open={open}
        pickupScope={pickupScope}
      />
    </div>
  );
}
