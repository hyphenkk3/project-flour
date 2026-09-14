"use client";

import { useLayoutEffect } from "react";
import {
  collectionCakeAnchorSelector,
  getStoredListingBrowseRestore,
  writeWindowScrollY,
  type CakeEntryOriginKind,
} from "@/workspaces/storefront/catalog/cake-entry-scope";

type StorefrontListingRestoreProps = {
  origin: CakeEntryOriginKind;
  collectionId?: string;
};

function cakeCardIsInView(card: HTMLElement): boolean {
  const rect = card.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

function listingCakeCards(cakeId: string): HTMLElement[] {
  return Array.from(
    document.querySelectorAll(collectionCakeAnchorSelector(cakeId)),
  ).filter((node): node is HTMLElement => node instanceof HTMLElement);
}

function cardDocumentY(card: HTMLElement): number {
  return card.getBoundingClientRect().top + window.scrollY;
}

function chooseListingRestoreCard(
  cards: readonly HTMLElement[],
  scrollY: number | null,
): HTMLElement | null {
  if (cards.length === 0) return null;
  if (cards.some(cakeCardIsInView)) return null;
  if (scrollY == null || cards.length === 1) return cards[0] ?? null;
  const targetY = scrollY + window.innerHeight / 2;
  let best = cards[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const card of cards) {
    const dist = Math.abs(cardDocumentY(card) - targetY);
    if (dist < bestDist) {
      best = card;
      bestDist = dist;
    }
  }
  return best;
}

function restoreListingBrowse(input: {
  origin: CakeEntryOriginKind;
  collectionId?: string;
}): void {
  const restore = getStoredListingBrowseRestore(input);
  if (!restore) return;
  if (restore.scrollY != null) {
    writeWindowScrollY(restore.scrollY);
  }
  const card = chooseListingRestoreCard(
    listingCakeCards(restore.cakeId),
    restore.scrollY,
  );
  if (!card) return;
  card.scrollIntoView({ block: "center", behavior: "auto" });
}

export function StorefrontListingRestore({
  origin,
  collectionId,
}: StorefrontListingRestoreProps) {
  useLayoutEffect(() => {
    restoreListingBrowse({ origin, collectionId });
    const frame = window.requestAnimationFrame(() => {
      restoreListingBrowse({ origin, collectionId });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [origin, collectionId]);
  return null;
}
