"use client";

import { useActionState } from "react";
import { FormError } from "@/components/ui/form";
import {
  OPERATING_HOURS_CAPABILITIES,
  weekdayShortLabel,
  type OperatingHoursCapability,
  type OperatingHoursSnapshot,
} from "@/engines/business-calendar/operating-hours";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  deleteDateOverrideAction,
  saveDateOverrideAction,
  saveWeeklyOperatingHoursAction,
} from "@/workspaces/library/operating-hours/actions";

const inkButtonClass =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium transition disabled:opacity-60";
const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition disabled:opacity-60";

const CAPABILITY_COPY: Record<
  OperatingHoursCapability,
  { title: string; help: string; showUsual: boolean }
> = {
  pickup: {
    title: "Cake pickup",
    help: "Customer pickup slots. Usual start/end are bakery guidance, not a customer cutoff.",
    showUsual: true,
  },
  delivery: {
    title: "Delivery",
    help: "Whole Cake delivery window. Extra / Fresh Picks stay pickup-only.",
    showUsual: false,
  },
  dine_in: {
    title: "Cake dine-in booking",
    help: "Customer booking window for cake dine-in. Latest bookable is the last slot offered.",
    showUsual: false,
  },
  hyphen: {
    title: "Hyphen",
    help: "Outlet hours. Latest bookable is the last dine-in slot this outlet accepts.",
    showUsual: false,
  },
  whitebird: {
    title: "Whitebird",
    help: "Outlet hours. Latest bookable is the last dine-in slot this outlet accepts.",
    showUsual: false,
  },
};

type OperatingHoursBoardProps = {
  snapshot: OperatingHoursSnapshot;
};

