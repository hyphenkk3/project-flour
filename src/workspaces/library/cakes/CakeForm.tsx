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
import type { LibraryCakeDetail } from "@/types/library-cake";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  createCakeAction,
  updateCakeAction,
} from "@/workspaces/library/cakes/actions";
import { CakeSizeFields } from "@/workspaces/library/cakes/CakeSizeFields";
import {
  cakeCategoryLabel,
  cakeStatusLabel,
  LIBRARY_CAKE_CATEGORIES,
  LIBRARY_CAKE_STATUSES,
} from "@/workspaces/library/labels";

type CakeFormProps = {
  mode: "create" | "edit";
  cake?: LibraryCakeDetail;
  cancelHref: string;
};

export function CakeForm({ mode, cake, cancelHref }: CakeFormProps) {
  const action =
    mode === "create"
      ? createCakeAction
      : updateCakeAction.bind(null, cake!.id);
  const [state, formAction, pending] = useActionState(
    action,
    libraryActionInitialState,
  );

  const allergens = cake?.allergens.join("\n") ?? "";

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <FormField htmlFor="name" label="Cake name">
        <FormInput
          defaultValue={cake?.name ?? ""}
          id="name"
          name="name"
          required
        />
      </FormField>

      <FormField
        help="Temporary grouping until Cake Family is introduced."
        htmlFor="category"
        label="Category"
      >
        <FormSelect
          defaultValue={cake?.category ?? "celebration"}
          id="category"
          name="category"
          required
        >
          {LIBRARY_CAKE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {cakeCategoryLabel(category)}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <FormField htmlFor="description" label="Description">
        <FormTextarea
          defaultValue={cake?.description ?? ""}
          id="description"
          name="description"
        />
      </FormField>

      <FormField
        help="Optional. Prefer flexible portion language — not fixed serving counts."
        htmlFor="sharing_guide"
        label="Sharing guide"
      >
        <FormTextarea
          defaultValue={cake?.sharingGuide ?? ""}
          id="sharing_guide"
          name="sharing_guide"
          placeholder="There is no exact serving size. Portions depend on how the cake is cut and everyone's preferred slice size."
        />
      </FormField>

      <CakeSizeFields
        initialSizes={cake?.sizes.map((size) => ({
          id: size.id,
          label: size.label,
          price: size.price,
          preorderDays: size.preorderDays,
        }))}
      />

      {mode === "create" ? (
        <p className="text-skyline text-sm">
          Add photos after you save this cake. You can upload size-specific
          product photos and extra gallery photos on the next screen.
        </p>
      ) : null}

      <FormField htmlFor="bakery_notes" label="Bakery notes">
        <FormTextarea
          defaultValue={cake?.bakeryNotes ?? ""}
          id="bakery_notes"
          name="bakery_notes"
        />
      </FormField>

      <FormField
        help="One allergen per line."
        htmlFor="allergens"
        label="Allergens"
      >
        <FormTextarea
          defaultValue={allergens}
          id="allergens"
          name="allergens"
          placeholder={"Eggs\nDairy\nGluten"}
        />
      </FormField>

      <FormField htmlFor="status" label="Status">
        <FormSelect
          defaultValue={cake?.status ?? "draft"}
          id="status"
          name="status"
          required
        >
          {LIBRARY_CAKE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {cakeStatusLabel(status)}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>
          {mode === "create" ? "Create cake" : "Save cake"}
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
