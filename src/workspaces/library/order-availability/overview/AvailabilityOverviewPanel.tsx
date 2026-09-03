import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  formatBusinessCalendarDate,
  formatBusinessWeekdayAbbrev,
  formatShortBusinessDate,
} from "@/lib/dates";
import type { AvailabilityOverviewDay } from "@/engines/orders/availability-overview";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition";

type AvailabilityOverviewPanelProps = {
  from: string;
  to: string;
  prevHref: string;
  nextHref: string;
  days: AvailabilityOverviewDay[];
};

function dateHref(
  pickupDate: string,
  month: string,
  overviewFrom: string,
): string {
  const params = new URLSearchParams();
  params.set("month", month);
  params.set("date", pickupDate);
  params.set("overviewFrom", overviewFrom);
  return `/bakery/availability?${params.toString()}`;
}

type AvailabilityOverviewPanelWithNavProps = AvailabilityOverviewPanelProps & {
  month: string;
  overviewFrom: string;
};

export function AvailabilityOverviewPanel({
  from,
  to,
  prevHref,
  nextHref,
  days,
  month,
  overviewFrom,
}: AvailabilityOverviewPanelWithNavProps) {
  const constrainedDays = days.filter((day) => !day.unrestricted).length;
  const closedDays = days.filter((day) => day.closed).length;
  const fullyBookedCount = days.reduce(
    (count, day) =>
      count + day.scopes.filter((scope) => scope.status === "fully_booked").length,
    0,
  );
  const allUnrestrictedOpen =
    closedDays === 0 && constrainedDays === 0 && days.length > 0;

  return (
    <section aria-labelledby="availability-overview-heading" className="space-y-4">
      <div>
        <h2
          className="text-ink text-lg font-semibold tracking-tight"
          id="availability-overview-heading"
        >
          Availability overview
        </h2>
        <p className="text-skyline mt-1 max-w-2xl text-sm">
          Staff only. Upcoming pickup dates with closures and production limits.
          Customers never see these numbers. Each limit is its own scope — size
          limits are not added to a whole-cake limit.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink text-sm font-medium">
          {formatBusinessCalendarDate(from)} – {formatBusinessCalendarDate(to)}
        </p>
        <div className="flex gap-2">
          <Link className={ghostButtonClass} href={prevHref}>
            Previous 14 days
          </Link>
          <Link className={ghostButtonClass} href={nextHref}>
            Next 14 days
          </Link>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="text-skyline text-sm">
          No matching availability dates for this window.
        </p>
      ) : (
        <>
          <p className="text-skyline text-sm">
            {allUnrestrictedOpen
              ? "All dates in this window are open, with no production limits set."
              : `${closedDays} closed · ${constrainedDays} with production limits · ${fullyBookedCount} fully booked`}
          </p>
          <ul className="space-y-3">
            {days.map((day) => (
              <li key={day.pickupDate}>
                <OverviewDayCard
                  day={day}
                  href={dateHref(day.pickupDate, month, overviewFrom)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function OverviewDayCard({
  day,
  href,
}: {
  day: AvailabilityOverviewDay;
  href: string;
}) {
  return (
    <article
      className={
        day.closed
          ? "border-fog overflow-hidden rounded-xl border bg-red-50/70"
          : "border-fog overflow-hidden rounded-xl border bg-white"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium">
            {formatShortBusinessDate(day.pickupDate)}
            <span className="text-skyline ml-2 font-normal">
              {formatBusinessWeekdayAbbrev(day.pickupDate)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {day.closed ? (
            <StatusBadge label="Closed" tone="danger" />
          ) : (
            <StatusBadge label="Open" tone="success" />
          )}
          <Link
            className="text-skyline hover:text-ink text-xs font-medium"
            href={href}
          >
            View date
          </Link>
        </div>
      </div>

      {day.unrestricted ? (
        <p className="text-skyline border-fog border-t px-4 py-3 text-sm">
          Unrestricted — no production limit set
        </p>
      ) : (
        <div className="border-fog overflow-x-auto border-t">
          <table className="min-w-full text-left text-sm">
            <thead className="text-skyline bg-mist/60 text-xs font-medium">
              <tr>
                <th className="px-4 py-2 font-medium">Cake</th>
                <th className="px-4 py-2 font-medium">Capacity</th>
                <th className="px-4 py-2 font-medium">Committed</th>
                <th className="px-4 py-2 font-medium">Remaining</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {day.scopes.map((scope) => (
                <tr
                  className="border-fog border-t"
                  key={`${scope.cakeId}:${scope.sizeId ?? ""}:${scope.collectionId ?? ""}`}
                >
                  <td className="text-ink px-4 py-2">
                    <span className="font-medium">{scope.cakeName}</span>
                    <span className="text-skyline ml-2">{scope.scopeLabel}</span>
                  </td>
                  <td className="text-ink px-4 py-2 tabular-nums">
                    {scope.capacityQuantity}
                  </td>
                  <td className="text-ink px-4 py-2 tabular-nums">
                    {scope.committedQuantity}
                  </td>
                  <td className="text-ink px-4 py-2 tabular-nums">
                    {scope.remainingQuantity}
                  </td>
                  <td className="px-4 py-2">
                    {scope.status === "fully_booked" ? (
                      <span className="font-semibold text-red-800">
                        Fully Booked
                      </span>
                    ) : (
                      <span className="text-skyline">Open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
