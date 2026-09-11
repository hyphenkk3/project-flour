"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  CAKE_CATEGORY_ASSIGNMENT_MAX,
  cakeCategoryOptionLabel,
  cakeEditorCategoryOptions,
} from "@/engines/menu/cake-categories";
import {
  cakeEditorTagOptions,
  cakeTagOptionLabel,
} from "@/engines/menu/cake-tags";
import { POPULAR_CAKES_MAX_SELECTION } from "@/engines/menu/homepage-popular-cakes";
import {
  FormActions,
  FormCheckbox,
  FormError,
  FormField,
  FormInput,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import type {
  LibraryCakeCategoryRecord,
  LibraryCakeDetail,
  LibraryCakeTagRecord,
} from "@/types/library-cake";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  createCakeAction,
  updateCakeAction,
} from "@/workspaces/library/cakes/actions";
import { CakeSizeFields } from "@/workspaces/library/cakes/CakeSizeFields";
import {
  cakeStatusLabel,
  LIBRARY_CAKE_STATUSES,
} from "@/workspaces/library/labels";

type CakeFormProps = {
  mode: "create" | "edit";
  cake?: LibraryCakeDetail;
  categories: LibraryCakeCategoryRecord[];
  tags: LibraryCakeTagRecord[];
  cancelHref: string;
};

export function CakeForm({
  mode,
  cake,
  categories,
  tags,
  cancelHref,
}: CakeFormProps) {
  const action =
    mode === "create"
      ? createCakeAction
      : updateCakeAction.bind(null, cake!.id);
  const [state, formAction, pending] = useActionState(
    action,
    libraryActionInitialState,
  );

  const allergens = cake?.allergens.join("\n") ?? "";
  const currentCategoryIds = cake?.categories.map((row) => row.id) ?? [];
  const currentTagIds = cake?.tags?.map((row) => row.id) ?? [];
  const options = cakeEditorCategoryOptions(categories, currentCategoryIds);
  const tagOptions = cakeEditorTagOptions(tags, currentTagIds);
  const currentInactive = cake?.categories.some((row) => !row.isActive) ?? false;
  const currentInactiveTags = cake?.tags?.some((row) => !row.isActive) ?? false;
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    currentCategoryIds,
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(currentTagIds);
  const [showInPopularCakes, setShowInPopularCakes] = useState(
    cake?.showInPopularCakes ?? false,
  );

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

      <div className="flex flex-col gap-1.5">
        <fieldset>
          <legend className="text-ink text-sm font-medium">Categories</legend>
          <p className="text-skyline mt-1 text-sm leading-relaxed">
            {currentInactive
              ? "This cake keeps any inactive category until you replace it. Owner and Manager can reactivate categories under Manage categories."
              : `Choose up to ${CAKE_CATEGORY_ASSIGNMENT_MAX} categories. Used in the Cake Library and customer Browse.`}
          </p>
          <div className="mt-2 grid gap-2">
            {options.length === 0 ? (
              <p className="text-skyline text-sm">No categories yet.</p>
            ) : (
              options.map((category) => {
                const checked = selectedCategoryIds.includes(category.id);
                const disabled =
                  !checked &&
                  selectedCategoryIds.length >= CAKE_CATEGORY_ASSIGNMENT_MAX;
                return (
                  <FormCheckbox
                    checked={checked}
                    disabled={disabled}
                    key={category.id}
                    label={cakeCategoryOptionLabel(category)}
                    name="category_ids"
                    onChange={(event) => {
                      const nextChecked = event.target.checked;
                      setSelectedCategoryIds((current) => {
                        if (nextChecked) {
                          if (current.includes(category.id)) return current;
                          if (current.length >= CAKE_CATEGORY_ASSIGNMENT_MAX) {
                            return current;
                          }
                          return [...current, category.id];
                        }
                        return current.filter((id) => id !== category.id);
                      });
                    }}
                    value={category.id}
                  />
                );
              })
            )}
          </div>
        </fieldset>
        <Link
          className="text-signal hover:text-ink inline-flex min-h-11 items-center text-sm font-medium"
          href="/library/cakes/categories"
        >
          Manage categories
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <fieldset>
          <legend className="text-ink text-sm font-medium">Tags</legend>
          <p className="text-skyline mt-1 text-sm leading-relaxed">
            {currentInactiveTags
              ? "This cake keeps any inactive tag until you replace it. Owner and Manager can reactivate tags under Manage tags."
              : "Optional merchandising badges on cake cards. Prefer a small set — tags are not Browse filters."}
          </p>
          <div className="mt-2 grid gap-2">
            {tagOptions.length === 0 ? (
              <p className="text-skyline text-sm">No tags yet.</p>
            ) : (
              tagOptions.map((tag) => {
                const checked = selectedTagIds.includes(tag.id);
                return (
                  <FormCheckbox
                    checked={checked}
                    key={tag.id}
                    label={cakeTagOptionLabel(tag)}
                    name="tag_ids"
                    onChange={(event) => {
                      const nextChecked = event.target.checked;
                      setSelectedTagIds((current) => {
                        if (nextChecked) {
                          if (current.includes(tag.id)) return current;
                          return [...current, tag.id];
                        }
                        return current.filter((id) => id !== tag.id);
                      });
                    }}
                    value={tag.id}
                  />
                );
              })
            )}
          </div>
        </fieldset>
        <Link
          className="text-signal hover:text-ink inline-flex min-h-11 items-center text-sm font-medium"
          href="/library/cakes/tags"
        >
          Manage tags
        </Link>
      </div>

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

      <div className="flex flex-col gap-3">
        <FormCheckbox
          defaultChecked={cake?.showInPopularCakes ?? false}
          help="Homepage merchandising only. Seasonal and limited cakes may be included."
          id="show_in_popular_cakes"
          label="Show in Popular Cakes"
          name="show_in_popular_cakes"
          onChange={(event) => setShowInPopularCakes(event.target.checked)}
        />
        {showInPopularCakes ? (
          <FormField
            help={`Lower numbers appear first. Up to ${POPULAR_CAKES_MAX_SELECTION} cakes. Leave blank to place this cake after the current selection.`}
            htmlFor="popular_cakes_sort_order"
            label="Popular Cakes order"
          >
            <FormInput
              defaultValue={
                cake?.popularCakesSortOrder != null
                  ? String(cake.popularCakesSortOrder)
                  : ""
              }
              id="popular_cakes_sort_order"
              inputMode="numeric"
              max={POPULAR_CAKES_MAX_SELECTION}
              min={1}
              name="popular_cakes_sort_order"
              placeholder="1"
              step={1}
              type="number"
            />
          </FormField>
        ) : null}
      </div>

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
