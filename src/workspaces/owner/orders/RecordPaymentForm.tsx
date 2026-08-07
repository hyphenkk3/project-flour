"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import { PAYMENT_METHOD_LABELS } from "@/engines/orders/payment-details";
import {
  recordAndVerifyPaymentAction,
  type RecordPaymentState,
} from "@/workspaces/owner/orders/actions";
import { toDatetimeLocalValue } from "@/workspaces/owner/orders/labels";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

const initialState: RecordPaymentState = {
  error: null,
  success: false,
};

type RecordPaymentFormProps = {
  orderId: string;
  remainingBalance: number;
  onCancel: () => void;
};

export function RecordPaymentForm({
  orderId,
  remainingBalance,
  onCancel,
}: RecordPaymentFormProps) {
  const router = useRouter();
  const bound = recordAndVerifyPaymentAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState(bound, initialState);
  const [method, setMethod] = useState<"wb_qr" | "online_transfer" | "others">(
    "wb_qr",
  );

  useEffect(() => {
    if (!state.success) return;
    onCancel();
    router.refresh();
  }, [state.success, onCancel, router]);

  return (
    <form action={formAction} className="border-fog space-y-4 rounded-xl border bg-white p-5">
      <div>
        <h3 className="text-ink text-sm font-semibold">Record Payment</h3>
        <p className="text-skyline mt-1 text-sm">
          After you visually verify the customer’s payment slip. Balance{" "}
          {formatRm(remainingBalance)}.
        </p>
      </div>

      <FormField htmlFor="amount" label="Amount received">
        <FormInput
          defaultValue={
            remainingBalance > 0 ? remainingBalance.toFixed(2) : ""
          }
          id="amount"
          inputMode="decimal"
          min="0.01"
          name="amount"
          required
          step="0.01"
          type="number"
        />
      </FormField>

      <FormField htmlFor="method" label="Payment method">
        <FormSelect
          id="method"
          name="method"
          onChange={(event) =>
            setMethod(
              event.target.value as "wb_qr" | "online_transfer" | "others",
            )
          }
          required
          value={method}
        >
          <option value="wb_qr">{PAYMENT_METHOD_LABELS.wb_qr}</option>
          <option value="online_transfer">
            {PAYMENT_METHOD_LABELS.online_transfer}
          </option>
          <option value="others">{PAYMENT_METHOD_LABELS.others}</option>
        </FormSelect>
      </FormField>

      {method === "others" ? (
        <FormField htmlFor="method_description" label="Others description">
          <FormInput
            id="method_description"
            name="method_description"
            placeholder="e.g. Cash, Card terminal"
            required
          />
        </FormField>
      ) : null}

      <FormField htmlFor="paid_at" label="Payment date/time">
        <FormInput
          defaultValue={toDatetimeLocalValue(new Date())}
          id="paid_at"
          name="paid_at"
          required
          type="datetime-local"
        />
      </FormField>

      <FormField htmlFor="reference_note" label="Reference / note">
        <FormTextarea
          id="reference_note"
          name="reference_note"
          placeholder="Optional"
          rows={2}
        />
      </FormField>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>
          Record & Verify Payment
        </FormSubmitButton>
        <button
          className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </FormActions>
    </form>
  );
}
