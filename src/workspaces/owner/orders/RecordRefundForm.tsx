"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import {
  parseRefundAmount,
  validatePaymentCorrection,
} from "@/engines/orders/payment-correction";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontOrder } from "@/types/storefront";
import {
  recordOverpaymentRefundAction,
  type RecordPaymentCorrectionState,
} from "@/workspaces/owner/orders/actions";

const initialState: RecordPaymentCorrectionState = {
  error: null,
  success: false,
};

type RecordRefundFormProps = {
  order: StorefrontOrder;
  onCancel: () => void;
};

export function RecordRefundForm({ order, onCancel }: RecordRefundFormProps) {
  const router = useRouter();
  const bound = recordOverpaymentRefundAction.bind(null, order.id);
  const [state, formAction, pending] = useActionState(bound, initialState);
  const [amountRaw, setAmountRaw] = useState(
    order.settlement.overpayment > 0
      ? order.settlement.overpayment.toFixed(2)
      : "",
  );
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.success) return;
    onCancel();
    router.refresh();
  }, [state.success, onCancel, router]);

  const amount = parseRefundAmount(amountRaw);
  const checked =
    amount == null
      ? { error: null as string | null, preview: null }
      : validatePaymentCorrection({
          settlement: order.settlement,
          amount,
        });
  const preview = checked.preview;

  return (
    <form action={formAction} className="border-fog space-y-4 rounded-xl border bg-white p-5">
      <div>
        <h3 className="text-ink text-sm font-semibold">Record refund</h3>
        <p className="text-skyline mt-1 text-sm">
          Records an operational correction. It does not send money through a
          payment gateway. Payment history stays unchanged.
        </p>
      </div>

      {confirming && preview ? (
        <div className="border-fog space-y-2 rounded-lg border bg-mist/30 p-4 text-sm">
          <p className="text-ink font-medium">Confirm this correction</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-skyline">Order</dt>
              <dd className="text-ink font-semibold">{order.orderNumber}</dd>
            </div>
            <div>
              <dt className="text-skyline">Payment received</dt>
              <dd className="text-ink font-semibold">
                {formatRm(preview.paymentReceived)}
              </dd>
            </div>
            <div>
              <dt className="text-skyline">Order amount</dt>
              <dd className="text-ink font-semibold">
                {formatRm(preview.orderAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-skyline">Amount refunded</dt>
              <dd className="text-ink font-semibold">
                {formatRm(preview.refundAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-skyline">Remaining excess</dt>
              <dd className="text-ink font-semibold">
                {formatRm(preview.remainingExcessAfter)}
              </dd>
            </div>
            {reason ? (
              <div className="sm:col-span-2">
                <dt className="text-skyline">Note</dt>
                <dd className="text-ink whitespace-pre-line">{reason}</dd>
              </div>
            ) : null}
          </dl>
          <input name="amount" type="hidden" value={preview.refundAmount.toFixed(2)} />
          <input name="reason" type="hidden" value={reason} />
        </div>
      ) : (
        <>
          <FormField htmlFor="refund_amount" label="Refund amount">
            <FormInput
              id="refund_amount"
              inputMode="decimal"
              max={order.settlement.overpayment.toFixed(2)}
              min="0.01"
              onChange={(event) => {
                setAmountRaw(event.target.value);
                setLocalError(null);
              }}
              step="0.01"
              type="number"
              value={amountRaw}
            />
          </FormField>
          <FormField htmlFor="refund_reason" label="Note / reason">
            <FormTextarea
              id="refund_reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional"
              rows={3}
              value={reason}
            />
          </FormField>
        </>
      )}

      <FormError message={localError ?? checked.error ?? state.error} />

      <FormActions>
        {confirming && preview ? (
          <>
            <FormSubmitButton pending={pending}>
              Confirm refund
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
                if (amount == null || checked.error || !preview) {
                  setLocalError(checked.error ?? "Enter a valid refund amount.");
                  return;
                }
                setLocalError(null);
                setConfirming(true);
              }}
              type="button"
            >
              Review refund
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
