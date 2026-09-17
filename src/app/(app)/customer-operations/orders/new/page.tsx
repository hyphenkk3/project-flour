import Link from "next/link";
import { Breadcrumb, BreadcrumbTrail } from "@/components/ui/Breadcrumb";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canOverrideCustomerFulfilmentSchedule } from "@/engines/orders/delivery-finance-capabilities";
import { listCustomers } from "@/workspaces/customer-operations/customers/queries";
import { AssistedOrderForm } from "@/workspaces/customer-operations/orders/AssistedOrderForm";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import { listOfferableLibraryCakes } from "@/workspaces/storefront/catalog/queries";
import { listClosedPickupOrderDates } from "@/workspaces/storefront/checkout/order-availability";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import { addBusinessCalendarDays } from "@/lib/dates";

export const dynamic = "force-dynamic";

type NewOrderPageProps = {
  searchParams: Promise<{ customerId?: string }>;
};

export default async function NewOrderPage({
  searchParams,
}: NewOrderPageProps) {
  const params = await searchParams;
  const staff = await requireStaff();
  const earliest = earliestPickupDateYmd();
  const rangeMax = addBusinessCalendarDays(earliest, 120) ?? earliest;
  const [customers, cakes, hoursSnapshot, closedDates] = await Promise.all([
    listCustomers(),
    listOfferableLibraryCakes(),
    loadOperatingHoursSnapshot(),
    listClosedPickupOrderDates(earliest, rangeMax),
  ]);

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
        description="Create an assisted order from an existing customer. Servicing continues in the order workspace."
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
        <AssistedOrderForm
          cakes={cakes}
          canOverrideCustomerFulfilmentSchedule={canOverrideCustomerFulfilmentSchedule(
            staff.role.code,
          )}
          closedDates={closedDates}
          customers={customers}
          defaultCustomerId={params.customerId}
          hoursSnapshot={hoursSnapshot}
        />
      )}
    </div>
  );
}
