"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  FRESH_PICKS_ADD_ANOTHER_CTA,
  FRESH_PICKS_ADDED_TO_CART_CTA,
} from "@/engines/extra/customer-fresh-picks";
import { freshPickCatalogueCtaState } from "@/workspaces/storefront/extra/fresh-pick-cart";
import { useFreshPickCart } from "@/workspaces/storefront/extra/useFreshPickCart";

const CATALOGUE_CTA_CLASS =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 w-fit items-center justify-center rounded-md px-5 text-sm font-medium transition duration-200";

const ADD_ANOTHER_CLASS =
  "text-ink hover:text-skyline inline-flex min-h-11 items-center text-sm font-medium";

type FreshPickCatalogueAddCtaProps = {
  extraStockIds: readonly string[];
  href: string;
  children: ReactNode;
};

export function FreshPickCatalogueAddCta({
  extraStockIds,
  href,
  children,
}: FreshPickCatalogueAddCtaProps) {
  const cart = useFreshPickCart();
  const cta = freshPickCatalogueCtaState(extraStockIds, cart);
  const primaryHref = cta.extraStockId ? `/extra/${cta.extraStockId}` : href;

  return (
    <div className="mt-6 flex flex-col items-start gap-1">
      <Link className={CATALOGUE_CTA_CLASS} href={primaryHref}>
        {cta.addedToCart ? FRESH_PICKS_ADDED_TO_CART_CTA : children}
      </Link>
      {cta.addAnotherStockId ? (
        <Link className={ADD_ANOTHER_CLASS} href={`/extra/${cta.addAnotherStockId}`}>
          {FRESH_PICKS_ADD_ANOTHER_CTA}
        </Link>
      ) : null}
    </div>
  );
}
