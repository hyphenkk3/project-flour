"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  draftCakeCount,
  draftHasItems,
  draftTotal,
  preorderCheckoutHref,
  removeDraftLine,
  setDraftLineQuantity,
} from "@/workspaces/storefront/checkout/preorder-draft";
import { usePreorderDraft } from "@/workspaces/storefront/cart/usePreorderDraft";

export function StorefrontCartShell() {
  const draft = usePreorderDraft();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const hasItems = draftHasItems(draft);
  const count = draftCakeCount(draft);
  const total = draftTotal(draft);
  const checkoutHref = preorderCheckoutHref(draft);
  const itemLabel = count === 1 ? "1 item" : `${count} items`;

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  if (!hasItems || !draft) {
    return null;
  }

  const lines = (
    <ul className="divide-fog divide-y">
      {draft.items.map((item) => (
        <li className="py-4" key={`${item.cakeId}::${item.sizeId}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-ink font-medium">{item.cakeName}</p>
              <p className="text-skyline mt-0.5 text-sm">
                {item.sizeLabel} · {formatRm(item.unitPrice)}
              </p>
            </div>
            <button
              className="text-skyline hover:text-ink shrink-0 text-sm font-medium"
              onClick={() => removeDraftLine(item.cakeId, item.sizeId)}
              type="button"
            >
              Remove
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div
              aria-label={`${item.cakeName} quantity`}
              className="flex items-center gap-2"
              role="group"
            >
              <button
                aria-label={`Decrease ${item.cakeName} quantity`}
                className="border-fog text-ink inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border bg-white text-base disabled:opacity-40"
                disabled={item.quantity <= 1}
                onClick={() =>
                  setDraftLineQuantity(
                    item.cakeId,
                    item.sizeId,
                    item.quantity - 1,
                  )
                }
                type="button"
              >
                −
              </button>
              <span className="text-ink min-w-6 text-center text-sm tabular-nums">
                {item.quantity}
              </span>
              <button
                aria-label={`Increase ${item.cakeName} quantity`}
                className="border-fog text-ink inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border bg-white text-base"
                onClick={() =>
                  setDraftLineQuantity(
                    item.cakeId,
                    item.sizeId,
                    item.quantity + 1,
                  )
                }
                type="button"
              >
                +
              </button>
            </div>
            <p className="text-ink text-sm font-medium tabular-nums">
              {formatRm(item.unitPrice * item.quantity)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <div aria-hidden className="h-16 md:hidden" />

      <button
        className="border-fog bg-ink text-mist fixed right-0 bottom-0 left-0 z-40 flex min-h-14 items-center justify-between gap-3 border-t px-4 text-sm md:hidden"
        onClick={() => setOpen(true)}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        type="button"
      >
        <span className="font-medium">
          {itemLabel} · {formatRm(total)}
        </span>
        <span className="font-medium">View Order →</span>
      </button>

      <button
        className="border-fog bg-white text-ink hover:border-signal/40 fixed right-6 bottom-6 z-40 hidden min-h-12 items-center gap-3 rounded-full border px-5 text-sm shadow-sm md:inline-flex"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="font-medium">Your Order</span>
        <span className="text-skyline tabular-nums">
          {itemLabel} · {formatRm(total)}
        </span>
      </button>

      <dialog
        aria-labelledby={titleId}
        className="border-fog bg-mist text-ink w-full max-w-none rounded-t-2xl border p-0 shadow-lg backdrop:bg-ink/40 open:fixed open:inset-x-0 open:bottom-0 open:mt-auto open:mb-0 md:open:inset-y-0 md:open:right-0 md:open:left-auto md:open:mt-0 md:open:h-full md:open:w-[24rem] md:rounded-none md:rounded-l-2xl"
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        ref={dialogRef}
      >
        <div className="flex h-full max-h-[85dvh] flex-col md:max-h-none">
          <div className="flex items-start justify-between gap-3 px-5 pt-4 md:px-6 md:pt-6">
            <div>
              <h2
                className="font-display text-ink text-2xl tracking-tight"
                id={titleId}
              >
                Your Order
              </h2>
              <p className="text-skyline mt-1 text-sm">{itemLabel}</p>
            </div>
            <button
              aria-label="Close order"
              className="text-skyline hover:text-ink inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-medium"
              onClick={() => setOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 md:px-6">
            {lines}
          </div>
          <div className="border-fog border-t px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:pb-6">
            <div className="text-ink flex items-center justify-between text-sm">
              <span>Total</span>
              <span className="font-semibold tabular-nums">
                {formatRm(total)}
              </span>
            </div>
            <Link
              className="bg-ink text-mist hover:bg-skyline mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-medium"
              href={checkoutHref}
              onClick={() => setOpen(false)}
            >
              View Order
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
