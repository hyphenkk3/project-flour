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
} from "@/components/ui/form";
import type { LibraryAsset } from "@/types/library-asset";
import type { LibraryVoucher } from "@/types/library-voucher";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  createVoucherAction,
  updateVoucherAction,
} from "@/workspaces/library/vouchers/actions";
import {
  LIBRARY_VOUCHER_STATUSES,
  LIBRARY_VOUCHER_TYPES,
  voucherStatusLabel,
  voucherTypeLabel,
} from "@/workspaces/library/labels";

type VoucherFormProps = {
  mode: "create" | "edit";
  voucher?: LibraryVoucher;
  assets: LibraryAsset[];
  cancelHref: string;
};

export function VoucherForm({
  mode,
  voucher,
  assets,
  cancelHref,
}: VoucherFormProps) {
  const action =
    mode === "create"
      ? createVoucherAction
      : updateVoucherAction.bind(null, voucher!.id);
  const [state, formAction, pending] = useActionState(
    action,
    libraryActionInitialState,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <FormField htmlFor="code" label="Voucher code">
        <FormInput
          defaultValue={voucher?.code ?? ""}
          id="code"
          name="code"
          required
        />
      </FormField>

      <FormField htmlFor="voucher_type" label="Voucher type">
        <FormSelect
          defaultValue={voucher?.voucherType ?? "fixed_amount"}
          id="voucher_type"
          name="voucher_type"
          required
        >
          {LIBRARY_VOUCHER_TYPES.map((type) => (
            <option key={type} value={type}>
              {voucherTypeLabel(type)}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <FormField
        help="RM amount, percentage (0–100), or 0 for complimentary."
        htmlFor="value"
        label="Value"
      >
        <FormInput
          defaultValue={voucher?.value ?? 0}
          id="value"
          min={0}
          name="value"
          required
          step="0.01"
          type="number"
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField htmlFor="valid_from" label="Valid from">
          <FormInput
            defaultValue={voucher?.validFrom ?? ""}
            id="valid_from"
            name="valid_from"
            type="date"
          />
        </FormField>
        <FormField htmlFor="valid_until" label="Valid until">
          <FormInput
            defaultValue={voucher?.validUntil ?? ""}
            id="valid_until"
            name="valid_until"
            type="date"
          />
        </FormField>
      </div>

      <FormField
        help="Optional. Prefer linking an Asset Library image when available."
        htmlFor="image_url"
        label="Voucher image URL"
      >
        <FormInput
          defaultValue={voucher?.imageUrl ?? ""}
          id="image_url"
          name="image_url"
          type="url"
        />
      </FormField>

      <FormField htmlFor="asset_id" label="Linked asset">
        <FormSelect
          defaultValue={voucher?.assetId ?? ""}
          id="asset_id"
          name="asset_id"
        >
          <option value="">None</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.title}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <FormField htmlFor="status" label="Status">
        <FormSelect
          defaultValue={voucher?.status ?? "draft"}
          id="status"
          name="status"
          required
        >
          {LIBRARY_VOUCHER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {voucherStatusLabel(status)}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>
          {mode === "create" ? "Create voucher" : "Save voucher"}
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
