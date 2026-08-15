import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessOperationsApprovalHistory } from "@/engines/operations/approval-ux";
import { canAccessOperationsApprovalsInbox } from "@/engines/operations/approvals";
import { canAccessOperationsBoard } from "@/engines/orders/delivery-finance-capabilities";
import {
  APPROVAL_HISTORY_RETURN_POSITION_PARAM,
  APPROVAL_HISTORY_RETURN_POSITION_VALUE,
} from "@/workspaces/owner/approvals/approval-history-return-position";
import { OperationsApprovalHistory } from "@/workspaces/owner/approvals/OperationsApprovalHistory";
import { listOperationsApprovals } from "@/workspaces/owner/approvals/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ rp?: string }>;
};

/**
 * Read-only Approval History from existing operations_approval_requests.
 * Does not grant review authority or the Operations board.
 */
export default async function OperationsApprovalHistoryPage({
  searchParams,
}: PageProps) {
  const staff = await requireStaff();
  if (!canAccessOperationsApprovalHistory(staff.role.code)) {
    redirect(
      canAccessOperationsBoard(staff.role.code) ? "/owner" : "/home",
    );
  }

  const params = await searchParams;
  const restorePosition =
    params[APPROVAL_HISTORY_RETURN_POSITION_PARAM] ===
    APPROVAL_HISTORY_RETURN_POSITION_VALUE;

  const approvals = await listOperationsApprovals();
  const backHref = canAccessOperationsBoard(staff.role.code)
    ? "/owner"
    : canAccessOperationsApprovalsInbox(staff.role.code)
      ? "/owner/approvals"
      : "/customer-operations/orders";
  const backLabel = canAccessOperationsBoard(staff.role.code)
    ? "Operations"
    : canAccessOperationsApprovalsInbox(staff.role.code)
      ? "Approvals"
      : "Customer Operations";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={backHref}
        >
          ← {backLabel}
        </Link>
        <PageHeader title="Approval History" />
        <p className="text-skyline -mt-2 text-sm">
          Approved, rejected, cancelled, and pending requests from existing
          approval records.
        </p>
        {canAccessOperationsApprovalsInbox(staff.role.code) ? (
          <p className="mt-2">
            <Link
              className="text-signal text-sm font-medium"
              href="/owner/approvals"
            >
              Pending approvals
            </Link>
          </p>
        ) : null}
      </div>
      <OperationsApprovalHistory
        approvals={approvals}
        restorePosition={restorePosition}
      />
    </div>
  );
}
