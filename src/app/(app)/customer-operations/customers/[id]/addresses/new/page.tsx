import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { getCustomerById } from "@/workspaces/customer-operations/customers/queries";
import { AddressForm } from "@/workspaces/customer-operations/customers/AddressForm";

export const dynamic = "force-dynamic";

type NewAddressPageProps = {
  params: Promise<{ id: string }>;
};

export default async function NewAddressPage({ params }: NewAddressPageProps) {
  const { id } = await params;
  const customer = await getCustomerById(id);

  if (!customer) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader description={customer.fullName} title="Add address" />
      <AddressForm
        cancelHref={`/customer-operations/customers/${customer.id}`}
        customerId={customer.id}
        mode="create"
      />
    </div>
  );
}
