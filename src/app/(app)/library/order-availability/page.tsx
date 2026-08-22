import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  parseOrderAvailabilityMonth,
  shiftOrderAvailabilityMonth,
} from "@/engines/business-calendar/order-availability";
import { toBusinessDateKey } from "@/lib/dates";
import { OrderAvailabilityBoard } from "@/workspaces/library/order-availability/OrderAvailabilityBoard";
import { listOrderAvailabilityDays } from "@/workspaces/library/order-availability/queries";
import { formatLibraryCollectionMonth } from "@/workspaces/library/labels";

export const dynamic = "force-dynamic";

type OrderAvailabilityPageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function LibraryOrderAvailabilityPage({
  searchParams,
}: OrderAvailabilityPageProps) {
  const params = await searchParams;
  const today = toBusinessDateKey();
  const month = parseOrderAvailabilityMonth(params.month, today);
  const prevMonth = shiftOrderAvailabilityMonth(month, -1);
  const nextMonth = shiftOrderAvailabilityMonth(month, 1);

  let days: Awaited<ReturnType<typeof listOrderAvailabilityDays>> = [];
  let loadError: string | null = null;

  try {
    days = await listOrderAvailabilityDays(month);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    loadError = /order_availability_overrides|schema cache|does not exist/i.test(
      message,
    )
      ? "Could not load order availability. Apply supabase/migrations/20260816190000_order_availability.sql."
      : message || "Could not load order availability.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Close or reopen pickup dates for new customer preorders. This does not change catalogues or website override. Closing a date prevents new website preorders for that pickup date."
        title="Order Availability"
      />

      {loadError ? (
        <EmptyState description={loadError} title="Order availability unavailable" />
      ) : (
        <OrderAvailabilityBoard
          days={days}
          monthLabel={formatLibraryCollectionMonth(`${month}-01`)}
          nextHref={`/library/order-availability?month=${nextMonth}`}
          prevHref={`/library/order-availability?month=${prevMonth}`}
        />
      )}
    </div>
  );
}
