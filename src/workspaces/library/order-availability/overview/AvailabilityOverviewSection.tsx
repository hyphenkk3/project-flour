import { toBusinessDateKey } from "@/lib/dates";
import {
  availabilityOverviewDates,
  buildAvailabilityOverviewDays,
  parseAvailabilityOverviewFrom,
  shiftAvailabilityOverviewFrom,
} from "@/engines/orders/availability-overview";
import { AvailabilityOverviewPanel } from "@/workspaces/library/order-availability/overview/AvailabilityOverviewPanel";
import { listAvailabilityOverview } from "@/workspaces/library/order-availability/overview/queries";

type AvailabilityOverviewSectionProps = {
  fromParam?: string;
  month: string;
  dateParam?: string;
};

function overviewHref(input: {
  overviewFrom: string;
  month: string;
  dateParam?: string;
}): string {
  const params = new URLSearchParams();
  params.set("month", input.month);
  const date = input.dateParam?.trim().slice(0, 10) ?? "";
  if (date) params.set("date", date);
  params.set("overviewFrom", input.overviewFrom);
  return `/bakery/availability?${params.toString()}`;
}

export async function AvailabilityOverviewSection({
  fromParam,
  month,
  dateParam,
}: AvailabilityOverviewSectionProps) {
  const today = toBusinessDateKey();
  const from = parseAvailabilityOverviewFrom(fromParam, today);
  const dates = availabilityOverviewDates(from);
  const to = dates[dates.length - 1] ?? from;

  let days = buildAvailabilityOverviewDays({
    dates,
    closedDates: [],
    rows: [],
  });

  try {
    const window = await listAvailabilityOverview(fromParam, today);
    days = window.days;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      !/production_capacity|order_availability_override|schema cache|does not exist/i.test(
        message,
      )
    ) {
      throw error;
    }
  }

  return (
    <AvailabilityOverviewPanel
      days={days}
      from={from}
      month={month}
      nextHref={overviewHref({
        overviewFrom: shiftAvailabilityOverviewFrom(from, 1),
        month,
        dateParam,
      })}
      overviewFrom={from}
      prevHref={overviewHref({
        overviewFrom: shiftAvailabilityOverviewFrom(from, -1),
        month,
        dateParam,
      })}
      to={to}
    />
  );
}
