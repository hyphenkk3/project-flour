"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  CAKE_ENTRY_SCOPE_MARKER,
  cakeIdFromHref,
  clearStoredCakeEntryScope,
  readWindowScrollY,
  writeStoredCakeEntryScope,
  type CakeEntryCaptureScope,
} from "@/workspaces/storefront/catalog/cake-entry-scope";

type CakeEntryScopeCaptureProps = {
  children: ReactNode;
  scopes: Readonly<Record<string, CakeEntryCaptureScope>>;
};

function hrefFromAnchor(anchor: Element): string | null {
  const href = anchor.getAttribute("href");
  return href?.trim() ? href : null;
}

function persistScopeFromEvent(
  event: Event,
  scopes: Readonly<Record<string, CakeEntryCaptureScope>>,
): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a");
  if (!anchor) return;
  const href = hrefFromAnchor(anchor);
  if (!href) return;
  const cakeId = cakeIdFromHref(href);
  if (!cakeId) return;
  const scope = scopes[cakeId];
  if (!scope) return;
  writeStoredCakeEntryScope({
    cakeId,
    from: scope.from,
    to: scope.to,
    pickup: scope.pickup,
    origin: scope.origin,
    collectionId: scope.collectionId,
    collectionName: scope.collectionName,
    scrollY: scope.origin === "collection" ? readWindowScrollY() : null,
  });
}

export function CakeEntryScopeCapture({
  children,
  scopes,
}: CakeEntryScopeCaptureProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scopesRef = useRef(scopes);

  useEffect(() => {
    scopesRef.current = scopes;
  }, [scopes]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    function onClick(event: Event) {
      persistScopeFromEvent(event, scopesRef.current);
    }
    node.addEventListener("pointerdown", onClick, true);
    node.addEventListener("click", onClick, true);
    return () => {
      node.removeEventListener("pointerdown", onClick, true);
      node.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <div ref={rootRef} data-cake-entry-scope="">
      {children}
    </div>
  );
}

/** Drops leftover collection/browse scope when a non-captured cake link is used. */
export function CakeEntryScopeClearOnUnscopedCakeClick() {
  useEffect(() => {
    function onClick(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = hrefFromAnchor(anchor);
      if (!href || !cakeIdFromHref(href)) return;
      if (anchor.closest(`[${CAKE_ENTRY_SCOPE_MARKER}]`)) return;
      clearStoredCakeEntryScope();
    }
    document.addEventListener("pointerdown", onClick, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onClick, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
