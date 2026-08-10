import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { withCalendarReturnPositionFlag } from "@/workspaces/owner/calendar/calendar-return-position";
import { resolveOwnerReturnTo } from "@/workspaces/owner/navigation/return-to";
import { OrderWorkspaceForm } from "@/workspaces/owner/orders/OrderWorkspaceForm";
import {
  getGuestOrderById,
  listActivePaidAddonTypes,
  listCollectionComplimentaryOptions,
  listConfirmationSnapshots,
  listOrderTimeline,
} from "@/workspaces/owner/orders/queries";
import {
  getAvailableCakeById,
  getCurrentCollection,
  listOfferableLibraryCakes,
} from "@/workspaces/storefront/catalog/queries";

export const dynamic = "force-dynamic";

type OwnerOrderDetailProps = {
  orderId: string;
  returnTo?: string;
};

export async function OwnerOrderDetail({
  orderId,
  returnTo,
}: OwnerOrderDetailProps) {
  const staff = await requireStaff();
  if (staff.role.code !== "owner") {
    notFound();
  }

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
  const back = resolveOwnerReturnTo(returnTo);
  const safeReturnTo =
    back.label === "Whole Cake Calendar" ? back.href : null;
  const backHref =
    back.label === "Whole Cake Calendar"
      ? withCalendarReturnPositionFlag(back.href)
      : back.href;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={backHref}
          scroll={back.label === "Whole Cake Calendar" ? false : undefined}
        >
          ← {back.label}
        </Link>
        <PageHeader title="Order Workspace" />
        <p className="text-skyline -mt-2 text-sm">{order.customerName}</p>
      </div>

      <OrderWorkspaceForm
        cakes={cakes}
        complimentaryOptions={complimentaryOptions}
        confirmations={confirmations}
        order={order}
        paidAddonCatalog={paidAddonCatalog}
        returnTo={safeReturnTo}
        staffDisplayName={staff.displayName}
        timeline={timeline}
      />
    </div>
  );
}
