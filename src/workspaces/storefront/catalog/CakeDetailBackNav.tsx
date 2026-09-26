"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, type MouseEvent } from "react";
import { markStorefrontNavIntent } from "@/lib/perf/storefront-nav-client";
import {
  getStoredCakeEntryScopeSnapshot,
  resolveCakeDetailBackNav,
  shouldRestoreCakeDetailBackFromHistory,
  subscribeCakeEntryScope,
} from "@/workspaces/storefront/catalog/cake-entry-scope";

const BACK_LINK_CLASS =
  "text-skyline hover:text-ink text-sm font-medium transition-colors duration-200";

function subscribeClientReady() {
  return () => {};
}

type CakeDetailBackNavLinkProps = {
  cakeId: string;
};

export function CakeDetailBackNav({ cakeId }: CakeDetailBackNavLinkProps) {
  const router = useRouter();
  const ready = useSyncExternalStore(
    subscribeClientReady,
    () => true,
    () => false,
  );
  const stored = useSyncExternalStore(
    subscribeCakeEntryScope,
    () => getStoredCakeEntryScopeSnapshot(cakeId),
    () => null,
  );

  if (!ready) {
    return (
      <span
        aria-hidden="true"
        className={`${BACK_LINK_CLASS} inline-block min-h-[1.25rem]`}
      >
        {"\u00a0"}
      </span>
    );
  }

  const dest = resolveCakeDetailBackNav(stored);

  function onPointerDown() {
    markStorefrontNavIntent(dest.href, "back");
  }

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      !shouldRestoreCakeDetailBackFromHistory({
        destHref: dest.href,
        storedOrigin: stored?.origin,
        historyLength: window.history.length,
        modifiedClick:
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0,
      })
    ) {
      return;
    }
    event.preventDefault();
    router.back();
  }

  return (
    <Link
      className={BACK_LINK_CLASS}
      data-cake-detail-back=""
      href={dest.href}
      onClick={onClick}
      onPointerDown={onPointerDown}
      prefetch
    >
      {dest.label}
    </Link>
  );
}
