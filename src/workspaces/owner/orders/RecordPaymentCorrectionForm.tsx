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
import {
  PAYMENT_METHOD_LABELS,
  paymentMethodLabel,
} from "@/engines/orders/payment-details";
import {
  parseCorrectedPaymentAmount,
  validatePaymentCorrection,
} from "@/engines/orders/payment-record-correction";
import {
  correctPaymentRecordAction,
  type RecordPaymentCorrectionState,
} from "@/workspaces/owner/orders/actions";
import type {
  OrderPaymentAllocationView,
  PaymentMethodCode,
  StorefrontOrder,
} from "@/types/storefront";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

const initialState: RecordPaymentCorrectionState = {
  error: null,
  success: false,
};

type Props = {
  order: StorefrontOrder;
  allocation: OrderPaymentAllocationView;
  onCancel: () => void;
};

export function RecordPaymentCorrectionForm({
  order,
  allocation,
  onCancel,
}: Props) {
  const router = useRouter();
  const bound = correctPaymentRecordAction.bind(null, order.id, allocation.id);
  const [state, formAction, pending] = useActionState(bound, initialState);
  const [amountRaw, setAmountRaw] = useState(
    (allocation.effectiveAmount ?? allocation.amount).toFixed(2),
  );
  const [method, setMethod] = useState<PaymentMethodCode>(
    allocation.effectiveMethod ?? allocation.method,
  );
  const [description, setDescription] = useState(
    allocation.effectiveMethodDescription ?? allocation.methodDescription ?? "",
  );
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.success) return;
    onCancel();
    router.refresh();
  }, [state.success, onCancel, router]);

  const correctedAmount = parseCorrectedPaymentAmount(amountRaw);
  const checked =
    correctedAmount == null
      ? { error: null as string | null, correctionType: null }
      : validatePaymentCorrection({
          originalAmount: allocation.amount,
          correctedAmount,
          originalMethod: allocation.method,
          originalMethodDescription: allocation.methodDescription,
          correctedMethod: method,
          correctedMethodDescription: description,
          reason,
        });

  return (
    <form
      action={formAction}
      className="border-fog bg-mist/30 mt-3 space-y-4 rounded-xl border p-4"
    >
      <div>
        <h4 className="text-ink text-sm font-semibold">Correct Payment</h4>
        <p className="text-skyline mt-1 text-sm">
          This corrects the recorded details; it is not a refund. The original
          payment record stays preserved.
        </p>
      </div>

      <FormField
        htmlFor={`payment-correction-amount-${allocation.id}`}
        label="Correct amount"
      >
        <FormInput
          id={`payment-correction-amount-${allocation.id}`}
          disabled={confirming}
          inputMode="decimal"
          min="0"
          name="amount"
          onChange={(event) => {
            setAmountRaw(event.target.value);
            setLocalError(null);
          }}
          required
          step="0.01"
          type="number"
          value={amountRaw}
        />
      </FormField>

      <FormField
        htmlFor={`payment-correction-method-${allocation.id}`}
        label="Correct method"
      >
        <FormSelect
          id={`payment-correction-method-${allocation.id}`}
          name="method"
          disabled={confirming}
          onChange={(event) => {
            setMethod(event.target.value as PaymentMethodCode);
            setLocalError(null);
          }}
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
        <FormField
          htmlFor={`payment-correction-description-${allocation.id}`}
          label="Others description"
        >
          <FormInput
            id={`payment-correction-description-${allocation.id}`}
            disabled={confirming}
            name="method_description"
            onChange={(event) => setDescription(event.target.value)}
            required
            value={description}
          />
        </FormField>
      ) : null}

      <FormField
        htmlFor={`payment-correction-reason-${allocation.id}`}
        label="Reason"
      >
        <FormTextarea
          id={`payment-correction-reason-${allocation.id}`}
          disabled={confirming}
          name="reason"
          onChange={(event) => {
            setReason(event.target.value);
            setLocalError(null);
          }}
          placeholder="Required"
          required
          rows={2}
          value={reason}
        />
      </FormField>

      {confirming && correctedAmount != null && !checked.error ? (
        <div className="border-fog space-y-2 rounded-lg border bg-white p-4 text-sm">
          <p className="text-ink font-medium">Confirm payment correction</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-skyline">Original</dt>
              <dd className="text-ink font-semibold">
                {formatRm(allocation.amount)} ·{" "}
                {paymentMethodLabel(
                  allocation.method,
                  allocation.methodDescription,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-skyline">Corrected</dt>
              <dd className="text-ink font-semibold">
                {formatRm(correctedAmount)} ·{" "}
                {paymentMethodLabel(
                  method,
                  method === "others" ? description : null,
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-skyline">Reason</dt>
              <dd className="text-ink whitespace-pre-line">{reason.trim()}</dd>
            </div>
          </dl>
          <input
            name="amount"
            type="hidden"
            value={correctedAmount.toFixed(2)}
          />
          <input name="method" type="hidden" value={method} />
          <input
            name="method_description"
            type="hidden"
            value={method === "others" ? description.trim() : ""}
          />
          <input name="reason" type="hidden" value={reason.trim()} />
        </div>
      ) : null}

      <FormError message={localError ?? checked.error ?? state.error} />

      <FormActions>
        {confirming ? (
          <>
            <FormSubmitButton pending={pending}>
              Confirm Correction
            </FormSubmitButton>
            <button
              className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
              disabled={pending}
              onClick={() => setConfirming(false)}
              type="button"
            >
              Back
            </button>
          </>
        ) : (
          <>
            <button
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium"
              onClick={() => {
                if (correctedAmount == null || checked.error) {
                  setLocalError(
                    checked.error ?? "Enter a valid corrected amount.",
                  );
                  return;
                }
                setLocalError(null);
                setConfirming(true);
              }}
              type="button"
            >
              Review correction
            </button>
            <button
              className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
              disabled={pending}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          </>
        )}
      </FormActions>
    </form>
  );
}
