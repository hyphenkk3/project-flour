import Link from "next/link";
import { Breadcrumb, BreadcrumbTrail } from "@/components/ui/Breadcrumb";
import { PageHeader } from "@/components/shell/PageHeader";
import { listCustomers } from "@/workspaces/customer-operations/customers/queries";
import { OrderForm } from "@/workspaces/customer-operations/orders/OrderForm";

export const dynamic = "force-dynamic";

type NewOrderPageProps = {
  searchParams: Promise<{ customerId?: string }>;
};

export default async function NewOrderPage({
  searchParams,
}: NewOrderPageProps) {
  const params = await searchParams;
  const customers = await listCustomers();

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
            { label: "New" },
          ]}
        />
      </BreadcrumbTrail>

      <PageHeader
        description="Capture fulfilment details. Products arrive in Sprint 2."
        title="Create order"
      />

      {customers.length === 0 ? (
        <p className="text-skyline text-sm">
          Add a customer before creating an order.{" "}
          <Link
            className="text-signal font-medium underline-offset-2 hover:underline"
            href="/customer-operations/customers/new"
          >
            Add customer
          </Link>
        </p>
      ) : (
        <OrderForm
          cancelHref="/customer-operations/orders"
          customers={customers}
          defaultCustomerId={params.customerId}
          mode="create"
        />
      )}
    </div>
  );
}
