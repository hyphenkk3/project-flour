"use client";

import { useState, useTransition } from "react";
import { FormField, FormTextarea } from "@/components/ui/form";
import { formatDdMmYyyy } from "@/lib/dates";
import { formatApprovalActorLabel } from "@/engines/operations/approval-ux";
import {
  formatApprovalAge,
  type OperationsApprovalRecord,
} from "@/engines/operations/approvals";
import {
  PREORDER_EXCEPTION_REQUIRED_TITLE as REQUIRED_TITLE,
  pendingPreorderException as pendingExceptionRow,
  preorderExceptionForPickupDate as exceptionForDate,
  preorderExceptionLifecycleLabel as lifecycleLabel,
} from "@/engines/operations/preorder-lead-time-exception";
import {
  createOperationsApprovalAction,
  correctPreorderExceptionCustomerInformedAction,
  markPreorderExceptionCustomerInformedAction,
  withdrawPreorderLeadTimeExceptionAction,
} from "@/workspaces/owner/approvals/actions";

type PreorderLeadTimeExceptionNoticeProps = {
  orderId: string;
  selectedPickupDate: string;
  requiredPreorderDays: number;
  earliestValidDate: string;
  cakes: Array<{ cakeName: string; sizeLabel: string }>;
  pickupTime: string;
  orderPickupDate: string;
  approvals: OperationsApprovalRecord[];
  canRequest: boolean;
  canInform: boolean;
  canWithdraw: boolean;
  canCorrect: boolean;
  onChanged: () => void;
};

export function PreorderLeadTimeExceptionNotice({
  orderId,
  selectedPickupDate,
  requiredPreorderDays,
  earliestValidDate,
  cakes,
  pickupTime,
  orderPickupDate,
  approvals,
  canRequest,
  canInform,
  canWithdraw,
  canCorrect,
  onChanged,
}: PreorderLeadTimeExceptionNoticeProps) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const forDate = exceptionForDate(approvals, selectedPickupDate);
  const pendingAny = pendingExceptionRow(approvals);
  const pendingBlocksOtherDate =
    Boolean(pendingAny) && pendingAny?.id !== forDate?.id;

  function run(
    fn: () => Promise<{ error: string | null; success: boolean }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setReason("");
      setCorrectionNote("");
      onChanged();
    });
  }

  const statusLabel = forDate ? lifecycleLabel(forDate) : REQUIRED_TITLE;
  const requesterLabel = forDate
    ? formatApprovalActorLabel({
        name: forDate.requestedByName,
        roleName: forDate.requestedByRoleName,
      })
    : null;

  const showRequest =
    canRequest &&
    (!forDate || forDate.status === "withdrawn" || forDate.status === "rejected" || forDate.status === "cancelled") &&
    !pendingBlocksOtherDate;

  return (
    <div className="border-status-warning/30 bg-status-warning-soft space-y-3 rounded-lg border px-4 py-3">
      <p className="text-status-warning text-sm font-semibold">{statusLabel}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-skyline">Required preorder</dt>
          <dd className="text-ink">{requiredPreorderDays} days</dd>
        </div>
        <div>
          <dt className="text-skyline">Selected pickup date</dt>
          <dd className="text-ink">{formatDdMmYyyy(selectedPickupDate)}</dd>
        </div>
        <div>
          <dt className="text-skyline">Earliest valid date</dt>
          <dd className="text-ink">{formatDdMmYyyy(earliestValidDate)}</dd>
        </div>
      </dl>
      {forDate?.status === "pending" ? (
        <p className="text-ink text-sm">
          Requested by {requesterLabel} · {formatApprovalAge(forDate.createdAt)}.
          This date cannot be saved until the exception is approved.
        </p>
      ) : null}
      {forDate?.status === "approved" && !forDate.customerInformedAt ? (
        <p className="text-ink text-sm">
          Approved for {formatDdMmYyyy(selectedPickupDate)}. Contact the customer,
          then mark Customer Informed. The exception is not customer-facing until then.
        </p>
      ) : null}
      {forDate?.status === "approved" && forDate.customerInformedAt ? (
        <p className="text-ink text-sm">
          Committed for {formatDdMmYyyy(selectedPickupDate)} after Customer Informed
          {forDate.customerInformedByName
            ? ` by ${forDate.customerInformedByName}`
            : ""}
          .
        </p>
      ) : null}
      {pendingBlocksOtherDate ? (
        <p className="text-ink text-sm">
          A pending preorder exception already exists for this order. Cancel or
          complete it before requesting another date.
        </p>
      ) : null}

      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {showRequest ? (
        <>
          <FormField htmlFor="preorder-exception-reason" label="Reason">
            <FormTextarea
              id="preorder-exception-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why this earlier pickup date is needed"
              rows={2}
              value={reason}
            />
          </FormField>
          <button
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
            disabled={pending || !reason.trim()}
            onClick={() =>
              run(() =>
                createOperationsApprovalAction({
                  orderId,
                  requestType: "preorder_lead_time_exception",
                  reason,
                  payload: {
                    kind: "preorder_lead_time_exception",
                    requestedPickupDate: selectedPickupDate,
                    requiredPreorderDays,
                    orderPickupDate,
                    earliestValidDate,
                    cakes,
                    pickupTime,
                  },
                }),
              )
            }
            type="button"
          >
            {pending ? "Requesting…" : "Request exception"}
          </button>
        </>
      ) : null}

      {forDate?.status === "approved" && !forDate.customerInformedAt ? (
        <div className="flex flex-wrap gap-2">
          {canInform ? (
            <button
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
              disabled={pending}
              onClick={() =>
                run(() =>
                  markPreorderExceptionCustomerInformedAction(
                    forDate.id,
                    orderId,
                  ),
                )
              }
              type="button"
            >
              {pending ? "Working…" : "Customer Informed"}
            </button>
          ) : null}
          {canWithdraw ? (
            <button
              className="border-fog text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium disabled:opacity-60"
              disabled={pending}
              onClick={() =>
                run(() =>
                  withdrawPreorderLeadTimeExceptionAction(forDate.id, orderId),
                )
              }
              type="button"
            >
              Withdraw
            </button>
          ) : null}
        </div>
      ) : null}

      {forDate?.status === "approved" && forDate.customerInformedAt && canCorrect ? (
        <div className="space-y-2">
          <FormField
            htmlFor="preorder-exception-correction"
            label="Manager/Owner correction note"
          >
            <FormTextarea
              id="preorder-exception-correction"
              onChange={(event) => setCorrectionNote(event.target.value)}
              placeholder="Why Customer Informed must be cleared"
              rows={2}
              value={correctionNote}
            />
          </FormField>
          <button
            className="border-fog text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium disabled:opacity-60"
            disabled={pending || !correctionNote.trim()}
            onClick={() =>
              run(() =>
                correctPreorderExceptionCustomerInformedAction(
                  forDate.id,
                  orderId,
                  correctionNote,
                ),
              )
            }
            type="button"
          >
            Correct Customer Informed
          </button>
        </div>
      ) : null}
    </div>
  );
}
