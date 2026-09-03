"use client";

import { useActionState, useMemo, useState } from "react";
import { FormError } from "@/components/ui/form";
import { WAITING_LIST_ITEM_STATUSES } from "@/engines/waiting-list/types";
import { WAITING_LIST_NAME_HELP, WAITING_LIST_WHATSAPP_NOTE } from "@/engines/waiting-list/phone";
import { formatDateTime, formatShortBusinessDate } from "@/lib/dates";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  cancelWaitingListItemAction,
  closeWaitingListRemainingAction,
  contactWaitingListItemAction,
  convertWaitingListItemAction,
  createStaffWaitingListAction,
  offerWaitingListAlternativeAction,
  recordWaitingListAlternativeAction,
  recordWaitingListResponseAction,
  setCollectionWaitingListAction,
  setWaitingListItemQuantityAction,
} from "@/workspaces/waiting-list/actions";
import type {
  WaitingListBoardRow,
  WaitingListCakeOption,
  WaitingListCollectionSetting,
} from "@/workspaces/waiting-list/types";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition disabled:opacity-60";
const inkButtonClass =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium transition disabled:opacity-60";
const fieldClass =
  "border-fog text-ink mt-1 block h-11 w-full rounded-lg border bg-white px-3 text-sm";

type WaitingListBoardProps = {
  rows: WaitingListBoardRow[];
  cakes: WaitingListCakeOption[];
  collections: WaitingListCollectionSetting[];
  dateFilter: string;
  cakeFilter: string;
  statusFilter: string;
  sizeFilter: string;
  month: string;
  canManage: boolean;
  canConfigure: boolean;
};

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function WaitingListBoard({
  rows,
  cakes,
  collections,
  dateFilter,
  cakeFilter,
  statusFilter,
  sizeFilter,
  month,
  canManage,
  canConfigure,
}: WaitingListBoardProps) {
  const [scan, setScan] = useState<"date" | "cake">("date");
  const [configState, configAction, configPending] = useActionState(
    setCollectionWaitingListAction,
    libraryActionInitialState,
  );
  const [createState, createAction, createPending] = useActionState(
    createStaffWaitingListAction,
    libraryActionInitialState,
  );
  const [contactState, contactAction, contactPending] = useActionState(
    contactWaitingListItemAction,
    libraryActionInitialState,
  );
  const [responseState, responseAction, responsePending] = useActionState(
    recordWaitingListResponseAction,
    libraryActionInitialState,
  );
  const [convertState, convertAction, convertPending] = useActionState(
    convertWaitingListItemAction,
    libraryActionInitialState,
  );
  const [closeState, closeAction, closePending] = useActionState(
    closeWaitingListRemainingAction,
    libraryActionInitialState,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelWaitingListItemAction,
    libraryActionInitialState,
  );
  const [offerState, offerAction, offerPending] = useActionState(
    offerWaitingListAlternativeAction,
    libraryActionInitialState,
  );
  const [altState, altAction, altPending] = useActionState(
    recordWaitingListAlternativeAction,
    libraryActionInitialState,
  );
  const [qtyState, qtyAction, qtyPending] = useActionState(
    setWaitingListItemQuantityAction,
    libraryActionInitialState,
  );

  const pending =
    configPending ||
    createPending ||
    contactPending ||
    responsePending ||
    convertPending ||
    closePending ||
    cancelPending ||
    offerPending ||
    altPending ||
    qtyPending;
  const error =
    configState.error ??
    createState.error ??
    contactState.error ??
    responseState.error ??
    convertState.error ??
    closeState.error ??
    cancelState.error ??
    offerState.error ??
    altState.error ??
    qtyState.error;

  const selectedCake = cakes.find((cake) => cake.id === cakeFilter) ?? cakes[0];
  const [manualCakeId, setManualCakeId] = useState(cakes[0]?.id ?? "");
  const manualCake =
    cakes.find((cake) => cake.id === manualCakeId) ?? cakes[0] ?? null;

  const grouped = useMemo(() => {
    const map = new Map<string, WaitingListBoardRow[]>();
    for (const row of rows) {
      const key = scan === "date" ? row.pickupDate : `${row.cakeName} · ${row.sizeLabel}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [rows, scan]);

  return (
    <section aria-labelledby="waiting-list-heading" className="space-y-4">
      <div>
        <h2
          className="text-ink text-lg font-semibold tracking-tight"
          id="waiting-list-heading"
        >
          Waiting list
        </h2>
        <p className="text-skyline mt-1 max-w-2xl text-sm">
          Queue for dates and cakes where Bakery has explicitly allowed waiting-list
          participation. This is not a confirmed order and does not show production
          capacity numbers.
        </p>
      </div>

      {canConfigure ? (
        <div className="space-y-3">
          <h3 className="text-ink text-sm font-semibold tracking-tight">
            Collection waiting list
          </h3>
          {collections.length === 0 ? (
            <p className="text-skyline text-sm">No catalogues found.</p>
          ) : (
            <ul className="divide-fog border-fog divide-y overflow-hidden rounded-xl border">
              {collections.map((collection) => (
                <li className="px-4 py-3" key={collection.id}>
                  <form
                    action={configAction}
                    className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  >
                    <input name="collection_id" type="hidden" value={collection.id} />
                    <p className="text-ink min-w-40 text-sm font-medium">
                      {collection.name}
                    </p>
                    <label className="text-ink flex items-center gap-2 text-sm">
                      <input
                        defaultChecked={collection.waitingListEnabled}
                        name="waiting_list_enabled"
                        type="checkbox"
                      />
                      Enable waiting list
                    </label>
                    <label className="text-ink text-sm">
                      Response minutes
                      <input
                        className="border-fog text-ink ml-2 h-11 w-24 rounded-lg border bg-white px-3 text-sm tabular-nums"
                        defaultValue={
                          collection.waitingListResponseMinutes ?? ""
                        }
                        min={1}
                        name="waiting_list_response_minutes"
                        placeholder="30"
                        type="number"
                      />
                    </label>
                    <button className={ghostButtonClass} disabled={pending} type="submit">
                      Save
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <form
        action="/bakery/availability"
        className="flex flex-wrap items-end gap-3"
        method="get"
      >
        <input name="month" type="hidden" value={month} />
        <label className="text-ink text-sm font-medium">
          Collection date
          <input
            className={fieldClass}
            defaultValue={dateFilter}
            name="date"
            type="date"
          />
        </label>
        <label className="text-ink text-sm font-medium">
          Cake
          <select className={fieldClass} defaultValue={cakeFilter} name="wlCake">
            <option value="">All cakes</option>
            {cakes.map((cake) => (
              <option key={cake.id} value={cake.id}>
                {cake.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink text-sm font-medium">
          Size
          <select className={fieldClass} defaultValue={sizeFilter} name="wlSize">
            <option value="">All sizes</option>
            {(selectedCake?.sizes ?? []).map((size) => (
              <option key={size.id} value={size.id}>
                {size.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink text-sm font-medium">
          Status
          <select
            className={fieldClass}
            defaultValue={statusFilter}
            name="wlStatus"
          >
            <option value="">All statuses</option>
            {WAITING_LIST_ITEM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <button className={ghostButtonClass} type="submit">
          Filter
        </button>
      </form>

      <div className="flex gap-2">
        <button
          className={scan === "date" ? inkButtonClass : ghostButtonClass}
          onClick={() => setScan("date")}
          type="button"
        >
          Scan by date
        </button>
        <button
          className={scan === "cake" ? inkButtonClass : ghostButtonClass}
          onClick={() => setScan("cake")}
          type="button"
        >
          Scan by cake
        </button>
      </div>

      {error ? <FormError message={error} /> : null}

      {grouped.length === 0 ? (
        <p className="text-skyline text-sm">No waiting-list entries for these filters.</p>
      ) : (
        grouped.map(([heading, group]) => (
          <div className="space-y-2" key={heading}>
            <h3 className="text-ink text-sm font-semibold tracking-tight">
              {scan === "date" ? formatShortBusinessDate(heading) : heading}
            </h3>
            <ul className="divide-fog border-fog divide-y overflow-hidden rounded-xl border">
              {group.map((row) => (
                <li className="space-y-3 px-4 py-4" key={row.itemId}>
                  <div>
                    <p className="text-ink text-sm font-medium">
                      {row.guestName}
                      {row.actionRequired ? (
                        <span className="text-signal ml-2 font-normal">
                          Action required
                        </span>
                      ) : null}
                    </p>
                    <p className="text-skyline mt-0.5 text-sm">
                      WhatsApp {row.guestPhone} · {row.cakeName} · {row.sizeLabel} ·
                      qty {row.quantity} · remaining {row.remainingQuantity} · #
                      {row.queuePosition} · {statusLabel(row.status)}
                    </p>
                    <p className="text-skyline mt-0.5 text-xs">
                      {formatShortBusinessDate(row.pickupDate)} · joined{" "}
                      {row.joinedAt ? formatDateTime(row.joinedAt) : "—"} ·
                      alternatives {row.openToAlternatives ? "yes" : "no"}
                      {row.contactedAt
                        ? ` · contacted ${formatDateTime(row.contactedAt)}`
                        : ""}
                      {row.responseDeadlineAt
                        ? ` · reply by ${formatDateTime(row.responseDeadlineAt)}`
                        : ""}
                      {row.offeredQuantity
                        ? ` · offered ${row.offeredQuantity}`
                        : ""}
                      {row.convertedOrderNumber
                        ? ` · order ${row.convertedOrderNumber}`
                        : ""}
                    </p>
                  </div>

                  {canManage ? (
                    <div className="flex flex-col gap-2">
                      {row.status === "active" ||
                      row.status === "partially_accepted" ? (
                        <form
                          action={contactAction}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <input name="item_id" type="hidden" value={row.itemId} />
                          <label className="text-ink text-sm">
                            Offer qty
                            <input
                              className="border-fog text-ink ml-2 h-11 w-20 rounded-lg border bg-white px-3 text-sm tabular-nums"
                              defaultValue={
                                row.offeredQuantity ?? row.remainingQuantity
                              }
                              min={1}
                              name="offered_quantity"
                              type="number"
                            />
                          </label>
                          <button
                            className={inkButtonClass}
                            disabled={pending}
                            type="submit"
                          >
                            Contact
                          </button>
                        </form>
                      ) : null}

                      {row.status === "contacted" ? (
                        <form
                          action={responseAction}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <input name="item_id" type="hidden" value={row.itemId} />
                          <label className="text-ink text-sm">
                            Response
                            <select className={fieldClass} name="outcome">
                              <option value="accept">Accept</option>
                              <option value="decline">Decline</option>
                              <option value="late_accept">Late accept</option>
                              <option value="late_decline">Late decline</option>
                            </select>
                          </label>
                          <label className="text-ink text-sm">
                            Accepted qty
                            <input
                              className="border-fog text-ink ml-2 h-11 w-20 rounded-lg border bg-white px-3 text-sm tabular-nums"
                              defaultValue={
                                row.offeredQuantity ?? row.remainingQuantity
                              }
                              min={1}
                              name="accepted_quantity"
                              type="number"
                            />
                          </label>
                          <label className="text-ink text-sm">
                            Keep remaining
                            <select
                              className={fieldClass}
                              defaultValue="yes"
                              name="keep_remaining"
                            >
                              <option value="yes">Yes</option>
                              <option value="no">No — close remaining</option>
                            </select>
                          </label>
                          <button
                            className={inkButtonClass}
                            disabled={pending}
                            type="submit"
                          >
                            Record response
                          </button>
                        </form>
                      ) : null}

                      {row.status === "contacted" ||
                      row.status === "accepted" ||
                      row.status === "partially_accepted" ? (
                        <form
                          action={convertAction}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <input name="item_id" type="hidden" value={row.itemId} />
                          <label className="text-ink text-sm">
                            Convert qty
                            <input
                              className="border-fog text-ink ml-2 h-11 w-20 rounded-lg border bg-white px-3 text-sm tabular-nums"
                              defaultValue={
                                row.offeredQuantity ?? row.remainingQuantity
                              }
                              min={1}
                              name="quantity"
                              type="number"
                            />
                          </label>
                          <label className="text-ink text-sm">
                            Pickup time
                            <input
                              className={fieldClass}
                              name="pickup_time"
                              required
                              type="time"
                            />
                          </label>
                          <label className="text-ink text-sm">
                            Keep remaining
                            <select
                              className={fieldClass}
                              defaultValue="yes"
                              name="keep_remaining"
                            >
                              <option value="yes">Yes</option>
                              <option value="no">No — close remaining</option>
                            </select>
                          </label>
                          <button
                            className={inkButtonClass}
                            disabled={pending}
                            type="submit"
                          >
                            Convert to order
                          </button>
                        </form>
                      ) : null}

                      {row.remainingQuantity > 0 &&
                      (row.status === "partially_accepted" ||
                        row.status === "active" ||
                        row.status === "accepted") ? (
                        <form action={closeAction}>
                          <input name="item_id" type="hidden" value={row.itemId} />
                          <button
                            className={ghostButtonClass}
                            disabled={pending}
                            type="submit"
                          >
                            Close remaining request
                          </button>
                        </form>
                      ) : null}

                      {row.openToAlternatives &&
                      (row.status === "active" ||
                        row.status === "partially_accepted" ||
                        row.status === "contacted") ? (
                        <>
                          <form
                            action={offerAction}
                            className="flex flex-wrap items-end gap-2"
                          >
                            <input name="item_id" type="hidden" value={row.itemId} />
                            <label className="text-ink text-sm">
                              Alternative cake
                              <select
                                className={fieldClass}
                                name="alternative_cake_id"
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
                                className={fieldClass}
                                name="alternative_size_id"
                              >
                                {cakes.flatMap((cake) =>
                                  cake.sizes.map((size) => (
                                    <option key={size.id} value={size.id}>
                                      {cake.name} · {size.label}
                                    </option>
                                  )),
                                )}
                              </select>
                            </label>
                            <label className="text-ink text-sm">
                              Qty
                              <input
                                className="border-fog text-ink ml-2 h-11 w-20 rounded-lg border bg-white px-3 text-sm tabular-nums"
                                defaultValue={1}
                                min={1}
                                name="quantity"
                                type="number"
                              />
                            </label>
                            <button
                              className={ghostButtonClass}
                              disabled={pending}
                              type="submit"
                            >
                              Offer alternative
                            </button>
                          </form>
                          <form
                            action={altAction}
                            className="flex flex-wrap items-end gap-2"
                          >
                            <input name="item_id" type="hidden" value={row.itemId} />
                            <label className="text-ink text-sm">
                              Alternative reply
                              <select className={fieldClass} name="accept">
                                <option value="yes">Switch to alternative</option>
                                <option value="no">
                                  Continue waiting for original
                                </option>
                              </select>
                            </label>
                            <label className="text-ink text-sm">
                              Alternative cake
                              <select
                                className={fieldClass}
                                name="alternative_cake_id"
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
                                className={fieldClass}
                                name="alternative_size_id"
                              >
                                {cakes.flatMap((cake) =>
                                  cake.sizes.map((size) => (
                                    <option key={size.id} value={size.id}>
                                      {cake.name} · {size.label}
                                    </option>
                                  )),
                                )}
                              </select>
                            </label>
                            <label className="text-ink text-sm">
                              Alt qty
                              <input
                                className="border-fog text-ink ml-2 h-11 w-20 rounded-lg border bg-white px-3 text-sm tabular-nums"
                                defaultValue={1}
                                min={1}
                                name="quantity"
                                type="number"
                              />
                            </label>
                            <label className="text-ink text-sm">
                              Keep original remaining
                              <select
                                className={fieldClass}
                                defaultValue="yes"
                                name="keep_original"
                              >
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                              </select>
                            </label>
                            <button
                              className={ghostButtonClass}
                              disabled={pending}
                              type="submit"
                            >
                              Record alternative
                            </button>
                          </form>
                        </>
                      ) : null}

                      {row.status === "active" ||
                      row.status === "partially_accepted" ? (
                        <form
                          action={qtyAction}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <input name="item_id" type="hidden" value={row.itemId} />
                          <label className="text-ink text-sm">
                            Quantity
                            <input
                              className="border-fog text-ink ml-2 h-11 w-20 rounded-lg border bg-white px-3 text-sm tabular-nums"
                              defaultValue={row.quantity}
                              min={1}
                              name="quantity"
                              type="number"
                            />
                          </label>
                          <button
                            className={ghostButtonClass}
                            disabled={pending}
                            type="submit"
                          >
                            Update quantity
                          </button>
                        </form>
                      ) : null}

                      {row.status !== "cancelled" &&
                      row.status !== "converted" &&
                      row.status !== "closed" ? (
                        <form action={cancelAction}>
                          <input name="item_id" type="hidden" value={row.itemId} />
                          <input
                            name="reason"
                            type="hidden"
                            value="Staff cancelled"
                          />
                          <button
                            className={ghostButtonClass}
                            disabled={pending}
                            type="submit"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {canManage && cakes.length > 0 ? (
        <form action={createAction} className="border-fog space-y-3 rounded-xl border bg-white px-4 py-4">
          <p className="text-ink text-sm font-medium">Add customer to waiting list</p>
          <p className="text-skyline text-xs">{WAITING_LIST_NAME_HELP}</p>
          <input name="collection_id" type="hidden" value="" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-ink text-sm">
              Name
              <input className={fieldClass} name="customer_name" required />
            </label>
            <label className="text-ink text-sm">
              WhatsApp
              <input
                className={fieldClass}
                inputMode="numeric"
                name="phone"
                pattern="[0-9]*"
                required
                type="tel"
              />
            </label>
            <p className="text-skyline sm:col-span-2 text-xs">
              {WAITING_LIST_WHATSAPP_NOTE}
            </p>
            <label className="text-ink text-sm">
              Collection date
              <input
                className={fieldClass}
                defaultValue={dateFilter}
                name="pickup_date"
                required
                type="date"
              />
            </label>
            <label className="text-ink text-sm">
              Cake
              <select
                className={fieldClass}
                name="cake_id"
                onChange={(event) => setManualCakeId(event.target.value)}
                value={manualCake?.id ?? ""}
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
              <select className={fieldClass} name="size_id" required>
                {(manualCake?.sizes ?? []).map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-ink text-sm">
              Quantity
              <input
                className={fieldClass}
                defaultValue={1}
                min={1}
                name="quantity"
                required
                type="number"
              />
            </label>
            <label className="text-ink text-sm">
              Alternative flavours
              <select
                className={fieldClass}
                defaultValue="no"
                name="open_to_alternatives"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          </div>
          <button className={inkButtonClass} disabled={pending} type="submit">
            Add to waiting list
          </button>
        </form>
      ) : null}
    </section>
  );
}
