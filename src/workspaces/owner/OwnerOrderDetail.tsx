import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { OrderWorkspaceForm } from "@/workspaces/owner/orders/OrderWorkspaceForm";
import { getGuestOrderById } from "@/workspaces/owner/orders/queries";
import type { StorefrontCake } from "@/types/storefront";
import {
  getAvailableCakeById,
  getCurrentCollection,
  listAvailableCakes,
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
  const cakes: StorefrontCake[] = collection
    ? await listAvailableCakes(collection.id)
    : [];

  const orderedCakeId = order.items[0]?.cakeId;
  if (orderedCakeId && !cakes.some((cake) => cake.id === orderedCakeId)) {
    const orderedCake = await getAvailableCakeById(orderedCakeId);
    if (orderedCake) {
      cakes.unshift(orderedCake);
    }
  }

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

      <OrderWorkspaceForm cakes={cakes} order={order} />
    </div>
  );
}