export function OperatingHoursBoard({ snapshot }: OperatingHoursBoardProps) {
  const [weeklyState, weeklyAction, weeklyPending] = useActionState(
    saveWeeklyOperatingHoursAction,
    libraryActionInitialState,
  );
  const [dateState, dateAction, datePending] = useActionState(
    saveDateOverrideAction,
    libraryActionInitialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteDateOverrideAction,
    libraryActionInitialState,
  );

  const overrideDates = Array.from(
    new Set(snapshot.overrides.map((row) => row.overrideDate)),
  ).sort();

  return (
    <div className="space-y-10">
      <FormError message={weeklyState.error ?? dateState.error ?? deleteState.error} />

      {OPERATING_HOURS_CAPABILITIES.map((capability) => {
        const copy = CAPABILITY_COPY[capability];
        return (
          <section className="space-y-3" key={capability}>
            <div>
              <h2 className="text-ink text-lg font-semibold tracking-tight">
                {copy.title}
              </h2>
              <p className="text-skyline mt-1 text-sm">{copy.help}</p>
            </div>
            <form action={weeklyAction} className="space-y-3">
              <input name="capability" type="hidden" value={capability} />
              <div className="border-fog overflow-x-auto rounded-xl border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-mist text-skyline text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">Day</th>
                      <th className="px-3 py-2 font-medium">Open</th>
                      <th className="px-3 py-2 font-medium">Opens</th>
                      <th className="px-3 py-2 font-medium">Closes</th>
                      <th className="px-3 py-2 font-medium">Latest bookable</th>
                      {copy.showUsual ? (
                        <>
                          <th className="px-3 py-2 font-medium">Usual start</th>
                          <th className="px-3 py-2 font-medium">Usual end</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
                      const weekly = snapshot.weekly.find(
                        (row) =>
                          row.capability === capability && row.weekday === weekday,
                      );
                      return (
                        <tr className="border-fog border-t" key={weekday}>
                          <td className="text-ink px-3 py-2 font-medium">
                            {weekdayShortLabel(weekday)}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              defaultChecked={weekly?.enabled ?? false}
                              name={`enabled_${weekday}`}
                              type="checkbox"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="border-fog h-10 rounded-lg border px-2"
                              defaultValue={weekly?.opensAt ?? ""}
                              name={`opens_${weekday}`}
                              type="time"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="border-fog h-10 rounded-lg border px-2"
                              defaultValue={weekly?.closesAt ?? ""}
                              name={`closes_${weekday}`}
                              type="time"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="border-fog h-10 rounded-lg border px-2"
                              defaultValue={weekly?.latestBookable ?? ""}
                              name={`latest_${weekday}`}
                              type="time"
                            />
                          </td>
                          {copy.showUsual ? (
                            <>
                              <td className="px-3 py-2">
                                <input
                                  className="border-fog h-10 rounded-lg border px-2"
                                  defaultValue={weekly?.usualStart ?? ""}
                                  name={`usual_start_${weekday}`}
                                  type="time"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="border-fog h-10 rounded-lg border px-2"
                                  defaultValue={weekly?.usualEnd ?? ""}
                                  name={`usual_end_${weekday}`}
                                  type="time"
                                />
                              </td>
                            </>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button className={inkButtonClass} disabled={weeklyPending} type="submit">
                Save {copy.title.toLowerCase()}
              </button>
            </form>
          </section>
        );
      })}

      <section className="space-y-3">
        <h2 className="text-ink text-lg font-semibold tracking-tight">
          Special dates
        </h2>
        <p className="text-skyline text-sm">
          Public holidays and one-off opens or closures. These override the weekly
          schedule for that date only. TypeScript and SQL both read this list.
        </p>
        {overrideDates.length > 0 ? (
          <ul className="border-fog divide-y divide-fog rounded-xl border">
            {overrideDates.map((date) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                key={date}
              >
                <p className="text-ink text-sm font-medium">{date}</p>
                <form action={deleteAction}>
                  <input name="override_date" type="hidden" value={date} />
                  <button
                    className={ghostButtonClass}
                    disabled={deletePending}
                    type="submit"
                  >
                    Remove override
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-skyline text-sm">No special dates yet.</p>
        )}

        <form action={dateAction} className="border-fog space-y-4 rounded-xl border p-4">
          <h3 className="text-ink text-sm font-semibold">Add or replace a special date</h3>
          <label className="block text-sm">
            <span className="text-skyline">Date</span>
            <input
              className="border-fog mt-1 block h-11 w-full max-w-xs rounded-lg border px-3"
              name="override_date"
              required
              type="date"
            />
          </label>
          <label className="block text-sm">
            <span className="text-skyline">Internal note</span>
            <input
              className="border-fog mt-1 block h-11 w-full rounded-lg border px-3"
              name="note"
              placeholder="e.g. Public holiday — open as Monday"
            />
          </label>
          {OPERATING_HOURS_CAPABILITIES.map((capability) => (
            <fieldset className="border-fog space-y-2 rounded-lg border p-3" key={capability}>
              <legend className="text-ink px-1 text-sm font-medium">
                {CAPABILITY_COPY[capability].title}
              </legend>
              <label className="mr-4 text-sm">
                <input defaultChecked name={`mode_${capability}`} type="radio" value="weekly" />{" "}
                Use weekly
              </label>
              <label className="mr-4 text-sm">
                <input name={`mode_${capability}`} type="radio" value="open" /> Open custom
              </label>
              <label className="text-sm">
                <input name={`mode_${capability}`} type="radio" value="closed" /> Closed
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  className="border-fog h-10 rounded-lg border px-2"
                  name={`opens_${capability}`}
                  type="time"
                />
                <input
                  className="border-fog h-10 rounded-lg border px-2"
                  name={`closes_${capability}`}
                  type="time"
                />
                <input
                  className="border-fog h-10 rounded-lg border px-2"
                  name={`latest_${capability}`}
                  type="time"
                />
              </div>
            </fieldset>
          ))}
          <button className={inkButtonClass} disabled={datePending} type="submit">
            Save special date
          </button>
        </form>
      </section>
    </div>
  );
}
