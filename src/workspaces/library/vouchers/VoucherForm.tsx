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
import type { LibraryCake } from "@/types/library-cake";
import type { LibraryVoucher } from "@/types/library-voucher";
import { emptyCatalogueRules } from "@/engines/vouchers/catalogue-voucher";
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
  cakes: Array<Pick<LibraryCake, "id" | "name">>;
  sizeLabels: string[];
  cancelHref: string;
};

export function VoucherForm({
  mode,
  voucher,
  assets,
  cakes,
  sizeLabels,
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
  const rules = voucher?.rules ?? emptyCatalogueRules();
  const selectedCakes = new Set(rules.cakeIds);
  const selectedSizes = new Set(rules.sizeLabels);

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

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <div>
          <h2 className="text-ink text-sm font-semibold">Eligibility</h2>
          <p className="text-skyline mt-1 text-sm">
            All conditions are optional. Configured condition types use AND.
            Multiple cakes or sizes use OR. Cake and size must match the same
            line. Complimentary vouchers stay visible here but are not applied
            by the catalogue voucher engine.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField htmlFor="order_date_from" label="Order date from">
            <FormInput
              defaultValue={rules.orderDate?.from ?? ""}
              id="order_date_from"
              name="order_date_from"
              type="date"
            />
          </FormField>
          <FormField htmlFor="order_date_until" label="Order date until">
            <FormInput
              defaultValue={rules.orderDate?.until ?? ""}
              id="order_date_until"
              name="order_date_until"
              type="date"
            />
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField htmlFor="fulfilment_date_from" label="Fulfilment date from">
            <FormInput
              defaultValue={rules.fulfilmentDate?.from ?? ""}
              id="fulfilment_date_from"
              name="fulfilment_date_from"
              type="date"
            />
          </FormField>
          <FormField htmlFor="fulfilment_date_until" label="Fulfilment date until">
            <FormInput
              defaultValue={rules.fulfilmentDate?.until ?? ""}
              id="fulfilment_date_until"
              name="fulfilment_date_until"
              type="date"
            />
          </FormField>
        </div>

        <FormField
          help="Cake subtotal only. Qualifies at this amount or above. Leave blank for no minimum."
          htmlFor="minimum_cake_subtotal"
          label="Minimum cake subtotal (RM)"
        >
          <FormInput
            defaultValue={rules.minimumCakeSubtotal ?? ""}
            id="minimum_cake_subtotal"
            min={0}
            name="minimum_cake_subtotal"
            step="0.01"
            type="number"
          />
        </FormField>

        <fieldset className="space-y-2">
          <legend className="text-ink text-sm font-medium">
            Eligible cake sizes
          </legend>
          <div className="flex flex-wrap gap-3">
            {sizeLabels.map((label) => (
              <label
                className="text-ink inline-flex min-h-10 items-center gap-2 text-sm"
                key={label}
              >
                <input
                  defaultChecked={selectedSizes.has(label)}
                  name="eligible_size"
                  type="checkbox"
                  value={label}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-ink text-sm font-medium">Eligible cakes</legend>
          <p className="text-skyline text-xs">
            Leave all unchecked for no cake restriction.
          </p>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-fog p-3">
            {cakes.map((cake) => (
              <label
                className="text-ink flex min-h-10 items-center gap-2 text-sm"
                key={cake.id}
              >
                <input
                  defaultChecked={selectedCakes.has(cake.id)}
                  name="eligible_cake"
                  type="checkbox"
                  value={cake.id}
                />
                {cake.name}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

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
