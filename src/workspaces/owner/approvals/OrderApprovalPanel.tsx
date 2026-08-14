"use client";

import { useState, useTransition } from "react";
import { buildApprovalChangeSummary } from "@/engines/operations/approval-change-summary";
import {
  approvalTypeLabel,
  formatApprovalAge,
  type OperationsApprovalRecord,
} from "@/engines/operations/approvals";
import { formatDateTime } from "@/lib/dates";
import {
  approveOperationsApprovalAction,
  cancelOperationsApprovalAction,
  rejectOperationsApprovalAction,
} from "@/workspaces/owner/approvals/actions";
import { FormField, FormTextarea } from "@/components/ui/form";

type OrderApprovalPanelProps = {
  request: OperationsApprovalRecord;
  orderNumber: string;
  customerName: string;
  canReview: boolean;
  canCancel: boolean;
  highlighted?: boolean;
};

export function OrderApprovalPanel({
  request,
  orderNumber,
  customerName,
  canReview,
  canCancel,
  highlighted = false,
}: OrderApprovalPanelProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);

  const payload = request.payload;
  const isPending = request.status === "pending";
  const summary = buildApprovalChangeSummary(payload);

  function run(
    fn: () => Promise<{ error: string | null; success: boolean }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
    });
  }

  return (
    <section
      className={
        highlighted
          ? "border-signal bg-signal/5 ring-signal/20 space-y-3 rounded-xl border-2 p-5 ring-2"
          : "border-status-warning/30 bg-status-warning-soft space-y-3 rounded-xl border p-5"
      }
      id={`approval-${request.id}`}
    >
      <p className="text-status-warning text-xs font-semibold tracking-[0.14em] uppercase">
        {isPending ? "Approval requested" : `Approval ${request.status}`}
      </p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-skyline">Order</dt>
          <dd className="text-ink font-medium">{orderNumber}</dd>
        </div>
        <div>
          <dt className="text-skyline">Customer</dt>
          <dd className="text-ink font-medium">{customerName}</dd>
        </div>
        <div>
          <dt className="text-skyline">Requested by</dt>
          <dd className="text-ink">
            {request.requestedByName ?? "Staff"} ·{" "}
            {formatApprovalAge(request.createdAt)}
          </dd>
        </div>
        <div>
          <dt className="text-skyline">Request</dt>
          <dd className="text-ink">{approvalTypeLabel(request.requestType)}</dd>
        </div>
      </dl>

      {summary.lines.length > 0 ? (
        <div>
          <p className="text-skyline text-xs font-semibold tracking-[0.14em] uppercase">
            Change requested
          </p>
          {summary.lines.length === 1 ? (
            <p className="text-ink text-sm font-medium">{summary.lines[0]}</p>
          ) : (
            <ul className="text-ink list-disc space-y-1 pl-5 text-sm font-medium">
              {summary.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {summary.currentLines.length > 0 ? (
        <div>
          <p className="text-skyline text-xs font-semibold tracking-[0.14em] uppercase">
            Current
          </p>
          <div className="text-ink text-sm whitespace-pre-wrap">
            {summary.currentLines.join("\n")}
          </div>
        </div>
      ) : null}

      {summary.requestedLines.length > 0 ? (
        <div>
          <p className="text-skyline text-xs font-semibold tracking-[0.14em] uppercase">
            Requested
          </p>
          <div className="text-ink text-sm whitespace-pre-wrap">
            {summary.requestedLines.join("\n")}
          </div>
        </div>
      ) : null}

      <div>
        <p className="text-skyline text-xs font-semibold tracking-[0.14em] uppercase">
          Reason
        </p>
        <p className="text-ink text-sm whitespace-pre-wrap">{request.reason}</p>
      </div>

      {!isPending && request.reviewedAt ? (
        <p className="text-ink text-sm">
          {request.status === "approved"
            ? "Approved"
            : request.status === "rejected"
              ? "Rejected"
              : "Cancelled"}{" "}
          by {request.reviewedByName ?? "Staff"} ·{" "}
          {formatDateTime(request.reviewedAt)}
        </p>
      ) : null}

      {request.reviewerNote && !isPending ? (
        <p className="text-ink text-sm">
          {request.status === "rejected" ? "Rejection note" : "Reviewer note"}:{" "}
          {request.reviewerNote}
        </p>
      ) : null}

      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {isPending && canReview ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() =>
              run(() =>
                approveOperationsApprovalAction(request.id, request.orderId),
              )
            }
            type="button"
          >
            {pending ? "Working…" : "Approve"}
          </button>
          <button
            className="border-fog text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() => setShowReject(true)}
            type="button"
          >
            Reject
          </button>
        </div>
      ) : null}

      {isPending && showReject && canReview ? (
        <div className="space-y-2">
          <FormField htmlFor={`reject-note-${request.id}`} label="Rejection note">
            <FormTextarea
              id={`reject-note-${request.id}`}
              onChange={(event) => setRejectNote(event.target.value)}
              placeholder="Required"
              rows={2}
              value={rejectNote}
            />
          </FormField>
          <button
            className="bg-status-danger text-mist inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
            disabled={pending || !rejectNote.trim()}
            onClick={() =>
              run(() =>
                rejectOperationsApprovalAction(
                  request.id,
                  request.orderId,
                  rejectNote,
                ),
              )
            }
            type="button"
          >
            Confirm reject
          </button>
        </div>
      ) : null}

      {isPending && canCancel ? (
        <button
          className="text-skyline hover:text-ink text-sm font-medium disabled:opacity-60"
          disabled={pending}
          onClick={() =>
            run(() =>
              cancelOperationsApprovalAction(request.id, request.orderId),
            )
          }
          type="button"
        >
          Cancel request
        </button>
      ) : null}
    </section>
  );
}
