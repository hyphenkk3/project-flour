"use client";

import { useLayoutEffect, useState, useTransition } from "react";
import {
  markCollectionOrderCollectedAction,
  undoCollectionOrderCollectedAction,
} from "@/workspaces/collection/actions";

type CollectionHandoffActionsProps = {
  orderId: string;
  canMarkCollected: boolean;
  canUndoCollected: boolean;
  completeLabel?: string;
  undoLabel?: string;
};

/**
 * Mark Collected / Undo — same mutations as before.
 * sm+/desktop: inline in order content (right-aligned).
 * Narrow mobile only: sticky bottom for handoff reach.
 */
export function CollectionHandoffActions({
  orderId,
  canMarkCollected,
  canUndoCollected,
  completeLabel = "Mark Collected",
  undoLabel = "Undo Collected",
}: CollectionHandoffActionsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"mark" | "undo" | null>(null);
  const [mobileNavigationHeight, setMobileNavigationHeight] = useState<
    number | null
  >(null);

  useLayoutEffect(() => {
    const navigation = document.querySelector<HTMLElement>(
      'nav[aria-label="Workspaces"]',
    );
    if (!navigation) return;

    const updateNavigationHeight = () => {
      const height = navigation.getBoundingClientRect().height;
      setMobileNavigationHeight(height > 0 ? height : null);
    };

    updateNavigationHeight();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateNavigationHeight);
      observer.observe(navigation);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateNavigationHeight);
    return () => window.removeEventListener("resize", updateNavigationHeight);
  }, []);

  function run(kind: "mark" | "undo", action: () => Promise<{ error: string | null }>) {
    setError(null);
    setBusy(kind);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  if (!canMarkCollected && !canUndoCollected) {
    return null;
  }

  return (
    <div
      className={[
        // Default (tablet/desktop): in-flow, attached to order content
        "sm:mt-0",
        // Narrow mobile: sit directly above the measured, content-sized shared navigation.
        mobileNavigationHeight === null
          ? "max-sm:mt-0"
          : "max-sm:fixed max-sm:inset-x-0 max-sm:z-20 max-sm:mt-0",
        "max-sm:border-fog max-sm:border-t max-sm:bg-white/95 max-sm:px-5 max-sm:py-3 max-sm:backdrop-blur",
      ].join(" ")}
      style={
        mobileNavigationHeight === null
          ? undefined
          : { bottom: `${mobileNavigationHeight}px` }
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:max-w-none">
        {error ? (
          <p className="text-status-danger text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {canMarkCollected ? (
            <button
              className="bg-ink text-mist hover:bg-signal inline-flex min-h-12 flex-1 items-center justify-center rounded-xl px-5 text-sm font-semibold transition disabled:opacity-60 sm:min-w-[12rem] sm:flex-none"
              disabled={pending}
              onClick={() =>
                run("mark", () => markCollectionOrderCollectedAction(orderId))
              }
              type="button"
            >
              {busy === "mark" ? "Working…" : completeLabel}
            </button>
          ) : null}
          {canUndoCollected ? (
            <button
              className="border-fog text-ink hover:border-skyline inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border bg-white px-5 text-sm font-medium transition disabled:opacity-60 sm:flex-none"
              disabled={pending}
              onClick={() =>
                run("undo", () => undoCollectionOrderCollectedAction(orderId))
              }
              type="button"
            >
              {busy === "undo" ? "Working…" : undoLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
