"use client";

import { useActionState, useEffect, useState } from "react";
import { FormError } from "@/components/ui/form";
import {
  HOMEPAGE_COLLECTION_PREVIEW_MAX,
} from "@/engines/menu/homepage-collection-preview";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { updateCollectionCakeHomepageAction } from "@/workspaces/library/collections/actions";

type CollectionHomepagePreviewControlProps = {
  collectionId: string;
  membershipId: string;
  available: boolean;
  showOnHomepage: boolean;
  position: number | null;
  canManage: boolean;
  disabled?: boolean;
};

export function CollectionHomepagePreviewControl({
  collectionId,
  membershipId,
  available,
  showOnHomepage,
  position,
  canManage,
  disabled = false,
}: CollectionHomepagePreviewControlProps) {
  const [state, formAction, pending] = useActionState(
    updateCollectionCakeHomepageAction,
    libraryActionInitialState,
  );
  const [checked, setChecked] = useState(showOnHomepage);
  const [orderValue, setOrderValue] = useState(
    position != null ? String(position) : "",
  );

  useEffect(() => {
    setChecked(showOnHomepage);
    setOrderValue(position != null ? String(position) : "");
  }, [position, showOnHomepage]);

  useEffect(() => {
    if (state.error) {
      setChecked(showOnHomepage);
      setOrderValue(position != null ? String(position) : "");
    }
  }, [position, showOnHomepage, state.error]);

  const statusLabel = showOnHomepage
    ? `✓ Homepage · #${position ?? "—"}`
    : "Not shown on homepage";

  if (!available) {
    return null;
  }

  if (!canManage) {
    return (
      <p className="text-skyline mt-2 text-xs">
        <span className="text-ink font-medium">Homepage preview</span>
        <span className="mt-0.5 block">{statusLabel}</span>
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input name="collection_id" type="hidden" value={collectionId} />
      <input name="membership_id" type="hidden" value={membershipId} />
      <label className="text-ink flex min-h-11 items-center gap-2 text-sm">
        <input
          checked={checked}
          className="size-4 shrink-0 accent-[var(--color-signal)]"
          disabled={pending || disabled}
          name="show_on_homepage"
          onChange={(event) => {
            setChecked(event.target.checked);
            event.currentTarget.form?.requestSubmit();
          }}
          type="checkbox"
          value="on"
        />
        Show on homepage
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-skyline text-xs">{statusLabel}</p>
        {showOnHomepage ? (
          <label className="text-skyline flex items-center gap-1.5 text-xs">
            Order
            <input
              className="border-fog text-ink h-9 w-14 rounded-md border bg-white px-2 text-sm tabular-nums outline-none focus:border-signal disabled:opacity-60"
              disabled={pending || disabled}
              inputMode="numeric"
              max={HOMEPAGE_COLLECTION_PREVIEW_MAX}
              min={1}
              name="homepage_sort_order"
              onChange={(event) => {
                setOrderValue(event.target.value);
                if (event.target.value.trim()) {
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              step={1}
              type="number"
              value={orderValue}
            />
          </label>
        ) : null}
      </div>
      {pending ? (
        <p className="text-skyline text-xs">Saving…</p>
      ) : (
        <FormError message={state.error} />
      )}
    </form>
  );
}
