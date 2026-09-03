import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  parseOrderAvailabilityMonth,
  shiftOrderAvailabilityMonth,
} from "@/engines/business-calendar/order-availability";
import { toBusinessDateKey } from "@/lib/dates";
import { OrderAvailabilityBoard } from "@/workspaces/library/order-availability/OrderAvailabilityBoard";
import { OrderAvailabilityHistory } from "@/workspaces/library/order-availability/OrderAvailabilityHistory";
import {
  listOrderAvailabilityDays,
  listRecentOrderAvailabilityEvents,
} from "@/workspaces/library/order-availability/queries";
import { formatLibraryCollectionMonth } from "@/workspaces/library/labels";

type OrderAvailabilityScreenProps = {
  monthParam?: string;
  hrefBase: "/library/order-availability" | "/bakery/availability";
  canMutate: boolean;
  title: string;
  description: string;
};

export async function OrderAvailabilityScreen({
  monthParam,
  hrefBase,
  canMutate,
  title,
  description,
}: OrderAvailabilityScreenProps) {
  const today = toBusinessDateKey();
  const month = parseOrderAvailabilityMonth(monthParam, today);
  const prevMonth = shiftOrderAvailabilityMonth(month, -1);
  const nextMonth = shiftOrderAvailabilityMonth(month, 1);

  let days: Awaited<ReturnType<typeof listOrderAvailabilityDays>> = [];
  let events: Awaited<ReturnType<typeof listRecentOrderAvailabilityEvents>> =
    [];
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

  if (!loadError) {
    try {
      events = await listRecentOrderAvailabilityEvents();
    } catch {
      events = [];
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader description={description} title={title} />

      {loadError ? (
        <EmptyState
          description={loadError}
          title="Order availability unavailable"
        />
      ) : (
        <>
          <OrderAvailabilityBoard
            canMutate={canMutate}
            days={days}
            monthLabel={formatLibraryCollectionMonth(`${month}-01`)}
            nextHref={`${hrefBase}?month=${nextMonth}`}
            prevHref={`${hrefBase}?month=${prevMonth}`}
          />
          <OrderAvailabilityHistory events={events} />
        </>
      )}
    </div>
  );
}
