import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Breadcrumb, BreadcrumbTrail } from "@/components/ui/Breadcrumb";
import { listCustomers } from "@/workspaces/customer-operations/customers/queries";
import { getOrderById } from "@/workspaces/customer-operations/orders/queries";
import { OrderForm } from "@/workspaces/customer-operations/orders/OrderForm";

export const dynamic = "force-dynamic";

type EditOrderPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditOrderPage({ params }: EditOrderPageProps) {
  const { id } = await params;
  const [order, customers] = await Promise.all([
    getOrderById(id),
    listCustomers(),
  ]);

  if (!order) {
    notFound();
  }

  if (order.status === "cancelled" || order.status === "completed") {
    notFound();
  }

  return (
    <div className="space-y-6">
      <BreadcrumbTrail>
        <Breadcrumb
          items={[
            {
              label: "Customer Operations",
              href: "/customer-operations/customers",
            },
            { label: "Orders", href: "/customer-operations/orders" },
            {
              label: order.orderNumber,
              href: `/customer-operations/orders/${order.id}`,
            },
            { label: "Edit" },
          ]}
        />
      </BreadcrumbTrail>

      <PageHeader description={order.orderNumber} title="Edit order" />

      <OrderForm
        cancelHref={`/customer-operations/orders/${order.id}`}
        customers={customers}
        mode="edit"
        order={order}
      />
    </div>
  );
}
