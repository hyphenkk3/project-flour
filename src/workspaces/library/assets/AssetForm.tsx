"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import { LIBRARY_ASSET_MAX_BYTES } from "@/workspaces/library/assets/asset-storage";
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

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export function AssetForm({ mode, asset, cancelHref }: AssetFormProps) {
  const action =
    mode === "create"
      ? createAssetAction
      : updateAssetAction.bind(null, asset!.id);
  const [state, formAction, pending] = useActionState(
    action,
    libraryActionInitialState,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const shownPreview =
    previewUrl ?? (mode === "edit" && asset && !selectedFile ? asset.imageUrl : null);

  function replaceSelectedFile(file: File | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (file) {
      previewUrlRef.current = URL.createObjectURL(file);
    }
    setSelectedFile(file);
    setPreviewUrl(previewUrlRef.current);
  }

  function clearSelectedFile() {
    replaceSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

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
        help={`JPEG, PNG, or WebP up to ${formatFileSize(LIBRARY_ASSET_MAX_BYTES)}. The image uploads when you save.`}
        htmlFor="photo"
        label="Upload image"
      >
        <div className="min-w-0 space-y-3">
          <input
            accept={ACCEPTED_TYPES}
            className="text-ink block w-full min-w-0 text-sm"
            id="photo"
            name="photo"
            onChange={(event) => {
              replaceSelectedFile(event.target.files?.[0] ?? null);
            }}
            ref={fileInputRef}
            required={mode === "create"}
            type="file"
          />
          {shownPreview ? (
            <div className="bg-fog overflow-hidden rounded-xl">
              {/* Local object URLs cannot use next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={
                  selectedFile
                    ? selectedFile.name
                    : (asset?.altText ?? asset?.title ?? "Asset preview")
                }
                className="mx-auto max-h-64 w-full max-w-full object-contain"
                src={shownPreview}
              />
            </div>
          ) : (
            <p className="text-skyline text-sm">No image selected yet.</p>
          )}
          {selectedFile ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="text-ink min-w-0 flex-1 text-sm break-words">
                {selectedFile.name}
              </p>
              <button
                className="border-fog text-ink inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium"
                onClick={clearSelectedFile}
                type="button"
              >
                Remove selection
              </button>
            </div>
          ) : null}
        </div>
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
