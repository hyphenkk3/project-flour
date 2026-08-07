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
import type { LibraryAsset } from "@/types/library-asset";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  createAssetAction,
  updateAssetAction,
} from "@/workspaces/library/assets/actions";
import {
  assetKindLabel,
  assetStatusLabel,
  LIBRARY_ASSET_KINDS,
  LIBRARY_ASSET_STATUSES,
} from "@/workspaces/library/labels";

type AssetFormProps = {
  mode: "create" | "edit";
  asset?: LibraryAsset;
  cancelHref: string;
};

export function AssetForm({ mode, asset, cancelHref }: AssetFormProps) {
  const action =
    mode === "create"
      ? createAssetAction
      : updateAssetAction.bind(null, asset!.id);
  const [state, formAction, pending] = useActionState(
    action,
    libraryActionInitialState,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <FormField htmlFor="title" label="Title">
        <FormInput
          defaultValue={asset?.title ?? ""}
          id="title"
          name="title"
          required
        />
      </FormField>

      <FormField htmlFor="kind" label="Kind">
        <FormSelect
          defaultValue={asset?.kind ?? "general"}
          id="kind"
          name="kind"
          required
        >
          {LIBRARY_ASSET_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {assetKindLabel(kind)}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <FormField
        help="Paste an image URL for now. Storage upload comes later."
        htmlFor="image_url"
        label="Image URL"
      >
        <FormInput
          defaultValue={asset?.imageUrl ?? ""}
          id="image_url"
          name="image_url"
          required
          type="url"
        />
      </FormField>

      <FormField htmlFor="alt_text" label="Alt text">
        <FormTextarea
          defaultValue={asset?.altText ?? ""}
          id="alt_text"
          name="alt_text"
        />
      </FormField>

      <FormField htmlFor="status" label="Status">
        <FormSelect
          defaultValue={asset?.status ?? "draft"}
          id="status"
          name="status"
          required
        >
          {LIBRARY_ASSET_STATUSES.map((status) => (
            <option key={status} value={status}>
              {assetStatusLabel(status)}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>
          {mode === "create" ? "Create asset" : "Save asset"}
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
