import { OperationsLiveBoard } from "@/workspaces/owner/OperationsLiveBoard";
import { listGuestOrders } from "@/workspaces/owner/orders/queries";

export const dynamic = "force-dynamic";

export async function OwnerDashboard() {
  const orders = await listGuestOrders();
  return <OperationsLiveBoard initialOrders={orders} />;
}
