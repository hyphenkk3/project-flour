"use client";

import { useActionState, useMemo, useState } from "react";
import { FormError } from "@/components/ui/form";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  removeProductionCapacityAction,
  saveProductionCapacityAction,
} from "@/workspaces/library/order-availability/capacity/actions";
import { setCapacityWaitingListAction } from "@/workspaces/waiting-list/actions";
import {
  formatCapacityEventSummary,
  formatCapacityEventWhen,
  type ProductionCapacityCakeOption,
  type ProductionCapacityEvent,
  type ProductionCapacityRow,
} from "@/workspaces/library/order-availability/capacity/capacity-event-format";
import { formatLongBusinessDate } from "@/lib/dates";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition disabled:opacity-60";
const inkButtonClass =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium transition disabled:opacity-60";

type ProductionCapacityPanelProps = {
  pickupDate: string;
  month: string;
  hrefBase: "/bakery/availability";
  canMutate: boolean;
  canConfigureWaitingList: boolean;
  cakes: ProductionCapacityCakeOption[];
  rows: ProductionCapacityRow[];
  events: ProductionCapacityEvent[];
};

export function ProductionCapacityPanel({
  pickupDate,
  month,
  hrefBase,
  canMutate,
  canConfigureWaitingList,
  cakes,
  rows,
  events,
}: ProductionCapacityPanelProps) {
  const [saveState, saveAction, savePending] = useActionState(
    saveProductionCapacityAction,
    libraryActionInitialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeProductionCapacityAction,
    libraryActionInitialState,
  );
  const [waitState, waitAction, waitPending] = useActionState(
    setCapacityWaitingListAction,
    libraryActionInitialState,
  );
  const [cakeId, setCakeId] = useState(cakes[0]?.id ?? "");
  const selectedCake = useMemo(
    () => cakes.find((cake) => cake.id === cakeId) ?? cakes[0] ?? null,
    [cakeId, cakes],
  );
  const pending = savePending || removePending || waitPending;
  const error = saveState.error ?? removeState.error ?? waitState.error;

  return (
    <section
      aria-labelledby="production-capacity-heading"
      className="space-y-4"
    >
      <div>
        <h2
          className="text-ink text-lg font-semibold tracking-tight"
          id="production-capacity-heading"
        >
          Production capacity
        </h2>
        <p className="text-skyline mt-1 max-w-2xl text-sm">
          Staff only. No capacity row means unrestricted. Capacity 0 is fully
          booked. Customers never see these numbers.
        </p>
      </div>

      <form
        action={hrefBase}
        className="flex flex-wrap items-end gap-3"
        method="get"
      >
        <input name="month" type="hidden" value={month} />
        <label className="text-ink text-sm font-medium">
          Pickup date
          <input
            className="border-fog text-ink mt-1 block h-11 rounded-lg border bg-white px-3 text-sm"
            defaultValue={pickupDate}
            name="date"
            type="date"
          />
        </label>
        <button className={ghostButtonClass} type="submit">
          View date
        </button>
        <p className="text-skyline text-sm">
          {formatLongBusinessDate(pickupDate)}
        </p>
      </form>

      {canMutate ? <FormError message={error} /> : null}

      {rows.length === 0 ? (
        <p className="text-skyline text-sm">
          No capacity limits for this date. Production is unrestricted until a
          row is added.
        </p>
      ) : (
        <ul className="divide-fog border-fog divide-y overflow-hidden rounded-xl border">
          {rows.map((row) => (
            <li className="space-y-3 px-4 py-3" key={row.id}>
              <div>
                <p className="text-ink text-sm font-medium">
                  {row.cakeName}
                  <span className="text-skyline ml-2 font-normal">
                    {row.sizeLabel ?? "All sizes"}
                    {row.collectionLabel ? ` · ${row.collectionLabel}` : ""}
                  </span>
                </p>
                <p className="text-skyline mt-0.5 text-sm">
                  Capacity {row.quantity} · Confirmed {row.committedQuantity}
                  {row.waitingListEnabled ? " · Waiting list on" : ""}
                </p>
                {row.note ? (
                  <p className="text-skyline mt-1 text-xs">{row.note}</p>
                ) : null}
              </div>
              {canMutate ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <form
                    action={saveAction}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                  >
                    <input name="pickup_date" type="hidden" value={pickupDate} />
                    <input
                      name="library_cake_id"
                      type="hidden"
                      value={row.cakeId}
                    />
                    {row.sizeId ? (
                      <input
                        name="library_cake_size_id"
                        type="hidden"
                        value={row.sizeId}
                      />
                    ) : null}
                    {row.collectionId ? (
                      <input
                        name="collection_id"
                        type="hidden"
                        value={row.collectionId}
                      />
                    ) : null}
                    <label className="text-skyline text-sm">
                      Quantity
                      <input
                        className="border-fog text-ink ml-2 h-11 w-20 rounded-lg border bg-white px-3 text-sm tabular-nums"
                        defaultValue={row.quantity}
                        min={0}
                        name="capacity_quantity"
                        step={1}
                        type="number"
                      />
                    </label>
                    <button
                      className={inkButtonClass}
                      disabled={pending}
                      type="submit"
                    >
                      Save
                    </button>
                  </form>
                  <form action={removeAction}>
                    <input name="pickup_date" type="hidden" value={pickupDate} />
                    <input
                      name="library_cake_id"
                      type="hidden"
                      value={row.cakeId}
                    />
                    {row.sizeId ? (
                      <input
                        name="library_cake_size_id"
                        type="hidden"
                        value={row.sizeId}
                      />
                    ) : null}
                    {row.collectionId ? (
                      <input
                        name="collection_id"
                        type="hidden"
                        value={row.collectionId}
                      />
                    ) : null}
                    <button
                      className={ghostButtonClass}
                      disabled={pending}
                      type="submit"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              ) : null}
              {canConfigureWaitingList ? (
                <form action={waitAction} className="flex items-center gap-2">
                  <input name="capacity_id" type="hidden" value={row.id} />
                  <label className="text-ink flex items-center gap-2 text-sm">
                    <input
                      defaultChecked={row.waitingListEnabled}
                      name="waiting_list_enabled"
                      type="checkbox"
                    />
                    Allow waiting list
                  </label>
                  <button
                    className={ghostButtonClass}
                    disabled={pending}
                    type="submit"
                  >
                    Save
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canMutate && cakes.length > 0 ? (
        <form action={saveAction} className="border-fog space-y-3 rounded-xl border bg-white px-4 py-4">
          <p className="text-ink text-sm font-medium">Set capacity</p>
          <input name="pickup_date" type="hidden" value={pickupDate} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-ink text-sm">
              Cake
              <select
                className="border-fog mt-1 block h-11 w-full rounded-lg border bg-white px-3 text-sm"
                name="library_cake_id"
                onChange={(event) => setCakeId(event.target.value)}
                value={selectedCake?.id ?? ""}
              >
                {cakes.map((cake) => (
                  <option key={cake.id} value={cake.id}>
                    {cake.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-ink text-sm">
              Size
              <select
                className="border-fog mt-1 block h-11 w-full rounded-lg border bg-white px-3 text-sm"
                name="library_cake_size_id"
              >
                <option value="">All sizes</option>
                {(selectedCake?.sizes ?? []).map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-ink text-sm">
              Quantity
              <input
                className="border-fog mt-1 block h-11 w-full rounded-lg border bg-white px-3 text-sm tabular-nums"
                min={0}
                name="capacity_quantity"
                required
                step={1}
                type="number"
              />
            </label>
            <label className="text-ink text-sm">
              Note (optional)
              <input
                className="border-fog mt-1 block h-11 w-full rounded-lg border bg-white px-3 text-sm"
                maxLength={200}
                name="note"
              />
            </label>
          </div>
          <button className={inkButtonClass} disabled={pending} type="submit">
            Save capacity
          </button>
        </form>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-ink text-sm font-semibold tracking-tight">
          Recent capacity changes
        </h3>
        {events.length === 0 ? (
          <p className="text-skyline text-sm">No capacity changes for this date.</p>
        ) : (
          <ul className="divide-fog border-fog divide-y overflow-hidden rounded-xl border">
            {events.map((event) => (
              <li
                className="px-4 py-3"
                key={`${event.createdAt}:${event.cakeName}:${event.newQuantity}`}
              >
                <p className="text-ink text-sm font-medium">
                  {formatCapacityEventSummary(event)}
                </p>
                <p className="text-skyline mt-0.5 text-xs">
                  {formatCapacityEventWhen(event)}
                  {event.actorName ? ` · ${event.actorName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
