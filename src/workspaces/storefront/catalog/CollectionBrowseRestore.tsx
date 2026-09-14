"use client";

import { useLayoutEffect } from "react";
import {
  collectionCakeAnchorSelector,
  getStoredCollectionBrowseRestore,
  writeWindowScrollY,
} from "@/workspaces/storefront/catalog/cake-entry-scope";

type CollectionBrowseRestoreProps = {
  collectionId: string;
};

function cakeCardIsInView(card: HTMLElement): boolean {
  const rect = card.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

function restoreCollectionBrowse(collectionId: string): void {
  const restore = getStoredCollectionBrowseRestore(collectionId);
  if (!restore) return;
  if (restore.scrollY != null) {
    writeWindowScrollY(restore.scrollY);
  }
  const card = document.querySelector(collectionCakeAnchorSelector(restore.cakeId));
  if (!(card instanceof HTMLElement)) return;
  if (!cakeCardIsInView(card)) {
    card.scrollIntoView({ block: "center", behavior: "auto" });
  }
}

export function CollectionBrowseRestore({
  collectionId,
}: CollectionBrowseRestoreProps) {
  useLayoutEffect(() => {
    restoreCollectionBrowse(collectionId);
    const frame = window.requestAnimationFrame(() => {
      restoreCollectionBrowse(collectionId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [collectionId]);
  return null;
}
