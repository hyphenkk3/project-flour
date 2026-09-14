"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  getStoredCakeEntryScopeSnapshot,
  resolveCakeDetailBackNav,
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
  return (
    <Link className={BACK_LINK_CLASS} href={dest.href} prefetch>
      {dest.label}
    </Link>
  );
}
