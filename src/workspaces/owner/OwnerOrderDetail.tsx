import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import {
  buildGuestOrderWorkspaceCapabilities,
  canAccessGuestOrderWorkspace,
} from "@/engines/orders/delivery-finance-capabilities";
import { withApprovalHistoryReturnPositionFlag } from "@/workspaces/owner/approvals/approval-history-return-position";
import { withCalendarReturnPositionFlag } from "@/workspaces/owner/calendar/calendar-return-position";
import {
  resolveOwnerReturnTo,
  shouldPropagateOwnerReturnTo,
} from "@/workspaces/owner/navigation/return-to";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import { OrderWorkspaceForm } from "@/workspaces/owner/orders/OrderWorkspaceForm";
import {
  getGuestOrderById,
  listActivePaidAddonTypes,
  listCollectionComplimentaryOptions,
  listConfirmationSnapshots,
  listOrderTimeline,
} from "@/workspaces/owner/orders/queries";
import { listApprovalsForOrder } from "@/workspaces/owner/approvals/queries";
import {
  getAvailableCakeById,
  getCurrentCollection,
  listOfferableLibraryCakes,
} from "@/workspaces/storefront/catalog/queries";

export const dynamic = "force-dynamic";

type OwnerOrderDetailProps = {
  orderId: string;
  returnTo?: string;
  approvalId?: string;
};

export async function OwnerOrderDetail({
  orderId,
  returnTo,
  approvalId,
}: OwnerOrderDetailProps) {
  const staff = await requireStaff();
  if (!canAccessGuestOrderWorkspace(staff.role.code)) {
    notFound();
  }

  const capabilities = buildGuestOrderWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });

  const order = await getGuestOrderById(orderId);
  if (!order) {
    notFound();
  }

  const collection = await getCurrentCollection();
  const cakes = await listOfferableLibraryCakes();

  for (const item of order.items) {
    if (!cakes.some((cake) => cake.id === item.cakeId)) {
      const orderedCake = await getAvailableCakeById(item.cakeId);
      if (orderedCake) {
        cakes.unshift(orderedCake);
      }
    }
  }

  const complimentaryCollectionId = order.collectionId ?? collection?.id;
  const complimentaryOptions = complimentaryCollectionId
    ? await listCollectionComplimentaryOptions(complimentaryCollectionId)
    : [];

  let paidAddonCatalog: Awaited<ReturnType<typeof listActivePaidAddonTypes>> =
    [];
  try {
    paidAddonCatalog = await listActivePaidAddonTypes();
  } catch {
    paidAddonCatalog = [];
  }

  const timeline = await listOrderTimeline(orderId);
  const confirmations = await listConfirmationSnapshots(orderId);
  const approvals = await listApprovalsForOrder(orderId);
  const hoursSnapshot = await loadOperatingHoursSnapshot();
  const back = resolveOwnerReturnTo(returnTo);
  const safeReturnTo = shouldPropagateOwnerReturnTo(back) ? back.href : null;
  const backHref =
    back.label === "Whole Cake Calendar"
      ? withCalendarReturnPositionFlag(back.href)
      : back.label === "Approval History"
        ? withApprovalHistoryReturnPositionFlag(back.href)
        : back.label === "Approvals" || back.label === "Home"
          ? back.href
          : capabilities.canAccessOperationsBoard
            ? back.href
            : capabilities.canReviewOperationsApprovals
              ? "/owner/approvals"
              : "/customer-operations/orders";
  const backLabel =
    back.label === "Whole Cake Calendar" ||
    back.label === "Approval History" ||
    back.label === "Approvals" ||
    back.label === "Home"
      ? back.label
      : capabilities.canAccessOperationsBoard
        ? "Operations"
        : capabilities.canReviewOperationsApprovals
          ? "Approvals"
          : "Customer Operations";
  const preserveReturnScroll =
    back.label === "Whole Cake Calendar" ||
    back.label === "Approval History";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={backHref}
          scroll={preserveReturnScroll ? false : undefined}
        >
          ← {backLabel}
        </Link>
        <PageHeader title="Order Workspace" />
        <p className="text-skyline -mt-2 text-sm">{order.customerName}</p>
      </div>

      <OrderWorkspaceForm
        approvals={approvals}
        cakes={cakes}
        capabilities={capabilities}
        complimentaryOptions={complimentaryOptions}
        confirmations={confirmations}
        highlightApprovalId={approvalId ?? null}
        hoursSnapshot={hoursSnapshot}
        order={order}
        paidAddonCatalog={paidAddonCatalog}
        returnTo={safeReturnTo}
        staffDisplayName={staff.displayName}
        timeline={timeline}
      />
    </div>
  );
}
