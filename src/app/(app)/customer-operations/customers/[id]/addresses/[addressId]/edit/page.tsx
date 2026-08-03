import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  getCustomerAddressById,
  getCustomerById,
} from "@/workspaces/customer-operations/customers/queries";
import { AddressForm } from "@/workspaces/customer-operations/customers/AddressForm";

export const dynamic = "force-dynamic";

type EditAddressPageProps = {
  params: Promise<{ id: string; addressId: string }>;
};

export default async function EditAddressPage({
  params,
}: EditAddressPageProps) {
  const { id, addressId } = await params;
  const customer = await getCustomerById(id);
  const address = await getCustomerAddressById(addressId);

  if (!customer || !address || address.customerId !== customer.id) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader description={customer.fullName} title="Edit address" />
      <AddressForm
        address={address}
        cancelHref={`/customer-operations/customers/${customer.id}`}
        customerId={customer.id}
        mode="edit"
      />
    </div>
  );
}
