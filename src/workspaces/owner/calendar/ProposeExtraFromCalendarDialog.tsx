"use client";

import { startTransition, useEffect, useState } from "react";
import { FormField, FormInput } from "@/components/ui/form";
import { buildCalendarExtraProposePrefill } from "@/engines/extra/prepared-on-default";
import { formatLongBusinessDate } from "@/lib/dates";
import type { StorefrontOrderItem } from "@/types/storefront";
import { proposeExtraStockAction } from "@/workspaces/extra/actions";
import {
  rememberCalendarExtraProposedItem,
  rememberCalendarQuickViewOrder,
} from "@/workspaces/owner/calendar/quick-view-persistence";

export type ProposeExtraFromCalendarTarget = {
  orderId: string;
  item: StorefrontOrderItem;
  fulfilmentDateYmd: string;
};

type ProposeExtraFromCalendarPanelProps = {
  target: ProposeExtraFromCalendarTarget | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (preparedOn: string) => void;
};

/**
 * Inline propose panel inside Calendar Quick View (not a nested dialog).
 * Nested <dialog> + server-action refresh was dismissing Quick View.
 */
export function ProposeExtraFromCalendarPanel({
  target,
  pending,
  error,
  onCancel,
  onSubmit,
}: ProposeExtraFromCalendarPanelProps) {
  const prefill = target
    ? buildCalendarExtraProposePrefill({
        cakeName: target.item.cakeName,
        sizeLabel: target.item.sizeLabel,
        cakeId: target.item.cakeId,
        cakeSizeId: target.item.cakeSizeId,
        fulfilmentDateYmd: target.fulfilmentDateYmd,
      })
    : null;

  const [preparedOn, setPreparedOn] = useState(prefill?.preparedOn ?? "");

  useEffect(() => {
    setPreparedOn(prefill?.preparedOn ?? "");
  }, [target?.item.id, prefill?.preparedOn]);

  if (!target || !prefill) return null;

  return (
    <div className="border-line bg-mist/40 mt-3 space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <p className="text-ink text-sm font-semibold">Propose EXTRA</p>
        <p className="text-ink text-sm">
          {prefill.cakeName}{" "}
          <span className="text-skyline font-normal">{prefill.sizeLabel}</span>
        </p>
        <p className="text-skyline text-xs">
          One EXTRA unit · order line qty is context only
        </p>
        <p className="text-skyline text-xs">
          Fulfilment {formatLongBusinessDate(target.fulfilmentDateYmd)}
        </p>
      </div>
      <FormField htmlFor="calendar-extra-prepared-on" label="Prepared on">
        <FormInput
          id="calendar-extra-prepared-on"
          onChange={(event) => setPreparedOn(event.target.value)}
          required
          type="date"
          value={preparedOn}
        />
      </FormField>
      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          className="border-line text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium disabled:opacity-60"
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
          disabled={pending || !preparedOn.trim()}
          onClick={() => onSubmit(preparedOn.trim())}
          type="button"
        >
          {pending ? "Working…" : "Propose EXTRA"}
        </button>
      </div>
    </div>
  );
}

type UseProposeExtraFromCalendarResult = {
  target: ProposeExtraFromCalendarTarget | null;
  pending: boolean;
  error: string | null;
  successItemId: string | null;
  openForItem: (
    orderId: string,
    item: StorefrontOrderItem,
    fulfilmentDateYmd: string,
  ) => void;
  cancel: () => void;
  submit: (preparedOn: string) => void;
  seedSuccessItemId: (itemId: string | null) => void;
};

export function useProposeExtraFromCalendar(options?: {
  onProposed?: () => void | Promise<void>;
}): UseProposeExtraFromCalendarResult {
  const [target, setTarget] = useState<ProposeExtraFromCalendarTarget | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successItemId, setSuccessItemId] = useState<string | null>(null);

  function openForItem(
    orderId: string,
    item: StorefrontOrderItem,
    fulfilmentDateYmd: string,
  ) {
    setError(null);
    rememberCalendarQuickViewOrder(orderId);
    setTarget({ orderId, item, fulfilmentDateYmd });
  }

  function cancel() {
    if (pending) return;
    setTarget(null);
    setError(null);
  }

  function submit(preparedOn: string) {
    if (!target || pending) return;
    if (!preparedOn) {
      setError("Prepared on date is required.");
      return;
    }
    const prefill = buildCalendarExtraProposePrefill({
      cakeName: target.item.cakeName,
      sizeLabel: target.item.sizeLabel,
      cakeId: target.item.cakeId,
      cakeSizeId: target.item.cakeSizeId,
      fulfilmentDateYmd: target.fulfilmentDateYmd,
    });
    const itemId = target.item.id;
    const orderId = target.orderId;
    rememberCalendarQuickViewOrder(orderId);
    rememberCalendarExtraProposedItem(itemId);
    setPending(true);
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await proposeExtraStockAction({
          cakeName: prefill.cakeName,
          sizeLabel: prefill.sizeLabel,
          preparedOn,
          libraryCakeId: prefill.libraryCakeId,
          libraryCakeSizeId: prefill.libraryCakeSizeId,
          note: null,
        });
        setPending(false);
        if (result.error) {
          setError(result.error);
          return;
        }
        rememberCalendarQuickViewOrder(orderId);
        setTarget(null);
        setSuccessItemId(itemId);
        await options?.onProposed?.();
      })();
    });
  }

  return {
    target,
    pending,
    error,
    successItemId,
    openForItem,
    cancel,
    submit,
    seedSuccessItemId: setSuccessItemId,
  };
}
