import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { listCustomers } from "@/workspaces/customer-operations/customers/queries";
import { CustomerDirectory } from "@/workspaces/customer-operations/customers/CustomerDirectory";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await listCustomers();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          description="Find and manage Whitebird customers."
          title="Customers"
        />
        <Link
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition"
          href="/customer-operations/customers/new"
        >
          Add customer
        </Link>
      </div>

      <CustomerDirectory customers={customers} />
    </div>
  );
}
