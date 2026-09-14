"use client";

import Link from "next/link";
import { useRef, type PointerEvent, type ReactNode } from "react";
import { canonicalCakeDetailPath } from "@/workspaces/storefront/catalog/cake-detail-prefetch";

const HOVER_PREFETCH_MS = 120;

type StorefrontCakeDetailLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  /** Shared card intent so every cake link uses Full prefetch like Popular. */
  intent: boolean;
  onIntent: () => void;
};

export function StorefrontCakeDetailLink({
  href,
  children,
  className,
  "aria-label": ariaLabel,
  intent,
  onIntent,
}: StorefrontCakeDetailLinkProps) {
  const canonical = canonicalCakeDetailPath(href);
  const hoverTimer = useRef<number>(0);

  function markIntent() {
    if (!canonical || intent) return;
    onIntent();
  }

  function onPointerEnter(event: PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(markIntent, HOVER_PREFETCH_MS);
  }

  function onPointerLeave() {
    window.clearTimeout(hoverTimer.current);
  }

  function onPointerDown() {
    window.clearTimeout(hoverTimer.current);
    markIntent();
  }

  function onFocus() {
    markIntent();
  }

  return (
    <Link
      aria-label={ariaLabel}
      className={className}
      href={href}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      prefetch={intent && canonical ? true : false}
    >
      {children}
    </Link>
  );
}
