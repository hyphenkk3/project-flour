"use client";

import { useActionState } from "react";
import { FormActions, FormError, FormSubmitButton } from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { setCatalogueWebsiteOverrideAction } from "@/workspaces/library/collections/actions";
import {
  WEBSITE_OVERRIDE_EXPLANATION,
  formatCatalogueDateRange,
} from "@/workspaces/library/collections/catalogue";
import type { LibraryCollection } from "@/workspaces/library/collections/queries";

type CatalogueWebsiteOverridePanelProps = {
  collection: LibraryCollection;
};

export function CatalogueWebsiteOverridePanel({
  collection,
}: CatalogueWebsiteOverridePanelProps) {
  const [state, formAction, pending] = useActionState(
    setCatalogueWebsiteOverrideAction,
    libraryActionInitialState,
  );
  const dateRange =
    collection.startDate && collection.endDate
      ? formatCatalogueDateRange(collection.startDate, collection.endDate)
      : null;

  return (
    <section className="border-fog rounded-xl border bg-white px-4 py-4">
      <p className="text-ink text-sm font-medium">Website override</p>
      <p className="text-skyline mt-1 text-sm">
        {WEBSITE_OVERRIDE_EXPLANATION}
      </p>
      {dateRange ? (
        <p className="text-ink mt-3 text-sm">
          Date range: <span className="font-medium">{dateRange}</span>
        </p>
      ) : null}
      <p className="mt-2 text-sm">
        {collection.websiteOverride ? (
          <span className="text-ink font-medium">
            Published as website override during these dates
          </span>
        ) : (
          <span className="text-skyline">
            Off — this catalogue stays internal
          </span>
        )}
      </p>
      <form action={formAction} className="mt-4">
        <FormError message={state.error} />
        <input name="collection_id" type="hidden" value={collection.id} />
        <input
          name="website_override"
          type="hidden"
          value={collection.websiteOverride ? "false" : "true"}
        />
        <FormActions>
          <FormSubmitButton pending={pending} pendingLabel="Saving…">
            {collection.websiteOverride
              ? "Turn website override off"
              : "Publish as website override"}
          </FormSubmitButton>
        </FormActions>
      </form>
    </section>
  );
}
