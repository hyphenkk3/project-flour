"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { FRESH_PICKS_ADDED_TO_CART_CTA } from "@/engines/extra/customer-fresh-picks";
import { freshPickCatalogueCtaState } from "@/workspaces/storefront/extra/fresh-pick-cart";
import { useFreshPickCart } from "@/workspaces/storefront/extra/useFreshPickCart";

const CATALOGUE_CTA_CLASS =
  "bg-ink text-mist hover:bg-skyline mt-6 inline-flex min-h-11 w-fit items-center justify-center rounded-md px-5 text-sm font-medium transition duration-200";

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
  const targetHref = cta.extraStockId ? `/extra/${cta.extraStockId}` : href;

  return (
    <Link className={CATALOGUE_CTA_CLASS} href={targetHref}>
      {cta.addedToCart ? FRESH_PICKS_ADDED_TO_CART_CTA : children}
    </Link>
  );
}
