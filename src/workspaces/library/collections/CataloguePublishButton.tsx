"use client";

import { useActionState } from "react";
import { FormError, FormSubmitButton } from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { publishCatalogueAction } from "@/workspaces/library/collections/actions";

type CataloguePublishButtonProps = {
  collectionId: string;
  purpose: "monthly" | "special";
};

export function CataloguePublishButton({
  collectionId,
  purpose,
}: CataloguePublishButtonProps) {
  const [state, formAction, pending] = useActionState(
    publishCatalogueAction,
    libraryActionInitialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input name="collection_id" type="hidden" value={collectionId} />
      <FormError message={state.error} />
      <FormSubmitButton pending={pending} pendingLabel="Publishing…">
        Publish catalogue
      </FormSubmitButton>
      <p className="text-skyline max-w-sm text-xs">
        Sets status to Active.
        {purpose === "special"
          ? " This does not make it the website catalogue. Use Website override for that."
          : " An Active monthly catalogue can become the website catalogue for its month."}
      </p>
    </form>
  );
}
