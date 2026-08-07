"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import type { LibraryPromotion } from "@/types/library-promotion";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  createPromotionAction,
  updatePromotionAction,
} from "@/workspaces/library/promotions/actions";
import {
  LIBRARY_PROMOTION_STATUSES,
  promotionStatusLabel,
} from "@/workspaces/library/labels";

type PromotionFormProps = {
  mode: "create" | "edit";
  promotion?: LibraryPromotion;
  cancelHref: string;
};

export function PromotionForm({
  mode,
  promotion,
  cancelHref,
}: PromotionFormProps) {
  const action =
    mode === "create"
      ? createPromotionAction
      : updatePromotionAction.bind(null, promotion!.id);
  const [state, formAction, pending] = useActionState(
    action,
    libraryActionInitialState,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <FormField htmlFor="name" label="Name">
        <FormInput
          defaultValue={promotion?.name ?? ""}
          id="name"
          name="name"
          required
        />
      </FormField>

      <FormField htmlFor="description" label="Description">
        <FormTextarea
          defaultValue={promotion?.description ?? ""}
          id="description"
          name="description"
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField htmlFor="valid_from" label="Valid from">
          <FormInput
            defaultValue={promotion?.validFrom ?? ""}
            id="valid_from"
            name="valid_from"
            type="date"
          />
        </FormField>
        <FormField htmlFor="valid_until" label="Valid until">
          <FormInput
            defaultValue={promotion?.validUntil ?? ""}
            id="valid_until"
            name="valid_until"
            type="date"
          />
        </FormField>
      </div>

      <FormField htmlFor="status" label="Status">
        <FormSelect
          defaultValue={promotion?.status ?? "draft"}
          id="status"
          name="status"
          required
        >
          {LIBRARY_PROMOTION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {promotionStatusLabel(status)}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>
          {mode === "create" ? "Create promotion" : "Save promotion"}
        </FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          href={cancelHref}
        >
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
