"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { FRESH_PICKS_ADDED_TO_CART_CTA } from "@/engines/extra/customer-fresh-picks";
import { freshPickCartHasExtra } from "@/workspaces/storefront/extra/fresh-pick-cart";
import { useFreshPickCart } from "@/workspaces/storefront/extra/useFreshPickCart";

const CATALOGUE_CTA_CLASS =
  "bg-ink text-mist hover:bg-skyline mt-6 inline-flex min-h-11 w-fit items-center justify-center rounded-md px-5 text-sm font-medium transition duration-200";

type FreshPickCatalogueAddCtaProps = {
  extraStockId: string;
  href: string;
  children: ReactNode;
};

export function FreshPickCatalogueAddCta({
  extraStockId,
  href,
  children,
}: FreshPickCatalogueAddCtaProps) {
  const cart = useFreshPickCart();
  const inCart = freshPickCartHasExtra(cart, extraStockId);

  return (
    <Link className={CATALOGUE_CTA_CLASS} href={href}>
      {inCart ? FRESH_PICKS_ADDED_TO_CART_CTA : children}
    </Link>
  );
}
