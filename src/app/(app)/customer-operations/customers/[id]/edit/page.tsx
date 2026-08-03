import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { getCustomerById } from "@/workspaces/customer-operations/customers/queries";
import { CustomerForm } from "@/workspaces/customer-operations/customers/CustomerForm";

export const dynamic = "force-dynamic";

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({
  params,
}: EditCustomerPageProps) {
  const { id } = await params;
  const customer = await getCustomerById(id);

  if (!customer) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader description={customer.fullName} title="Edit customer" />
      <CustomerForm
        cancelHref={`/customer-operations/customers/${customer.id}`}
        customer={customer}
        mode="edit"
      />
    </div>
  );
}
