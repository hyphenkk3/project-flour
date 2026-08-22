"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormSubmitButton,
} from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { updateCatalogueDetailsAction } from "@/workspaces/library/collections/actions";
import type { CataloguePurpose } from "@/workspaces/library/collections/catalogue";

type CatalogueEditFormProps = {
  collectionId: string;
  name: string;
  purpose: CataloguePurpose;
};

export function CatalogueEditForm({
  collectionId,
  name,
  purpose,
}: CatalogueEditFormProps) {
  const [state, formAction, pending] = useActionState(
    updateCatalogueDetailsAction,
    libraryActionInitialState,
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <input name="collection_id" type="hidden" value={collectionId} />
      <FormError message={state.error} />
      <FormField
        help={
          purpose === "monthly"
            ? "Shown as supporting text. The month heading does not change."
            : "Customer-facing catalogue name, for example Mid-Autumn Special."
        }
        htmlFor="name"
        label="Catalogue name"
      >
        <FormInput
          defaultValue={name}
          id="name"
          name="name"
          required
        />
      </FormField>
      <FormActions>
        <FormSubmitButton pending={pending} pendingLabel="Saving…">
          Save name
        </FormSubmitButton>
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium"
          href={`/library/collections/${collectionId}`}
        >
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
