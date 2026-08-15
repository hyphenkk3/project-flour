"use client";

import { useState, useTransition } from "react";
import type { OperationsApprovalRecord } from "@/engines/operations/approvals";
import {
  CANCEL_PENDING_APPROVAL_LABEL,
  PENDING_LATE_EDIT_ALREADY_BODY,
  PENDING_LATE_EDIT_ALREADY_TITLE,
  VIEW_PENDING_APPROVAL_LABEL,
  approvalPanelDomId,
} from "@/engines/operations/approval-ux";
import { cancelOperationsApprovalAction } from "@/workspaces/owner/approvals/actions";
import { scrollWorkspaceSectionIntoView } from "@/workspaces/owner/orders/scroll-workspace-section";

type PendingLateOrderEditNoticeProps = {
  request: OperationsApprovalRecord;
  canCancel: boolean;
};

export function PendingLateOrderEditNotice({
  request,
  canCancel,
}: PendingLateOrderEditNoticeProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function viewPending() {
    scrollWorkspaceSectionIntoView(approvalPanelDomId(request.id), {
      focus: true,
    });
  }

  function cancelPending() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOperationsApprovalAction(
        request.id,
        request.orderId,
      );
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-status-warning text-sm font-semibold tracking-wide uppercase">
        {PENDING_LATE_EDIT_ALREADY_TITLE}
      </p>
      <p className="text-ink text-sm">{PENDING_LATE_EDIT_ALREADY_BODY}</p>
      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium"
          onClick={viewPending}
          type="button"
        >
          {VIEW_PENDING_APPROVAL_LABEL}
        </button>
        {canCancel ? (
          <button
            className="border-fog text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={cancelPending}
            type="button"
          >
            {pending ? "Cancelling…" : CANCEL_PENDING_APPROVAL_LABEL}
          </button>
        ) : null}
      </div>
    </div>
  );
}
