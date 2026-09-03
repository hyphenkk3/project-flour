"use client";

import { useActionState } from "react";
import Link from "next/link";
import { FormError } from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { updateOrderAvailabilityAction } from "@/workspaces/library/order-availability/actions";
import type { OrderAvailabilityDay } from "@/workspaces/library/order-availability/queries";
import {
  formatLongBusinessDate,
  formatShortBusinessDate,
} from "@/lib/dates";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition disabled:opacity-60";
const inkButtonClass =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium transition disabled:opacity-60";

type OrderAvailabilityBoardProps = {
  days: OrderAvailabilityDay[];
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  canMutate: boolean;
};

export function OrderAvailabilityBoard({
  days,
  monthLabel,
  prevHref,
  nextHref,
  canMutate,
}: OrderAvailabilityBoardProps) {
  const [state, formAction, pending] = useActionState(
    updateOrderAvailabilityAction,
    libraryActionInitialState,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-ink text-lg font-semibold tracking-tight">
          {monthLabel}
        </h2>
        <div className="flex gap-2">
          <Link className={ghostButtonClass} href={prevHref}>
            Previous
          </Link>
          <Link className={ghostButtonClass} href={nextHref}>
            Next
          </Link>
        </div>
      </div>

      {canMutate ? <FormError message={state.error} /> : null}

      <ul className="divide-fog border-fog divide-y overflow-hidden rounded-xl border">
        {days.map((day) => (
          <li
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            key={day.pickupDate}
          >
            <div className="min-w-0">
              <p className="text-ink text-sm font-medium">
                {formatShortBusinessDate(day.pickupDate)}
                <span className="text-skyline ml-2 font-normal">
                  {formatLongBusinessDate(day.pickupDate).split(",")[0]}
                </span>
              </p>
              {day.closed ? (
                <p className="mt-0.5 text-sm font-semibold text-red-800">
                  CLOSED — Orders closed
                </p>
              ) : (
                <p className="text-skyline mt-0.5 text-sm">Open</p>
              )}
              {day.closed && day.note ? (
                <p className="text-skyline mt-1 text-xs">Owner note: {day.note}</p>
              ) : null}
            </div>

            {canMutate ? (
              day.closed ? (
                <form action={formAction} className="shrink-0">
                  <input name="intent" type="hidden" value="reopen" />
                  <input
                    name="pickup_date"
                    type="hidden"
                    value={day.pickupDate}
                  />
                  <button
                    className={ghostButtonClass}
                    disabled={pending}
                    type="submit"
                  >
                    Reopen orders
                  </button>
                </form>
              ) : (
                <form
                  action={formAction}
                  className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
                >
                  <input name="intent" type="hidden" value="close" />
                  <input
                    name="pickup_date"
                    type="hidden"
                    value={day.pickupDate}
                  />
                  <input
                    className="border-fog text-ink h-11 w-full rounded-lg border bg-white px-3 text-sm sm:w-56"
                    maxLength={200}
                    name="note"
                    placeholder="Owner note (optional)"
                  />
                  <button
                    className={inkButtonClass}
                    disabled={pending}
                    type="submit"
                  >
                    Close orders
                  </button>
                </form>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
