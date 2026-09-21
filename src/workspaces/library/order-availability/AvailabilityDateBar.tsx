"use client";

import { useState } from "react";
import Link from "next/link";
import { formatLongBusinessDate } from "@/lib/dates";
import { shiftOrderAvailabilityMonth } from "@/engines/business-calendar/order-availability";
import { bakeryAvailabilityHref } from "@/workspaces/library/order-availability/availability-sections";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition";
const fieldClass =
  "border-fog text-ink mt-1 block h-11 rounded-lg border bg-white px-3 text-sm";

type AvailabilityDateBarProps = {
  pickupDate: string;
  month: string;
  wlCake?: string;
  wlSize?: string;
  wlStatus?: string;
};

export function AvailabilityDateBar(props: AvailabilityDateBarProps) {
  return <AvailabilityDateBarForm key={props.pickupDate} {...props} />;
}

function AvailabilityDateBarForm({
  pickupDate,
  month,
  wlCake = "",
  wlSize = "",
  wlStatus = "",
}: AvailabilityDateBarProps) {
  const [date, setDate] = useState(pickupDate);
  const derivedMonth = date.slice(0, 7) || month;
  const prevMonth = shiftOrderAvailabilityMonth(month, -1);
  const nextMonth = shiftOrderAvailabilityMonth(month, 1);
  const monthQuery = {
    wlCake: wlCake || undefined,
    wlSize: wlSize || undefined,
    wlStatus: wlStatus || undefined,
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        action="/bakery/availability"
        className="flex flex-wrap items-end gap-3"
        method="get"
      >
        <input name="month" type="hidden" value={derivedMonth} />
        {wlCake ? <input name="wlCake" type="hidden" value={wlCake} /> : null}
        {wlSize ? <input name="wlSize" type="hidden" value={wlSize} /> : null}
        {wlStatus ? (
          <input name="wlStatus" type="hidden" value={wlStatus} />
        ) : null}
        <label className="text-ink text-sm font-medium">
          Pickup date
          <input
            className={fieldClass}
            name="date"
            onChange={(event) => setDate(event.target.value)}
            required
            type="date"
            value={date}
          />
        </label>
        <button className={ghostButtonClass} type="submit">
          View date
        </button>
        <p className="text-skyline text-sm">{formatLongBusinessDate(date)}</p>
      </form>
      <div className="flex flex-wrap gap-2">
        <Link
          className={ghostButtonClass}
          href={bakeryAvailabilityHref({
            ...monthQuery,
            month: prevMonth,
            date: `${prevMonth}-01`,
          })}
        >
          Previous month
        </Link>
        <Link
          className={ghostButtonClass}
          href={bakeryAvailabilityHref({
            ...monthQuery,
            month: nextMonth,
            date: `${nextMonth}-01`,
          })}
        >
          Next month
        </Link>
      </div>
    </div>
  );
}
