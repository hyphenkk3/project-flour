import Link from "next/link";
import { EmptyState } from "@/components/shell/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/dates";
import type {
  CustomerHistoryOrder,
  GroupedCustomerHistory,
} from "@/workspaces/customer-operations/customers/history";
import {
  customerHistoryOrderHref,
  customerHistoryOrderKindLabel,
  customerHistoryScheduleLabel,
} from "@/workspaces/customer-operations/customers/history";
import {
  formatOrderDate,
  formatOrderTime,
  fulfilmentMethodLabel,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/workspaces/customer-operations/orders/status";
import {
  guestOrderStatusLabel,
  orderSourceLabel,
} from "@/workspaces/owner/orders/labels";
import type { GuestOrderStatus, OrderSource } from "@/types/storefront";
import type { FulfilmentMethod, OrderStatus, PaymentStatus } from "@/types/order";

const GUEST_STATUSES: readonly GuestOrderStatus[] = [
  "submitted",
  "pending_confirmation",
  "awaiting_payment",
  "paid",
  "cancelled",
];

const CRM_STATUSES: readonly OrderStatus[] = [
  "submitted",
  "pending_confirmation",
  "confirmed",
  "awaiting_payment",
  "paid",
  "cancelled",
  "completed",
];

const ORDER_SOURCES: readonly OrderSource[] = [
  "customer_website",
  "jotform",
  "whatsapp",
  "whitebird_instagram",
  "wee",
  "lex",
  "walk_in",
  "last_minute",
  "other",
];

function historyStatusLabel(order: CustomerHistoryOrder): string {
  if (order.match === "guest_phone" && isGuestStatus(order.status)) {
    return guestOrderStatusLabel(order.status);
  }
  if (isCrmStatus(order.status)) {
    return orderStatusLabel(order.status);
  }
  return order.status;
}

function historyStatusTone(order: CustomerHistoryOrder) {
  if (isCrmStatus(order.status)) {
    return orderStatusTone(order.status);
  }
  if (order.status === "cancelled") return "danger" as const;
  if (order.status === "paid" || order.status === "completed") {
    return "success" as const;
  }
  if (order.status === "awaiting_payment") return "progress" as const;
  if (order.status === "pending_confirmation") return "info" as const;
  return "warning" as const;
}

function isGuestStatus(status: string): status is GuestOrderStatus {
  return (GUEST_STATUSES as readonly string[]).includes(status);
}

function isCrmStatus(status: string): status is OrderStatus {
  return (CRM_STATUSES as readonly string[]).includes(status);
}

function isPaymentStatus(value: string | null): value is PaymentStatus {
  return value === "unpaid" || value === "paid" || value === "refunded";
}

function isFulfilment(value: string | null): value is FulfilmentMethod {
  return (
    value === "pickup" ||
    value === "delivery" ||
    value === "drive_through" ||
    value === "dine_in"
  );
}

function isOrderSource(value: string | null): value is OrderSource {
  return (
    value !== null && (ORDER_SOURCES as readonly string[]).includes(value)
  );
}

function orderMetaLine(order: CustomerHistoryOrder): string {
  const parts = [customerHistoryOrderKindLabel(order)];
  if (isOrderSource(order.orderSource)) {
    parts.push(orderSourceLabel(order.orderSource));
  }
  if (isFulfilment(order.fulfilmentMethod)) {
    parts.push(fulfilmentMethodLabel(order.fulfilmentMethod));
  }
  return parts.join(" · ");
}

type CustomerHistoryPanelProps = {
  customerId: string;
  history: GroupedCustomerHistory;
};

export function CustomerHistoryPanel({
  customerId,
  history,
}: CustomerHistoryPanelProps) {
  const { summary } = history;
  const hasAny =
    summary.totalOrders > 0 ||
    history.upcoming.length + history.past.length + history.cancelled.length >
      0;

  return (
    <div className="space-y-8">
      <section className="border-fog rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="text-ink text-sm font-semibold">Order summary</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-skyline text-xs tracking-wide uppercase">
              Total orders
            </dt>
            <dd className="text-ink mt-1 text-sm tabular-nums">
              {summary.totalOrders}
            </dd>
          </div>
          <div>
            <dt className="text-skyline text-xs tracking-wide uppercase">
              Upcoming
            </dt>
            <dd className="text-ink mt-1 text-sm tabular-nums">
              {summary.upcomingCount}
            </dd>
          </div>
          <div>
            <dt className="text-skyline text-xs tracking-wide uppercase">
              First pickup
            </dt>
            <dd className="text-ink mt-1 text-sm">
              {summary.firstPickupDate
                ? formatOrderDate(summary.firstPickupDate)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-skyline text-xs tracking-wide uppercase">
              Last pickup
            </dt>
            <dd className="text-ink mt-1 text-sm">
              {summary.lastPickupDate
                ? formatOrderDate(summary.lastPickupDate)
                : "—"}
            </dd>
          </div>
        </dl>
        {summary.repeatLabel ? (
          <div className="mt-4">
            <StatusBadge
              label={summary.repeatLabel}
              tone={summary.repeatLabel === "Returning" ? "success" : "info"}
            />
          </div>
        ) : null}
        {!summary.guestMatchingUsed ? (
          <p className="text-skyline mt-4 text-sm">
            Guest website orders are matched by phone. Add a phone number to
            include those orders here.
          </p>
        ) : null}
      </section>

      <HistorySection
        customerId={customerId}
        emptyDescription={
          hasAny
            ? "No upcoming pickups for this customer."
            : summary.guestMatchingUsed
              ? "No Whole Cake, Fresh Picks, or staff orders matched this customer."
              : "No staff orders are linked to this customer."
        }
        emptyTitle="No upcoming orders."
        orders={history.upcoming}
        title="Upcoming"
      />
      <HistorySection
        customerId={customerId}
        emptyDescription="Completed, collected, or past pickup dates."
        emptyTitle="No past orders."
        orders={history.past}
        title="Past"
      />
      <HistorySection
        customerId={customerId}
        emptyDescription="Cancelled orders stay on the profile for staff context."
        emptyTitle="No cancelled orders."
        orders={history.cancelled}
        title="Cancelled"
      />
    </div>
  );
}

function HistorySection({
  title,
  orders,
  customerId,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  orders: CustomerHistoryOrder[];
  customerId: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-ink text-sm font-semibold">
        {title}
        {orders.length > 0 ? (
          <span className="text-skyline ml-2 font-normal tabular-nums">
            {orders.length}
          </span>
        ) : null}
      </h3>
      {orders.length === 0 ? (
        <EmptyState compact description={emptyDescription} title={emptyTitle} />
      ) : (
        <ul className="grid gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <HistoryOrderCard customerId={customerId} order={order} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryOrderCard({
  order,
  customerId,
}: {
  order: CustomerHistoryOrder;
  customerId: string;
}) {
  const href = customerHistoryOrderHref(order, customerId);
  const payment = isPaymentStatus(order.paymentStatus)
    ? order.paymentStatus
    : null;
  const scheduleLabel = customerHistoryScheduleLabel(order.fulfilmentMethod);

  return (
    <Link
      className="border-fog hover:border-signal block rounded-2xl border bg-white p-4 shadow-sm transition"
      href={href}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink font-semibold tracking-tight">
            {order.orderNumber}
          </p>
          <p className="text-skyline mt-1 text-sm">{orderMetaLine(order)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={historyStatusLabel(order)}
            tone={historyStatusTone(order)}
          />
          {payment ? (
            <StatusBadge
              label={paymentStatusLabel(payment)}
              tone={paymentStatusTone(payment)}
            />
          ) : null}
        </div>
      </div>
      <dl className="text-skyline mt-3 grid gap-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="sr-only">{scheduleLabel}</dt>
          <dd>
            {scheduleLabel} · {formatOrderDate(order.pickupDate)}
            {order.pickupTime
              ? ` · ${formatOrderTime(order.pickupTime)}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Placed</dt>
          <dd>Placed · {formatDateTime(order.createdAt)}</dd>
        </div>
      </dl>
    </Link>
  );
}

export function CustomerHistoryUnavailable({ message }: { message: string }) {
  return (
    <EmptyState
      compact
      description={message}
      title="Unable to load order history."
    />
  );
}
