"use client";

import { useActionState, useEffect, useState } from "react";
import { FormError } from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { updateCollectionCakeHomepageAction } from "@/workspaces/library/collections/actions";

type CollectionHomepagePreviewControlProps = {
  collectionId: string;
  membershipId: string;
  available: boolean;
  showOnHomepage: boolean;
  canManage: boolean;
  disabled?: boolean;
};

export function CollectionHomepagePreviewControl({
  collectionId,
  membershipId,
  available,
  showOnHomepage,
  canManage,
  disabled = false,
}: CollectionHomepagePreviewControlProps) {
  const [state, formAction, pending] = useActionState(
    updateCollectionCakeHomepageAction,
    libraryActionInitialState,
  );
  const [checked, setChecked] = useState(showOnHomepage);

  useEffect(() => {
    setChecked(showOnHomepage);
  }, [showOnHomepage]);

  useEffect(() => {
    if (state.error) {
      setChecked(showOnHomepage);
    }
  }, [showOnHomepage, state.error]);

  const statusLabel = showOnHomepage
    ? "✓ Homepage · follows Library order"
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
      <p className="text-skyline text-xs">{statusLabel}</p>
      {pending ? (
        <p className="text-skyline text-xs">Saving…</p>
      ) : (
        <FormError message={state.error} />
      )}
    </form>
  );
}
