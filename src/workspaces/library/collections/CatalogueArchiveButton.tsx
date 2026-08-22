"use client";

import { useActionState, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormError } from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { archiveCatalogueAction } from "@/workspaces/library/collections/actions";
import { CATALOGUE_ARCHIVE_CONFIRMATION } from "@/workspaces/library/collections/catalogue";

type CatalogueArchiveButtonProps = {
  collectionId: string;
  compact?: boolean;
};

export function CatalogueArchiveButton({
  collectionId,
  compact = false,
}: CatalogueArchiveButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    archiveCatalogueAction,
    libraryActionInitialState,
  );

  return (
    <div className="flex flex-col gap-2">
      <FormError message={state.error} />
      <button
        className={
          compact
            ? "text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium disabled:opacity-60"
            : "border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium disabled:opacity-60"
        }
        disabled={pending}
        onClick={() => setOpen(true)}
        type="button"
      >
        Archive
      </button>
      {compact ? null : (
        <p className="text-skyline max-w-sm text-xs">
          Hides this catalogue from the active list and customer ordering. Does
          not delete cakes, orders, or history.
        </p>
      )}
      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Archive catalogue"
        description={CATALOGUE_ARCHIVE_CONFIRMATION}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          const formData = new FormData();
          formData.set("collection_id", collectionId);
          formAction(formData);
        }}
        open={open}
        pending={pending}
        title="Archive this catalogue?"
        tone="danger"
      />
    </div>
  );
}
