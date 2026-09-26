"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type PointerEvent, type ReactNode } from "react";
import {
  markStorefrontNavIntent,
  markStorefrontPrefetchComplete,
} from "@/lib/perf/storefront-nav-client";
import {
  canonicalCakeDetailPath,
  prefetchCanonicalCakeDetail,
} from "@/workspaces/storefront/catalog/cake-detail-prefetch";
import { preloadStorefrontCakeHero } from "@/workspaces/storefront/catalog/cake-hero-preload";

const HOVER_PREFETCH_MS = 120;

/** Touch-visible press; not hover-only. */
export const STOREFRONT_PRESS_CLASS = "active:opacity-70";

type StorefrontCakeDetailLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  imageSrc?: string | null;
};

export function StorefrontCakeDetailLink({
  href,
  children,
  className,
  "aria-label": ariaLabel,
  imageSrc,
}: StorefrontCakeDetailLinkProps) {
  const router = useRouter();
  const canonical = canonicalCakeDetailPath(href);
  const hoverTimer = useRef<number>(0);

  function startPrefetch() {
    if (!canonical) return;
    preloadStorefrontCakeHero(imageSrc);
    prefetchCanonicalCakeDetail(
      href,
      (path) => {
        const result = router.prefetch(path);
        void Promise.resolve(result).then(() => {
          markStorefrontPrefetchComplete(canonical);
        });
        return result;
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
    if (canonical) markStorefrontNavIntent(canonical, "cake");
    startPrefetch();
  }

  function onFocus() {
    if (canonical) markStorefrontNavIntent(canonical, "cake");
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
