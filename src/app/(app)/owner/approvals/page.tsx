import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessOperationsApprovalsInbox } from "@/engines/operations/approvals";
import { canAccessOperationsBoard } from "@/engines/orders/delivery-finance-capabilities";
import {
  OPERATIONS_APPROVAL_HISTORY_PATH,
  visiblePendingApprovalsForInbox,
} from "@/engines/operations/approval-ux";
import { OperationsApprovalsSection } from "@/workspaces/owner/approvals/OperationsApprovalsSection";
import { staffHasBakeryPreorderApprover } from "@/workspaces/owner/approvals/designations";
import { listPendingOperationsApprovals } from "@/workspaces/owner/approvals/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Pending exception approvals for Owner + Manager.
 * Designated Bakery may review preorder lead-time exceptions only.
 * Does not grant the Operations board, Calendar Owner controls, or EXTRA.
 */
export default async function OperationsApprovalsPage() {
  const staff = await requireStaff();
  const isBakeryPreorderApprover = await staffHasBakeryPreorderApprover(
    staff.id,
  );
  const authority = { isBakeryPreorderApprover };
  if (!canAccessOperationsApprovalsInbox(staff.role.code, authority)) {
    redirect(
      canAccessOperationsBoard(staff.role.code) ? "/owner" : "/home",
    );
  }

  const pendingApprovals = visiblePendingApprovalsForInbox(
    await listPendingOperationsApprovals(),
    staff.role.code,
    authority,
  );
  const backHref = canAccessOperationsBoard(staff.role.code)
    ? "/owner"
    : staff.role.code === "bakery"
      ? "/bakery"
      : "/customer-operations/orders";
  const backLabel = canAccessOperationsBoard(staff.role.code)
    ? "Operations"
    : staff.role.code === "bakery"
      ? "Bakery"
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
        <p className="mt-2">
          <Link
            className="text-signal text-sm font-medium"
            href={OPERATIONS_APPROVAL_HISTORY_PATH}
          >
            Approval History
          </Link>
        </p>
      </div>
      <OperationsApprovalsSection
        approvals={pendingApprovals}
        returnTo="/owner/approvals"
      />
    </div>
  );
}
