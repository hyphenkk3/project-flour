import { requireStaff } from "@/foundation/auth/session";
import { loadStaffNotificationPreferences } from "@/foundation/staff/notification-preferences-queries";
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

  const notificationPreferences =
    await loadStaffNotificationPreferences(staff.id);

  const notificationPreference = notificationPreferences.find(
    (preference) => preference.code === "guest_preorder",
  );

  if (!notificationPreference) {
    throw new Error("Guest preorder notification preference is unavailable.");
  }
  const capabilities = buildGuestOrderWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  const orders = await listGuestOrders();
  const pendingApprovals = await listPendingOperationsApprovals();
  return (
    <OperationsLiveBoard
      initialOrders={orders}
      notificationPreference={notificationPreference}
      initialQuery={initialQuery}
      pendingApprovals={pendingApprovals}
      showOwnerBoardTools={capabilities.canUseOwnerBoardTools}
    />
  );
}
