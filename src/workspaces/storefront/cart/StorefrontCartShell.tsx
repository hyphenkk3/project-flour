"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import type { StorefrontCake } from "@/types/storefront";
import { loadCartEditCakes } from "@/workspaces/storefront/cart/actions";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  cartInvalidCollectionDateCopy,
  continueOrderingHref,
  draftEarliestCollectionYmd,
  draftItemShowsSizeEditor,
  draftItemSizeChoices,
  draftLinePreorderLabel,
  draftStrongestPreorder,
  evaluateDraftSelectedCollectionDate,
  formatCartCollectionDate,
  isDraftCheckoutBlockedByCollectionDate,
} from "@/workspaces/storefront/cart/cart-order-summary";
import { usePreorderDraft } from "@/workspaces/storefront/cart/usePreorderDraft";
import {
  draftCakeCount,
  draftHasItems,
  draftTotal,
  preorderCheckoutHref,
  removeDraftLine,
  setDraftLineQuantity,
  setDraftLineSize,
  type PreorderDraft,
  type PreorderDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";

const DESKTOP_ORDER_RAIL_WIDTH = "20.5rem";

function OrderLines({
  cakesById,
  items,
}: {
  cakesById: Map<string, StorefrontCake>;
  items: readonly PreorderDraftItem[];
}) {
  return (
    <ul className="divide-fog divide-y">
      {items.map((item) => {
        const cake = cakesById.get(item.cakeId) ?? null;
        const preorder = draftLinePreorderLabel(item);
        const sizeChoices = draftItemSizeChoices(item, cake);
        const showSizeEditor = draftItemShowsSizeEditor(item, cake);
        const sizeSelectId = `cart-size-${item.cakeId}-${item.sizeId}`;
        return (
          <li className="py-5" key={`${item.cakeId}::${item.sizeId}`}>
            <div className="flex items-start gap-3">
              {item.imageUrl ? (
                <div className="bg-fog relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                  <CakePhotoImage
                    alt=""
                    sizes="56px"
                    src={item.imageUrl}
                  />
                </div>
              ) : (
                <div
                  aria-hidden
                  className="bg-fog h-14 w-14 shrink-0 rounded-lg"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ink font-medium">{item.cakeName}</p>
                    {showSizeEditor ? (
                      <>
                        <label className="sr-only" htmlFor={sizeSelectId}>
                          {item.cakeName} size
                        </label>
                        <select
                          className="border-fog text-ink mt-1 w-full max-w-[11rem] rounded-lg border bg-white px-2 py-1.5 text-sm"
                          id={sizeSelectId}
                          onChange={(event) => {
                            const next = sizeChoices.find(
                              (choice) => choice.id === event.target.value,
                            );
                            if (!next) return;
                            setDraftLineSize(item.cakeId, item.sizeId, next);
                          }}
                          value={item.sizeId}
                        >
                          {sizeChoices.map((choice) => (
                            <option key={choice.id} value={choice.id}>
                              {choice.size} · {formatRm(choice.price)}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <p className="text-skyline mt-0.5 text-sm">
                        {item.sizeLabel}
                      </p>
                    )}
                    {preorder ? (
                      <p className="text-ink mt-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
                        {preorder}
                      </p>
                    ) : null}
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
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function OrderSummary({
  checkoutBlocked,
  continueHref,
  draft,
  invalidCopy,
  onContinue,
  onKeepEditing,
  showDatePrompt,
}: {
  checkoutBlocked: boolean;
  continueHref: string;
  draft: PreorderDraft;
  invalidCopy: {
    title: string;
    explanation: string;
    earliestLabel: string | null;
  } | null;
  onContinue?: () => void;
  onKeepEditing: () => void;
  showDatePrompt: boolean;
}) {
  const selectedDate = formatCartCollectionDate(draft.pickupDate);
  const earliestDate = formatCartCollectionDate(
    draftEarliestCollectionYmd(draft.items),
  );
  const strongest = draftStrongestPreorder(draft.items);
  const total = draftTotal(draft);
  const checkoutHref = preorderCheckoutHref(draft);

  return (
    <div className="space-y-5">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-skyline text-[11px] font-semibold tracking-[0.14em] uppercase">
            Collection date
          </dt>
          <dd className="text-ink mt-1 font-medium">
            {selectedDate ?? "Not selected yet"}
          </dd>
        </div>
        <div>
          <dt className="text-skyline text-[11px] font-semibold tracking-[0.14em] uppercase">
            Earliest collection
          </dt>
          <dd className="text-ink mt-1 font-medium">
            {earliestDate ?? "—"}
          </dd>
        </div>
        {strongest.label ? (
          <div>
            <dt className="text-skyline text-[11px] font-semibold tracking-[0.14em] uppercase">
              Preorder
            </dt>
            <dd
              className={[
                "mt-1 text-[11px] font-semibold tracking-[0.14em] uppercase",
                strongest.tone === "longer" ? "text-ink" : "text-skyline",
              ].join(" ")}
            >
              {strongest.label}
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 pt-1">
          <dt className="text-ink text-sm">Total</dt>
          <dd className="text-ink font-display text-xl tracking-tight tabular-nums">
            {formatRm(total)}
          </dd>
        </div>
      </dl>
      {invalidCopy && showDatePrompt ? (
        <div className="space-y-3">
          <p className="font-display text-ink text-xl tracking-tight">
            {invalidCopy.title}
          </p>
          <p className="text-ink text-sm leading-relaxed">
            {invalidCopy.explanation}
          </p>
          {invalidCopy.earliestLabel ? (
            <p className="text-skyline text-sm">
              Earliest collection: {invalidCopy.earliestLabel}
            </p>
          ) : null}
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-medium"
            href={checkoutHref}
            onClick={onContinue}
          >
            Change Collection Date
          </Link>
          <button
            className="text-ink hover:text-skyline inline-flex min-h-11 w-full items-center justify-center text-sm font-medium"
            onClick={onKeepEditing}
            type="button"
          >
            Keep Editing
          </button>
        </div>
      ) : (
        <>
          {invalidCopy ? (
            <p className="text-ink text-sm leading-relaxed">
              {invalidCopy.explanation}
            </p>
          ) : null}
          {checkoutBlocked ? (
            <button
              className="bg-ink text-mist inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-medium opacity-40"
              disabled
              type="button"
            >
              View My Order
            </button>
          ) : (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-medium"
              href={checkoutHref}
              onClick={onContinue}
            >
              View My Order
            </Link>
          )}
          <Link
            className="text-ink hover:text-skyline inline-flex min-h-11 w-full items-center justify-center text-sm font-medium"
            href={continueHref}
            onClick={onContinue}
          >
            Continue Ordering
          </Link>
        </>
      )}
    </div>
  );
}

export function StorefrontCartShell() {
  const draft = usePreorderDraft();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [datePromptDismissed, setDatePromptDismissed] = useState(false);
  const [editCakes, setEditCakes] = useState<StorefrontCake[]>([]);
  const wasDateValidRef = useRef(true);
  const titleId = useId();
  const hasItems = draftHasItems(draft);
  const count = draftCakeCount(draft);
  const total = draftTotal(draft);
  const itemLabel = count === 1 ? "1 item" : `${count} items`;
  const continueHref = continueOrderingHref(pathname);
  const cakeIdsKey = (draft?.items ?? []).map((item) => item.cakeId).join(",");
  const cakesById = useMemo(
    () => new Map(editCakes.map((cake) => [cake.id, cake])),
    [editCakes],
  );
  const dateEvaluation = draft
    ? evaluateDraftSelectedCollectionDate(draft)
    : null;
  const checkoutBlocked = draft
    ? isDraftCheckoutBlockedByCollectionDate(draft)
    : false;
  const invalidCopy =
    draft && dateEvaluation && !dateEvaluation.valid
      ? cartInvalidCollectionDateCopy(draft, dateEvaluation)
      : null;
  const showDatePrompt = Boolean(invalidCopy) && !datePromptDismissed;

  useEffect(() => {
    if (!cakeIdsKey) {
      setEditCakes([]);
      return;
    }
    const ids = cakeIdsKey.split(",").filter(Boolean);
    let cancelled = false;
    void loadCartEditCakes(ids).then((cakes) => {
      if (!cancelled) setEditCakes(cakes);
    });
    return () => {
      cancelled = true;
    };
  }, [cakeIdsKey]);

  useEffect(() => {
    const invalid = Boolean(dateEvaluation && !dateEvaluation.valid);
    if (invalid && wasDateValidRef.current) {
      setDatePromptDismissed(false);
    }
    wasDateValidRef.current = !invalid;
  }, [dateEvaluation]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    function syncDesktop() {
      if (media.matches) setOpen(false);
      // Margin, not padding: Safari treats body padding as the containing
      // block for position:fixed, which inset the rail from the viewport.
      document.body.style.marginRight =
        hasItems && media.matches ? DESKTOP_ORDER_RAIL_WIDTH : "";
    }
    syncDesktop();
    media.addEventListener("change", syncDesktop);
    return () => {
      document.body.style.marginRight = "";
      media.removeEventListener("change", syncDesktop);
    };
  }, [hasItems]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!hasItems || !draft) {
    return null;
  }

  return (
    <>
      <div aria-hidden className="h-16 md:hidden" />

      <button
        aria-label={`${itemLabel}, ${formatRm(total)}. View order.`}
        className="border-fog bg-ink text-mist fixed right-0 bottom-0 left-0 z-40 flex min-h-14 items-center justify-between gap-3 border-t px-4 text-sm md:hidden"
        onClick={() => setOpen(true)}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        type="button"
      >
        <span className="font-medium">
          🛒 {itemLabel} · {formatRm(total)}
        </span>
        <span className="font-medium">View Order →</span>
      </button>

      {createPortal(
        <>
          {open ? (
            <div className="md:hidden">
              <div
                aria-hidden
                className="bg-ink/40 fixed inset-0 z-50"
                onClick={() => setOpen(false)}
              />
              <div
                aria-labelledby={titleId}
                aria-modal="true"
                className="bg-mist text-ink fixed inset-0 z-[60] flex h-dvh flex-col"
                role="dialog"
              >
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3 px-5 pt-5">
                    <div>
                      <h2
                        className="font-display text-ink text-3xl tracking-tight"
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
                  <div className="min-h-0 flex-1 overflow-y-auto px-5">
                    <OrderLines cakesById={cakesById} items={draft.items} />
                  </div>
                  <div className="border-fog border-t px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                    <OrderSummary
                      checkoutBlocked={checkoutBlocked}
                      continueHref={continueHref}
                      draft={draft}
                      invalidCopy={invalidCopy}
                      onContinue={() => setOpen(false)}
                      onKeepEditing={() => setDatePromptDismissed(true)}
                      showDatePrompt={showDatePrompt}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        <aside
          aria-labelledby={`${titleId}-desktop`}
          className="border-fog bg-mist hidden md:fixed md:inset-y-0 md:right-0 md:left-auto md:z-30 md:flex md:w-[20.5rem] md:flex-col md:border-l"
          role="complementary"
        >
          <div className="px-6 pt-8">
            <p className="text-signal text-[11px] font-semibold tracking-[0.18em] uppercase">
              Whitebird
            </p>
            <h2
              className="font-display text-ink mt-2 text-3xl tracking-tight"
              id={`${titleId}-desktop`}
            >
              Your Order
            </h2>
            <p className="text-skyline mt-1 text-sm">{itemLabel}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6">
            <OrderLines cakesById={cakesById} items={draft.items} />
          </div>
          <div className="px-6 pt-4 pb-8">
            <OrderSummary
              checkoutBlocked={checkoutBlocked}
              continueHref={continueHref}
              draft={draft}
              invalidCopy={invalidCopy}
              onKeepEditing={() => setDatePromptDismissed(true)}
              showDatePrompt={showDatePrompt}
            />
          </div>
        </aside>
        </>,
        document.body,
      )}
    </>
  );
}
