"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  evaluateExtraOrderCutoffEdit,
  extraOrderCutoffDateOptions,
  extraOrderCutoffSlotsForDate,
} from "@/engines/extra/fresh-picks-eligibility";
import { malaysiaDateTimeParts } from "@/engines/extra/fresh-picks-time";
import { updateExtraStockOrderCutoffAction } from "@/workspaces/extra/actions";
import type { ExtraStockUnit } from "@/workspaces/extra/types";

type Props = {
  extra: ExtraStockUnit | null;
  open: boolean;
  todayYmd: string;
  onClose: () => void;
  onUpdated?: () => void;
};

export function ExtraOrderCutoffDialog({
  extra,
  open,
  todayYmd,
  onClose,
  onUpdated,
}: Props) {
  if (!extra) return null;

  return (
    <ExtraOrderCutoffDialogContent
      key={`${extra.id}:${extra.pickupThroughAt}:${open ? "open" : "closed"}`}
      extra={extra}
      onClose={onClose}
      onUpdated={onUpdated}
      open={open}
      todayYmd={todayYmd}
    />
  );
}

type ContentProps = Omit<Props, "extra"> & { extra: ExtraStockUnit };

function ExtraOrderCutoffDialogContent({
  extra,
  open,
  todayYmd,
  onClose,
  onUpdated,
}: ContentProps) {
  const [pending, startTransition] = useTransition();
  const initialCutoff = extra.pickupThroughAt
    ? malaysiaDateTimeParts(extra.pickupThroughAt)
    : null;
  const [cutoffDate, setCutoffDate] = useState(initialCutoff?.date ?? "");
  const [cutoffSlot, setCutoffSlot] = useState(initialCutoff?.time ?? "");
  const [confirmImmediateClose, setConfirmImmediateClose] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickupFromDate = extra.pickupAvailableFromAt
    ? malaysiaDateTimeParts(extra.pickupAvailableFromAt)?.date ?? ""
    : "";
  const dateOptions = extraOrderCutoffDateOptions(pickupFromDate, todayYmd);
  const timeOptions = extraOrderCutoffSlotsForDate({
    cutoffDate,
    todayYmd,
    allowPast: true,
  });

  function submit() {
    const decision = evaluateExtraOrderCutoffEdit({
      pickupAvailableFromAt: extra.pickupAvailableFromAt,
      currentCutoffAt: extra.pickupThroughAt,
      cutoffDate,
      cutoffSlot,
      todayYmd,
    });
    if (!decision.ok) {
      setError(decision.error);
      return;
    }
    if (decision.closesImmediately && !confirmImmediateClose) {
      setConfirmImmediateClose(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateExtraStockOrderCutoffAction({
        extraStockId: extra.id,
        orderCutoffAt: decision.orderCutoffIso,
        confirmImmediateClose: confirmImmediateClose && decision.closesImmediately,
      });
      if (result.error) {
        setError(result.error);
        setConfirmImmediateClose(false);
        return;
      }
      onUpdated?.();
      onClose();
    });
  }

  const immediateWarning =
    "This cutoff will close ordering immediately. Continue?";

  return (
    <ConfirmDialog
      allowDismiss={!pending}
      confirmLabel={confirmImmediateClose ? "Continue" : "Save cutoff"}
      description={
        extra
          ? `Change the order cutoff for ${extra.cakeName} ${extra.sizeLabel}. Pickup hours and existing orders are unchanged.`
          : undefined
      }
      onCancel={() => {
        if (pending) return;
        onClose();
      }}
      onConfirm={submit}
      open={open}
      pending={pending}
      title={confirmImmediateClose ? "Close ordering now?" : "Edit order cutoff"}
      tone={confirmImmediateClose ? "danger" : "default"}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink font-medium">Order cutoff date</span>
          <select
            className="border-fog text-ink focus:border-signal mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-base outline-none"
            disabled={pending || !extra}
            onChange={(event) => {
              setCutoffDate(event.target.value);
              setCutoffSlot("");
              setConfirmImmediateClose(false);
              setError(null);
            }}
            value={cutoffDate}
          >
            <option value="">Choose a date</option>
            {dateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink font-medium">Order cutoff time</span>
          <select
            className="border-fog text-ink focus:border-signal mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-base outline-none"
            disabled={pending || !cutoffDate}
            onChange={(event) => {
              setCutoffSlot(event.target.value);
              setConfirmImmediateClose(false);
              setError(null);
            }}
            value={cutoffSlot}
          >
            <option value="">Choose a cutoff time</option>
            {timeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {confirmImmediateClose ? (
        <p className="text-status-danger mt-3 text-sm font-medium" role="alert">
          {immediateWarning}
        </p>
      ) : null}
      {error ? (
        <p className="text-status-danger mt-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
