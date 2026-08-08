import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { OrderWorkspaceForm } from "@/workspaces/owner/orders/OrderWorkspaceForm";
import {
  getGuestOrderById,
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
};

export async function OwnerOrderDetail({ orderId }: OwnerOrderDetailProps) {
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

  const timeline = await listOrderTimeline(orderId);
  const confirmations = await listConfirmationSnapshots(orderId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href="/owner"
        >
          ← Operations
        </Link>
        <PageHeader title="Order Workspace" />
        <p className="text-skyline -mt-2 text-sm">{order.customerName}</p>
      </div>

      <OrderWorkspaceForm
        cakes={cakes}
        complimentaryOptions={complimentaryOptions}
        confirmations={confirmations}
        order={order}
        timeline={timeline}
      />
    </div>
  );
}
