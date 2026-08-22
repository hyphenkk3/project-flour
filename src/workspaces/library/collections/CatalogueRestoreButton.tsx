"use client";

import { useActionState } from "react";
import { FormError, FormSubmitButton } from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { restoreCatalogueAction } from "@/workspaces/library/collections/actions";

type CatalogueRestoreButtonProps = {
  collectionId: string;
  compact?: boolean;
};

export function CatalogueRestoreButton({
  collectionId,
  compact = false,
}: CatalogueRestoreButtonProps) {
  const [state, formAction, pending] = useActionState(
    restoreCatalogueAction,
    libraryActionInitialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input name="collection_id" type="hidden" value={collectionId} />
      <FormError message={state.error} />
      <FormSubmitButton
        className={
          compact
            ? "bg-transparent text-signal hover:text-ink min-h-11 px-0 hover:bg-transparent"
            : ""
        }
        pending={pending}
        pendingLabel="Restoring…"
      >
        Restore
      </FormSubmitButton>
      {compact ? null : (
        <p className="text-skyline max-w-sm text-xs">
          Returns this catalogue to Draft. Publish it again if customers should
          see it. Display order is kept.
        </p>
      )}
    </form>
  );
}
