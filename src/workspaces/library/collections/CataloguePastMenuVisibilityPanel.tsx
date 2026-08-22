"use client";

import { useActionState } from "react";
import { FormActions, FormError, FormSubmitButton } from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { setCatalogueShowInPastMenuAction } from "@/workspaces/library/collections/actions";
import {
  SHOW_IN_PAST_MENU_EXPLANATION,
  SHOW_IN_PAST_MENU_LABEL,
} from "@/workspaces/library/collections/catalogue";
import type { LibraryCollection } from "@/workspaces/library/collections/queries";

type CataloguePastMenuVisibilityPanelProps = {
  collection: LibraryCollection;
};

export function CataloguePastMenuVisibilityPanel({
  collection,
}: CataloguePastMenuVisibilityPanelProps) {
  const [state, formAction, pending] = useActionState(
    setCatalogueShowInPastMenuAction,
    libraryActionInitialState,
  );

  return (
    <section className="border-fog rounded-xl border bg-white px-4 py-4">
      <p className="text-ink text-sm font-medium">{SHOW_IN_PAST_MENU_LABEL}</p>
      <p className="text-skyline mt-1 text-sm">{SHOW_IN_PAST_MENU_EXPLANATION}</p>
      <p className="mt-2 text-sm">
        {collection.showInPastMenu ? (
          <span className="text-ink font-medium">
            On — visible as a Past Menu once this catalogue is no longer current
          </span>
        ) : (
          <span className="text-skyline">
            Off — hidden from the customer Browse Menu
          </span>
        )}
      </p>
      <form action={formAction} className="mt-4">
        <FormError message={state.error} />
        <input name="collection_id" type="hidden" value={collection.id} />
        <input
          name="show_in_past_menu"
          type="hidden"
          value={collection.showInPastMenu ? "false" : "true"}
        />
        <FormActions>
          <FormSubmitButton pending={pending} pendingLabel="Saving…">
            {collection.showInPastMenu
              ? "Hide from Browse Menu"
              : "Show in Browse Menu"}
          </FormSubmitButton>
        </FormActions>
      </form>
    </section>
  );
}
