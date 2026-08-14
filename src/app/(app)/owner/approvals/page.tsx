import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessOperationsApprovalsInbox } from "@/engines/operations/approvals";
import { canAccessOperationsBoard } from "@/engines/orders/delivery-finance-capabilities";
import { OperationsApprovalsSection } from "@/workspaces/owner/approvals/OperationsApprovalsSection";
import { listPendingOperationsApprovals } from "@/workspaces/owner/approvals/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Pending exception approvals for Owner + Manager.
 * Does not grant the Operations board, Calendar Owner controls, or EXTRA.
 */
export default async function OperationsApprovalsPage() {
  const staff = await requireStaff();
  if (!canAccessOperationsApprovalsInbox(staff.role.code)) {
    redirect(
      canAccessOperationsBoard(staff.role.code) ? "/owner" : "/home",
    );
  }

  const pendingApprovals = await listPendingOperationsApprovals();
  const backHref = canAccessOperationsBoard(staff.role.code)
    ? "/owner"
    : "/customer-operations/orders";
  const backLabel = canAccessOperationsBoard(staff.role.code)
    ? "Operations"
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
        <PageHeader title="Approvals" />
        <p className="text-skyline -mt-2 text-sm">
          Review Customer Operations exception requests. Approval applies the
          exact requested change.
        </p>
      </div>
      <OperationsApprovalsSection approvals={pendingApprovals} />
    </div>
  );
}
