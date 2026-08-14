import { requireStaff } from "@/foundation/auth/session";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import type { OperationsBoardQuery } from "@/engines/operations/order-board";
import { OperationsLiveBoard } from "@/workspaces/owner/OperationsLiveBoard";
import { listGuestOrders } from "@/workspaces/owner/orders/queries";
import { listPendingOperationsApprovals } from "@/workspaces/owner/approvals/queries";

export const dynamic = "force-dynamic";

export async function OwnerDashboard({
  initialQuery,
}: {
  initialQuery?: OperationsBoardQuery;
}) {
  const staff = await requireStaff();
  const capabilities = buildGuestOrderWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  const orders = await listGuestOrders();
  const pendingApprovals = await listPendingOperationsApprovals();
  return (
    <OperationsLiveBoard
      initialOrders={orders}
      initialQuery={initialQuery}
      pendingApprovals={pendingApprovals}
      showOwnerBoardTools={capabilities.canUseOwnerBoardTools}
    />
  );
}
