import { requireStaff } from "@/foundation/auth/session";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";
import {
  buildGuestOrderWorkspaceCapabilities,
  canAccessOperationsBoard,
  canViewWholeCakeCalendar,
} from "@/engines/orders/delivery-finance-capabilities";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";
import { canAccessCollectionWorkspace } from "@/engines/collection/capabilities";
import { homePendingApprovalsHref } from "@/engines/operations/approval-ux";
import { operationsTodayYmd } from "@/engines/operations/order-board";
import { listPendingOperationsApprovals } from "@/workspaces/owner/approvals/queries";
import { listGuestOrders } from "@/workspaces/owner/orders/queries";
import { listBakeryBoardOrders } from "@/workspaces/bakery/queries";
import {
  listCollectionBoardOrders,
  listCollectionCompletedOrders,
  listCollectionDineInOrders,
} from "@/workspaces/collection/queries";
import { buildHomeCockpitModel } from "@/workspaces/home/cockpit-model";
import { HomeCockpit } from "@/workspaces/home/HomeCockpit";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const staff = await requireStaff();
  const role = staff.role.code;
  const navigation = getNavigationForRole(role);
  const capabilities = buildGuestOrderWorkspaceCapabilities({
    role,
    staffId: staff.id,
  });
  const todayYmd = operationsTodayYmd();

  const canOps = canAccessOperationsBoard(role);
  const canGuestWorkspace = capabilities.canAccessGuestOrderWorkspace;
  const canCollection = canAccessCollectionWorkspace(role);
  const canBakery = canAccessBakeryWorkspace(role);
  const canCalendar = canViewWholeCakeCalendar(role);
  const canApprovals =
    capabilities.canReviewOperationsApprovals ||
    capabilities.canRequestOperationsApproval;

  const shouldLoadOrders = canOps || canGuestWorkspace || canCollection;
  const shouldLoadApprovals = canApprovals || canOps;

  const [
    orders,
    readyCollection,
    completedCollection,
    dineInCollection,
    bakeryOrders,
    pendingApprovals,
  ] = await Promise.all([
    shouldLoadOrders ? listGuestOrders() : Promise.resolve([]),
    canCollection
      ? listCollectionBoardOrders(todayYmd)
      : Promise.resolve([]),
    canCollection
      ? listCollectionCompletedOrders(todayYmd)
      : Promise.resolve([]),
    canCollection
      ? listCollectionDineInOrders(todayYmd)
      : Promise.resolve([]),
    canBakery || canCalendar
      ? listBakeryBoardOrders(todayYmd)
      : Promise.resolve([]),
    shouldLoadApprovals
      ? listPendingOperationsApprovals()
      : Promise.resolve([]),
  ]);

  const model = buildHomeCockpitModel({
    orders,
    readyCollection,
    completedCollection,
    dineInCollection,
    bakeryOrders,
    pendingApprovals,
    navigation,
  });

  return (
    <HomeCockpit
      canAccessApprovals={canApprovals}
      pendingApprovalsHref={homePendingApprovalsHref(role)}
      canAccessBakery={canBakery}
      canAccessCalendar={canCalendar}
      canAccessCollection={canCollection}
      canAccessOperations={canOps}
      knownGuestOrderIds={orders.map((order) => order.id)}
      model={model}
      preferCalendarScheduleCta={role === "owner"}
      roleName={staff.role.name}
      staffDisplayName={staff.displayName}
      staffId={staff.id}
    />
  );
}
