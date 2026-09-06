"use client";

import Link from "next/link";
import { openStorefrontOrder } from "@/workspaces/storefront/cart/open-order";
import {
  continueOrderingHref,
  draftEarliestCollectionYmd,
  draftLinePreorderLabel,
  formatCartCollectionDate,
} from "@/workspaces/storefront/cart/cart-order-summary";
import { usePreorderDraft } from "@/workspaces/storefront/cart/usePreorderDraft";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  draftHasItems,
  draftTotal,
} from "@/workspaces/storefront/checkout/preorder-draft";

export function HomeOrderSummary() {
  const draft = usePreorderDraft();
  if (!draftHasItems(draft) || !draft) return null;

  const earliest = formatCartCollectionDate(
    draftEarliestCollectionYmd(draft.items),
  );
  const continueHref = continueOrderingHref("/");
  const total = draftTotal(draft);

  return (
    <aside
      aria-label="Your order"
      className="border-ink/10 bg-paper/70 hidden w-[12.75rem] rounded-lg border p-4 shadow-[0_6px_28px_rgba(28,25,22,0.06)] md:block lg:w-[14rem] xl:w-[15rem]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-ink text-lg tracking-tight">
          Your Order
        </h2>
        <button
          className="text-skyline hover:text-ink text-sm font-medium"
          onClick={() => openStorefrontOrder()}
          type="button"
        >
          Edit
        </button>
      </div>
      <ul className="mt-3 space-y-2.5">
        {draft.items.map((item) => {
          const preorder = draftLinePreorderLabel(item);
          return (
            <li
              className="flex items-start justify-between gap-3"
              key={`${item.cakeId}::${item.sizeId}`}
            >
              <div className="min-w-0">
                <p className="text-ink text-sm leading-snug">
                  {item.cakeName} {item.sizeLabel}
                </p>
                {preorder ? (
                  <p className="text-skyline mt-0.5 text-xs">{preorder}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-skyline text-xs tabular-nums">
                  ×{item.quantity}
                </p>
                <p className="text-ink mt-0.5 text-sm tabular-nums">
                  {formatRm(item.unitPrice * item.quantity)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-ink/10 mt-3 flex items-baseline justify-between gap-3 border-t pt-2.5">
        <p className="text-skyline text-[11px] tracking-[0.12em] uppercase">
          Earliest collection
        </p>
        <p className="text-ink text-sm">{earliest ?? "—"}</p>
      </div>
      <p className="text-skyline mt-1 text-right text-sm tabular-nums">
        {formatRm(total)}
      </p>
      <Link
        className="text-ink hover:text-skyline mt-3 inline-flex min-h-11 w-full items-center justify-center text-sm font-medium"
        href={continueHref}
      >
        Continue Ordering →
      </Link>
    </aside>
  );
}
