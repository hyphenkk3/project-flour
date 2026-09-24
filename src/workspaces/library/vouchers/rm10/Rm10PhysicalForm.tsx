"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormRadioGroup,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import {
  formatAlreadyExistMessage,
  RM10_LIBRARY_MAX_BATCH,
} from "@/engines/vouchers/physical-rm10";
import {
  addRm10PhysicalVouchersAction,
  rm10LibraryActionInitialState,
} from "@/workspaces/library/vouchers/rm10/actions";

type AddMethod = "single" | "range" | "list";

export function Rm10PhysicalForm() {
  const [method, setMethod] = useState<AddMethod>("single");
  const [state, formAction, pending] = useActionState(
    addRm10PhysicalVouchersAction,
    rm10LibraryActionInitialState,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <input name="add_method" type="hidden" value={method} />

      <FormRadioGroup
        legend="Add method"
        name="add_method_ui"
        onChange={(value) => setMethod(value as AddMethod)}
        options={[
          { value: "single", label: "One voucher" },
          { value: "range", label: "Batch / range" },
          { value: "list", label: "Pasted list" },
        ]}
        required
        value={method}
      />

      {method === "single" ? (
        <FormField htmlFor="voucher_number" label="Voucher number" required>
          <FormInput id="voucher_number" name="voucher_number" required />
        </FormField>
      ) : null}

      {method === "range" ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField htmlFor="start_number" label="Starting voucher number" required>
            <FormInput id="start_number" inputMode="numeric" name="start_number" required />
          </FormField>
          <FormField htmlFor="end_number" label="Ending voucher number" required>
            <FormInput id="end_number" inputMode="numeric" name="end_number" required />
          </FormField>
        </div>
      ) : null}

      {method === "list" ? (
        <FormField
          help={`One number per line. At most ${RM10_LIBRARY_MAX_BATCH} numbers.`}
          htmlFor="voucher_list"
          label="Voucher numbers"
          required
        >
          <FormTextarea id="voucher_list" name="voucher_list" required />
        </FormField>
      ) : null}

      <FormField htmlFor="expiry_date" label="Expiry date" required>
        <FormInput id="expiry_date" name="expiry_date" required type="date" />
      </FormField>

      <FormError message={state.error} />
      {state.createdCount > 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Created {state.createdCount} voucher
          {state.createdCount === 1 ? "" : "s"}.
          {state.existingNumbers.length > 0
            ? ` ${formatAlreadyExistMessage(state.existingNumbers)}`
            : ""}
        </p>
      ) : null}

      <FormActions>
        <FormSubmitButton pending={pending}>Add RM10 cards</FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          href="/library/vouchers/rm10"
        >
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
