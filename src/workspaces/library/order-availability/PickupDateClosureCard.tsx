"use client";

import { useActionState } from "react";
import { FormError } from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { updateOrderAvailabilityAction } from "@/workspaces/library/order-availability/actions";
import type { OrderAvailabilityDay } from "@/workspaces/library/order-availability/queries";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition disabled:opacity-60";
const inkButtonClass =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium transition disabled:opacity-60";

type PickupDateClosureCardProps = {
  day: OrderAvailabilityDay | null;
  canMutate: boolean;
};

export function PickupDateClosureCard({
  day,
  canMutate,
}: PickupDateClosureCardProps) {
  const [state, formAction, pending] = useActionState(
    updateOrderAvailabilityAction,
    libraryActionInitialState,
  );

  if (!day) {
    return (
      <p className="text-skyline text-sm">
        No pickup-date status for this date.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-ink text-sm">
        Customer preorders for this date are{" "}
        <span className={day.closed ? "font-semibold text-red-800" : "font-medium"}>
          {day.closed ? "closed" : "open"}
        </span>
        .
      </p>
      {day.closed && day.note ? (
        <p className="text-skyline text-xs">Owner note: {day.note}</p>
      ) : null}
      {canMutate ? <FormError message={state.error} /> : null}
      {canMutate ? (
        day.closed ? (
          <form action={formAction}>
            <input name="intent" type="hidden" value="reopen" />
            <input name="pickup_date" type="hidden" value={day.pickupDate} />
            <button className={ghostButtonClass} disabled={pending} type="submit">
              Reopen orders
            </button>
          </form>
        ) : (
          <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input name="intent" type="hidden" value="close" />
            <input name="pickup_date" type="hidden" value={day.pickupDate} />
            <input
              className="border-fog text-ink h-11 w-full rounded-lg border bg-white px-3 text-sm sm:w-56"
              maxLength={200}
              name="note"
              placeholder="Owner note (optional)"
            />
            <button className={inkButtonClass} disabled={pending} type="submit">
              Close orders
            </button>
          </form>
        )
      ) : null}
    </div>
  );
}
