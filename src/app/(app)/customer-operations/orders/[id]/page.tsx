import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  Breadcrumb,
  BreadcrumbTrail,
  PagePanel,
  PageSection,
  StatusBadge,
} from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { getOrderById } from "@/workspaces/customer-operations/orders/queries";
import { OrderStatusActions } from "@/workspaces/customer-operations/orders/OrderStatusActions";
import {
  formatOrderDate,
  formatOrderTime,
  fulfilmentMethodLabel,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/workspaces/customer-operations/orders/status";

export const dynamic = "force-dynamic";

type OrderDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  const { id } = await params;
  const order = await getOrderById(id);

  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <BreadcrumbTrail>
        <Breadcrumb
          items={[
            {
              label: "Customer Operations",
              href: "/customer-operations/customers",
            },
            { label: "Orders", href: "/customer-operations/orders" },
            { label: order.orderNumber },
          ]}
        />
      </BreadcrumbTrail>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <PageHeader title={order.orderNumber} />
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge
              label={orderStatusLabel(order.status)}
              tone={orderStatusTone(order.status)}
            />
            <StatusBadge
              label={paymentStatusLabel(order.paymentStatus)}
              tone={paymentStatusTone(order.paymentStatus)}
            />
          </div>
        </div>
        {order.status !== "cancelled" && order.status !== "completed" ? (
          <Link
            className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium"
            href={`/customer-operations/orders/${order.id}/edit`}
          >
            Edit order
          </Link>
        ) : null}
      </div>

      <OrderStatusActions order={order} />

      <PageSection title="Order summary">
        <PagePanel>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-skyline text-xs tracking-wide uppercase">
                Order number
              </dt>
              <dd className="text-ink mt-1 text-sm">{order.orderNumber}</dd>
            </div>
            <div>
              <dt className="text-skyline text-xs tracking-wide uppercase">
                Last updated
              </dt>
              <dd className="text-ink mt-1 text-sm">
                {formatDateTime(order.updatedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-skyline text-xs tracking-wide uppercase">
                Created
              </dt>
              <dd className="text-ink mt-1 text-sm">
                {formatDateTime(order.createdAt)}
                {order.createdByName ? ` · ${order.createdByName}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-skyline text-xs tracking-wide uppercase">
                Updated by
              </dt>
              <dd className="text-ink mt-1 text-sm">
                {order.updatedByName ?? "—"}
              </dd>
            </div>
          </dl>
        </PagePanel>
      </PageSection>

      <PageSection title="Customer">
        <PagePanel>
          <p className="text-ink text-sm font-medium">
            {order.customer.fullName}
          </p>
          <p className="text-skyline mt-1 text-sm">
            {order.customer.phoneNumber ?? "No phone on file"}
          </p>
          <Link
            className="text-signal mt-3 inline-flex min-h-11 items-center text-sm font-medium"
            href={`/customer-operations/customers/${order.customer.id}`}
          >
            Open customer profile
          </Link>
        </PagePanel>
      </PageSection>

      <PageSection title="Fulfilment">
        <PagePanel>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-skyline text-xs tracking-wide uppercase">
                Method
              </dt>
              <dd className="text-ink mt-1 text-sm">
                {fulfilmentMethodLabel(order.fulfilmentMethod)}
              </dd>
            </div>
            <div>
              <dt className="text-skyline text-xs tracking-wide uppercase">
                Pickup date
              </dt>
              <dd className="text-ink mt-1 text-sm">
                {formatOrderDate(order.pickupDate)}
              </dd>
            </div>
            <div>
              <dt className="text-skyline text-xs tracking-wide uppercase">
                Pickup time
              </dt>
              <dd className="text-ink mt-1 text-sm">
                {formatOrderTime(order.pickupTime)}
              </dd>
            </div>
          </dl>
        </PagePanel>
      </PageSection>

      <PageSection title="Payment">
        <PagePanel>
          <StatusBadge
            label={paymentStatusLabel(order.paymentStatus)}
            tone={paymentStatusTone(order.paymentStatus)}
          />
        </PagePanel>
      </PageSection>

      <PageSection title="Internal notes">
        <PagePanel>
          <p className="text-ink text-sm whitespace-pre-wrap">
            {order.internalNotes?.trim()
              ? order.internalNotes
              : "No internal notes."}
          </p>
        </PagePanel>
      </PageSection>

      <PageSection title="Customer notes">
        <PagePanel>
          <p className="text-ink text-sm whitespace-pre-wrap">
            {order.customerNotes?.trim()
              ? order.customerNotes
              : "No customer notes."}
          </p>
        </PagePanel>
      </PageSection>

      <PageSection muted title="Products">
        <p className="text-skyline text-sm">Coming in Sprint 2</p>
      </PageSection>

      <PageSection muted title="Timeline">
        <p className="text-skyline text-sm">Coming in a future version</p>
      </PageSection>
    </div>
  );
}
