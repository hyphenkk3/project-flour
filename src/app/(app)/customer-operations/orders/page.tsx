import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Breadcrumb, BreadcrumbTrail } from "@/components/ui/Breadcrumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { listOrders } from "@/workspaces/customer-operations/orders/queries";
import { OrderDirectory } from "@/workspaces/customer-operations/orders/OrderDirectory";
import { OrderSummaryCards } from "@/workspaces/customer-operations/orders/OrderSummaryCards";

export const dynamic = "force-dynamic";

async function OrdersContent() {
  let orders;

  try {
    orders = await listOrders();
  } catch {
    return (
      <EmptyState
        compact
        description="Orders could not be loaded. Confirm the Order Foundation migration is applied, then try again."
        title="Unable to load orders."
      />
    );
  }

  return (
    <>
      <OrderSummaryCards orders={orders} />
      <OrderDirectory orders={orders} />
    </>
  );
}

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <BreadcrumbTrail>
        <Breadcrumb
          items={[
            {
              label: "Customer Operations",
              href: "/customer-operations/customers",
            },
            { label: "Orders" },
          ]}
        />
      </BreadcrumbTrail>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          description="Create and manage Whitebird orders."
          title="Orders"
        />
        <Link
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition"
          href="/customer-operations/orders/new"
        >
          Create order
        </Link>
      </div>

      <Suspense fallback={<PageSkeleton cards={3} />}>
        <OrdersContent />
      </Suspense>
    </div>
  );
}
