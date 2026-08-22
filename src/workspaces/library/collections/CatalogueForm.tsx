"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormCheckbox,
  FormError,
  FormField,
  FormInput,
  FormSelect,
  FormSubmitButton,
} from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { createCatalogueAction } from "@/workspaces/library/collections/actions";
import {
  CATALOGUE_PURPOSES,
  COPY_FROM_EMPTY_LABEL,
  COPY_FROM_EXPLANATION,
  COPY_FROM_PREVIOUS_LABEL,
  WEBSITE_OVERRIDE_EXPLANATION,
  catalogueMonthOptions,
  cataloguePurposeLabel,
  monthlyCopySourceLabel,
  type CataloguePurpose,
  type MonthlyCopySource,
} from "@/workspaces/library/collections/catalogue";
import {
  LIBRARY_COLLECTION_STATUSES,
  collectionStatusLabel,
} from "@/workspaces/library/labels";

type CatalogueFormProps = {
  cancelHref: string;
  monthlyCopySources?: MonthlyCopySource[];
  defaultCopyFromId?: string;
};

export function CatalogueForm({
  cancelHref,
  monthlyCopySources = [],
  defaultCopyFromId = "",
}: CatalogueFormProps) {
  const [state, formAction, pending] = useActionState(
    createCatalogueAction,
    libraryActionInitialState,
  );
  const [purpose, setPurpose] = useState<CataloguePurpose>("monthly");
  const [startDate, setStartDate] = useState("");
  const [copyFrom, setCopyFrom] = useState(
    monthlyCopySources.some((source) => source.id === defaultCopyFromId)
      ? defaultCopyFromId
      : "",
  );

  const selectedSource = monthlyCopySources.find(
    (source) => source.id === copyFrom,
  );
  const copying = purpose === "monthly" && Boolean(selectedSource);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <FormError message={state.error} />

      <FormField htmlFor="purpose" label="Catalogue type">
        <FormSelect
          id="purpose"
          name="purpose"
          onChange={(event) =>
            setPurpose(event.target.value as CataloguePurpose)
          }
          value={purpose}
        >
          {CATALOGUE_PURPOSES.map((value) => (
            <option key={value} value={value}>
              {cataloguePurposeLabel(value)}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <FormField
        help={
          purpose === "special"
            ? "For example Christmas 2026, Mother's Day 2027, or Wedding Collection."
            : "For example September 2026."
        }
        htmlFor="name"
        label="Catalogue name"
      >
        <FormInput id="name" name="name" required />
      </FormField>

      {purpose === "monthly" ? (
        <FormField
          help="Active monthly catalogues can become the website catalogue for that Singapore month."
          htmlFor="month"
          label="Month"
        >
          <FormSelect id="month" name="month" required>
            <option value="">Choose a month</option>
            {catalogueMonthOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FormSelect>
        </FormField>
      ) : (
        <>
          <FormField
            help="Inclusive selling-window start. Special catalogues become the website catalogue only if you publish a website override."
            htmlFor="start_date"
            label="Start date"
          >
            <FormInput
              id="start_date"
              name="start_date"
              onChange={(event) => setStartDate(event.target.value)}
              required
              type="date"
              value={startDate}
            />
          </FormField>
          <FormField
            help="Inclusive selling-window end. Must be on or after the start date."
            htmlFor="end_date"
            label="End date"
          >
            <FormInput
              id="end_date"
              min={startDate || undefined}
              name="end_date"
              required
              type="date"
            />
          </FormField>
        </>
      )}

      {purpose === "monthly" ? (
        monthlyCopySources.length === 0 ? (
          <p className="text-skyline text-sm">
            {COPY_FROM_EMPTY_LABEL}. No previous monthly catalogue is available
            to copy.
          </p>
        ) : (
          <FormField
            help={COPY_FROM_EXPLANATION}
            htmlFor="copy_from"
            label={COPY_FROM_PREVIOUS_LABEL}
          >
            <FormSelect
              id="copy_from"
              name="copy_from"
              onChange={(event) => setCopyFrom(event.target.value)}
              value={copyFrom}
            >
              <option value="">{COPY_FROM_EMPTY_LABEL}</option>
              {monthlyCopySources.map((source) => (
                <option key={source.id} value={source.id}>
                  {monthlyCopySourceLabel(source)}
                </option>
              ))}
            </FormSelect>
          </FormField>
        )
      ) : null}

      {copying && selectedSource ? (
        <p className="text-ink text-sm">
          Copying: {monthlyCopySourceLabel(selectedSource)}. The new catalogue
          will start with the same cakes and order, as Draft, and will not
          replace the website catalogue.
        </p>
      ) : null}

      {purpose === "special" ? (
        <div className="flex flex-col gap-2">
          <p className="text-ink text-sm font-medium">Website override</p>
          <FormCheckbox
            name="website_override"
            value="true"
            label="Publish as website override during these dates"
            help={WEBSITE_OVERRIDE_EXPLANATION}
          />
        </div>
      ) : null}

      {copying ? (
        <input name="status" type="hidden" value="draft" />
      ) : (
        <FormField
          help="Draft is safest until you are ready. Starting empty does not copy cakes."
          htmlFor="status"
          label="Status"
        >
          <FormSelect defaultValue="draft" id="status" name="status">
            {LIBRARY_COLLECTION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {collectionStatusLabel(value)}
              </option>
            ))}
          </FormSelect>
        </FormField>
      )}

      <FormActions>
        <FormSubmitButton pending={pending} pendingLabel="Creating…">
          {copying ? "Copy catalogue" : "Create catalogue"}
        </FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium"
          href={cancelHref}
        >
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
