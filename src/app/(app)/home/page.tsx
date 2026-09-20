import { requireStaff } from "@/foundation/auth/session";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";
import {
  buildGuestOrderWorkspaceCapabilities,
  canAccessOperationsBoard,
  canViewWholeCakeCalendar,
} from "@/engines/orders/delivery-finance-capabilities";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";
import { canAccessCollectionWorkspace } from "@/engines/collection/capabilities";
import {
  buildExtraWorkspaceCapabilities,
  canSeeHomeFreshPicks,
} from "@/engines/extra/capabilities";
import { homePendingApprovalsHref, visiblePendingApprovalsForInbox } from "@/engines/operations/approval-ux";
import { staffHasBakeryPreorderApprover } from "@/workspaces/owner/approvals/designations";
import { operationsTodayYmd } from "@/engines/operations/order-board";
import { listPendingOperationsApprovals } from "@/workspaces/owner/approvals/queries";
import { listGuestOrders } from "@/workspaces/owner/orders/queries";
import { listBakeryBoardOrders } from "@/workspaces/bakery/queries";
import {
  listCollectionBoardOrders,
  listCollectionCompletedOrders,
  listCollectionDineInOrders,
} from "@/workspaces/collection/queries";
import { listHomeFreshPickUnits } from "@/workspaces/extra/queries";
import { buildHomeCockpitModel } from "@/workspaces/home/cockpit-model";
import { HomeCockpit } from "@/workspaces/home/HomeCockpit";
import { canViewWaitingList } from "@/engines/waiting-list/capabilities";
import { listHomeWaitingListAttention } from "@/workspaces/waiting-list/queries";

export const dynamic = "force-dynamic";

async function loadHomeFreshPicks(enabled: boolean) {
  if (!enabled) return { units: [], error: false };
  try {
    return { units: await listHomeFreshPickUnits(), error: false };
  } catch {
    return { units: [], error: true };
  }
}

export default async function HomePage() {
  const staff = await requireStaff();
  const role = staff.role.code;
  const navigation = getNavigationForRole(role);
  const isBakeryPreorderApprover = await staffHasBakeryPreorderApprover(
    staff.id,
  );
  const capabilities = buildGuestOrderWorkspaceCapabilities({
    role,
    staffId: staff.id,
    isBakeryPreorderApprover,
  });
  const approvalAuthority = { isBakeryPreorderApprover };
  const todayYmd = operationsTodayYmd();

  const canOps = canAccessOperationsBoard(role);
  const canGuestWorkspace = capabilities.canAccessGuestOrderWorkspace;
  const canCollection = canAccessCollectionWorkspace(role);
  const canBakery = canAccessBakeryWorkspace(role);
  const canCalendar = canViewWholeCakeCalendar(role);
  const canApprovals =
    capabilities.canReviewOperationsApprovals ||
    capabilities.canRequestOperationsApproval;
  const extraCapabilities = buildExtraWorkspaceCapabilities({
    role,
    staffId: staff.id,
  });
  const showHomeFreshPicks = canSeeHomeFreshPicks(extraCapabilities);

  const shouldLoadOrders = canOps || canGuestWorkspace || canCollection;
  const shouldLoadApprovals = canApprovals || canOps;

  const [
    orders,
    readyCollection,
    completedCollection,
    dineInCollection,
    bakeryOrders,
    pendingApprovals,
    freshPicks,
    waitingListAttention,
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
    loadHomeFreshPicks(showHomeFreshPicks),
    canViewWaitingList(role)
      ? listHomeWaitingListAttention()
      : Promise.resolve(null),
  ]);

  const visiblePendingApprovals = visiblePendingApprovalsForInbox(
    pendingApprovals,
    role,
    approvalAuthority,
  );

  const model = buildHomeCockpitModel({
    orders,
    readyCollection,
    completedCollection,
    dineInCollection,
    bakeryOrders,
    pendingApprovals: visiblePendingApprovals,
    navigation,
    canPrepareConfirmation: capabilities.canPrepareConfirmation,
  });

  return (
    <HomeCockpit
      canAccessApprovals={canApprovals}
      pendingApprovalsHref={homePendingApprovalsHref(role, approvalAuthority)}
      canAccessBakery={canBakery}
      canAccessCalendar={canCalendar}
      canAccessCollection={canCollection}
      canAccessOperations={canOps}
      model={model}
      extraCapabilities={showHomeFreshPicks ? extraCapabilities : null}
      freshPickLoadError={freshPicks.error}
      freshPickUnits={freshPicks.units}
      canViewWaitingList={canViewWaitingList(role)}
      waitingListAttention={waitingListAttention}
      preferCalendarScheduleCta={role === "owner"}
      roleName={staff.role.name}
      staffDisplayName={staff.displayName}
    />
  );
}
