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
import { parseRefundAmount } from "@/engines/orders/payment-correction";
import {
  isRefundMethod,
  isValidRefundDate,
  REFUND_METHOD_OPTIONS,
  todayMalaysiaDate,
} from "@/engines/orders/refund-recording";
import type { RefundMethodCode, StorefrontOrder } from "@/types/storefront";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  recordRefundAction,
  recordOverpaymentRefundAction,
  type RecordPaymentCorrectionState,
} from "@/workspaces/owner/orders/actions";

const initialState: RecordPaymentCorrectionState = {
  error: null,
  success: false,
};

type RecordRefundFormProps = {
  order: StorefrontOrder;
  kind: "general" | "overpayment";
  onCancel: () => void;
  onSuccess: () => void;
};

export function RecordRefundForm({ order, kind, onCancel, onSuccess }: RecordRefundFormProps) {
  const router = useRouter();
  const refundable = kind === "overpayment"
    ? order.settlement.overpayment
    : order.settlement.remainingRefundable ?? Math.max(0, order.settlement.netReceived);
  const refundAction = kind === "overpayment" ? recordOverpaymentRefundAction : recordRefundAction;
  const bound = refundAction.bind(null, order.id);
  const [state, formAction, pending] = useActionState(bound, initialState);
  const [amountRaw, setAmountRaw] = useState(
    refundable.toFixed(2),
  );
  const [method, setMethod] = useState<RefundMethodCode>("online_transfer");
  const [methodDescription, setMethodDescription] = useState("");
  const [refundedOn, setRefundedOn] = useState(todayMalaysiaDate());
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.success) return;
    onSuccess();
    onCancel();
    router.refresh();
  }, [state.success, onCancel, onSuccess, router]);

  const amount = parseRefundAmount(amountRaw);
  const validationError =
    amount == null
      ? "Enter a positive amount with no more than two decimal places."
      : amount > refundable
        ? `Refund cannot exceed ${formatRm(refundable)}.`
        : !isRefundMethod(method)
          ? "Choose a valid refund method."
          : method === "others" && !methodDescription.trim()
            ? "Describe the other refund method."
            : method !== "others" && methodDescription.trim()
              ? "Remove the method description or choose Other."
              : !isValidRefundDate(refundedOn)
                ? "Choose a valid refund date no later than today."
                : !reason.trim()
                  ? "A refund reason is required."
                  : null;
  const remainingAfter =
    amount == null
      ? refundable
      : Math.max(0, Math.round((refundable - amount) * 100) / 100);

  function reviewRefund() {
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError(null);
    setRequestKey(globalThis.crypto.randomUUID());
    setConfirming(true);
  }

  return (
    <form action={formAction} className="border-fog space-y-4 rounded-xl border bg-white p-5">
      <div>
        <h3 className="text-ink text-sm font-semibold">
          {kind === "overpayment" ? "Refund overpayment" : "Record general refund"}
        </h3>
        <p className="text-skyline mt-1 text-sm">
          {kind === "overpayment"
            ? "Refund only the remaining amount received above the order total. This does not transfer money or change the order."
            : "Record money already returned outside Whitebird. This does not transfer money or change the order."}
        </p>
      </div>

      {!confirming ? (
        <>
          <p className="text-skyline text-sm">
            {kind === "overpayment" ? "Remaining overpayment" : "Remaining refundable from verified payments"}: {formatRm(refundable)}.
          </p>
          <FormField htmlFor="refund_amount" label="Refund amount (RM)">
            <FormInput
              id="refund_amount"
              inputMode="decimal"
              max={refundable.toFixed(2)}
              min="0.01"
              onChange={(event) => setAmountRaw(event.target.value)}
              required
              step="0.01"
              type="number"
              value={amountRaw}
            />
          </FormField>
          <FormField htmlFor="refund_method" label="Refund method">
            <FormSelect
              id="refund_method"
              onChange={(event) => setMethod(event.target.value as RefundMethodCode)}
              value={method}
            >
              {REFUND_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </FormSelect>
          </FormField>
          {method === "others" ? (
            <FormField htmlFor="refund_method_description" label="Other method description">
              <FormInput
                id="refund_method_description"
                maxLength={200}
                onChange={(event) => setMethodDescription(event.target.value)}
                required
                value={methodDescription}
              />
            </FormField>
          ) : null}
          <FormField htmlFor="refund_date" label="Refund date">
            <FormInput
              id="refund_date"
              max={todayMalaysiaDate()}
              onChange={(event) => setRefundedOn(event.target.value)}
              required
              type="date"
              value={refundedOn}
            />
          </FormField>
          <FormField htmlFor="refund_reason" label="Reason">
            <FormTextarea
              id="refund_reason"
              maxLength={2000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required for the audit trail"
              required
              rows={3}
              value={reason}
            />
          </FormField>
        </>
      ) : (
        <div className="border-fog space-y-3 rounded-lg border bg-mist/30 p-4 text-sm">
          <p className="text-ink font-medium">Confirm this refund was already issued.</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div><dt className="text-skyline">Order</dt><dd className="text-ink font-semibold">{order.orderNumber}</dd></div>
            <div><dt className="text-skyline">Refund amount</dt><dd className="text-ink font-semibold">{formatRm(amount ?? 0)}</dd></div>
            <div><dt className="text-skyline">Method</dt><dd className="text-ink font-semibold">{method === "others" ? `Other — ${methodDescription.trim()}` : REFUND_METHOD_OPTIONS.find((item) => item.value === method)?.label}</dd></div>
            <div><dt className="text-skyline">Refund date</dt><dd className="text-ink font-semibold">{refundedOn}</dd></div>
            <div><dt className="text-skyline">{kind === "overpayment" ? "Remaining overpayment" : "Remaining refundable"}</dt><dd className="text-ink font-semibold">{formatRm(remainingAfter)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-skyline">Reason</dt><dd className="text-ink whitespace-pre-line">{reason.trim()}</dd></div>
          </dl>
          <p className="text-skyline">Order status, original payments and order total will remain unchanged.</p>
          <input name="amount" type="hidden" value={amount?.toFixed(2) ?? ""} />
          <input name="method" type="hidden" value={method} />
          <input name="method_description" type="hidden" value={method === "others" ? methodDescription.trim() : ""} />
          <input name="refunded_on" type="hidden" value={refundedOn} />
          <input name="reason" type="hidden" value={reason.trim()} />
          <input name="request_key" type="hidden" value={requestKey} />
        </div>
      )}

      <FormError message={localError ?? state.error ?? (confirming ? null : validationError)} />
      <FormActions>
        {confirming ? (
          <>
          <FormSubmitButton pending={pending}>
            {kind === "overpayment" ? "Confirm overpayment refund" : "Confirm refund recorded"}
          </FormSubmitButton>
            <button className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm" disabled={pending} onClick={() => setConfirming(false)} type="button">Back</button>
          </>
        ) : (
          <>
            <button className="bg-ink text-mist inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium" disabled={pending} onClick={reviewRefund} type="button">Review refund</button>
            <button className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm" disabled={pending} onClick={onCancel} type="button">Cancel</button>
          </>
        )}
      </FormActions>
    </form>
  );
}
