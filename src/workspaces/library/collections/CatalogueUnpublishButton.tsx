"use client";

import { useActionState } from "react";
import { FormError } from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { unpublishCatalogueAction } from "@/workspaces/library/collections/actions";

type CatalogueUnpublishButtonProps = {
  collectionId: string;
};

export function CatalogueUnpublishButton({
  collectionId,
}: CatalogueUnpublishButtonProps) {
  const [state, formAction, pending] = useActionState(
    unpublishCatalogueAction,
    libraryActionInitialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input name="collection_id" type="hidden" value={collectionId} />
      <FormError message={state.error} />
      <button
        className="border-ink text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border-2 bg-white px-5 text-sm font-semibold disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Unpublishing…" : "Unpublish catalogue"}
      </button>
      <p className="text-skyline max-w-sm text-xs">
        Sets status back to Draft. Does not change cakes, prices, or website
        override.
      </p>
    </form>
  );
}
