import { PageHeader } from "@/components/shell/PageHeader";
import { CustomerForm } from "@/workspaces/customer-operations/customers/CustomerForm";

export const dynamic = "force-dynamic";

export default function NewCustomerPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Capture name and at least one contact method."
        title="Add customer"
      />
      <CustomerForm cancelHref="/customer-operations/customers" mode="create" />
    </div>
  );
}
