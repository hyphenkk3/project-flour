"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type PointerEvent, type ReactNode } from "react";
import {
  canonicalCakeDetailPath,
  prefetchCanonicalCakeDetail,
} from "@/workspaces/storefront/catalog/cake-detail-prefetch";

const HOVER_PREFETCH_MS = 120;

/** Touch-visible press; not hover-only. */
export const STOREFRONT_PRESS_CLASS = "active:opacity-70";

type StorefrontCakeDetailLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

export function StorefrontCakeDetailLink({
  href,
  children,
  className,
  "aria-label": ariaLabel,
}: StorefrontCakeDetailLinkProps) {
  const router = useRouter();
  const canonical = canonicalCakeDetailPath(href);
  const hoverTimer = useRef<number>(0);

  function startPrefetch() {
    if (!canonical) return;
    prefetchCanonicalCakeDetail(
      href,
      (path) => {
        void router.prefetch(path);
      },
      { urgent: true },
    );
  }

  function onPointerEnter(event: PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(startPrefetch, HOVER_PREFETCH_MS);
  }

  function onPointerLeave() {
    window.clearTimeout(hoverTimer.current);
  }

  function onPointerDown() {
    window.clearTimeout(hoverTimer.current);
    startPrefetch();
  }

  function onFocus() {
    startPrefetch();
  }

  return (
    <Link
      aria-label={ariaLabel}
      className={[className, STOREFRONT_PRESS_CLASS].filter(Boolean).join(" ")}
      href={href}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      prefetch={false}
    >
      {children}
    </Link>
  );
}
