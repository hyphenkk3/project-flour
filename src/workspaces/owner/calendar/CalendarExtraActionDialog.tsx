"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { CalendarExtraMarker } from "@/engines/extra/calendar-visibility";
import { extraCalendarBadgeStatus } from "@/engines/extra/calendar-visibility";
import { formatExtraPickupThroughClock } from "@/engines/extra/fresh-picks-time";
import { formatBusinessCalendarDate, toBusinessDateKey } from "@/lib/dates";
import { unconfirmExtraStockAction } from "@/workspaces/extra/actions";

type CalendarExtraActionDialogProps = {
  extra: CalendarExtraMarker | null;
  canAssignExtraToOrder: boolean;
  canMoveExtraWindow: boolean;
  canCutExtraIntoSlices: boolean;
  canUnconfirmExtra: boolean;
  onClose: () => void;
  onAssignToOrder: (extra: CalendarExtraMarker) => void;
  onMoveWindow: (extra: CalendarExtraMarker) => void;
  onCutIntoSlices: (extra: CalendarExtraMarker) => void;
  onUnconfirmed: () => void;
};

function compactWindow(iso: string | null): string | null {
  if (!iso) return null;
  const ymd = toBusinessDateKey(iso);
  const clock = formatExtraPickupThroughClock(iso);
  const dateLabel = formatBusinessCalendarDate(ymd);
  if (clock === "—") return dateLabel;
  return `${dateLabel} · ${clock}`;
}

const btnSecondary =
  "border-fog text-ink inline-flex min-h-11 w-full items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium disabled:opacity-60";

export function CalendarExtraActionDialog({
  extra,
  canAssignExtraToOrder,
  canMoveExtraWindow,
  canCutExtraIntoSlices,
  canUnconfirmExtra,
  onClose,
  onAssignToOrder,
  onMoveWindow,
  onCutIntoSlices,
  onUnconfirmed,
}: CalendarExtraActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingFromParentRef = useRef(false);
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const open = extra != null;
  const confirmed = extra?.lifecycle === "confirmed";
  const canAssign = Boolean(confirmed && canAssignExtraToOrder);
  const canMove = Boolean(confirmed && canMoveExtraWindow);
  const canCut = Boolean(confirmed && canCutExtraIntoSlices);
  const canUnconfirm = Boolean(confirmed && canUnconfirmExtra);
  const hasMutations = canAssign || canMove || canCut || canUnconfirm;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }
    if (!open && dialog.open) {
      closingFromParentRef.current = true;
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open, extra?.id]);

  function runUnconfirm() {
    if (!extra || !canUnconfirm) return;
    setError(null);
    startTransition(async () => {
      const result = await unconfirmExtraStockAction(extra.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      onUnconfirmed();
    });
  }

  const windowLabel = extra
    ? compactWindow(extra.pickupAvailableFromAt) ??
      formatBusinessCalendarDate(extra.preparedOn)
    : "";
  const status = extra ? extraCalendarBadgeStatus(extra.lifecycle) : "";

  return (
    <dialog
      aria-labelledby={titleId}
      className="border-fog text-ink backdrop:bg-ink/40 fixed top-1/2 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-0 shadow-lg open:flex open:flex-col"
      onCancel={(event) => {
        event.preventDefault();
        if (pending) return;
        onClose();
      }}
      onClose={() => {
        if (closingFromParentRef.current) {
          closingFromParentRef.current = false;
          return;
        }
        onClose();
      }}
      ref={dialogRef}
    >
      {extra ? (
        <div className="flex flex-col gap-5 p-5" data-extra-id={extra.id}>
          <div className="space-y-1.5">
            <p className="text-skyline text-[11px] font-semibold tracking-wide uppercase">
              Fresh Pick
            </p>
            <h2 className="text-ink text-lg font-semibold" id={titleId}>
              {extra.cakeName}
            </h2>
            <p className="text-skyline text-sm">{extra.sizeLabel}</p>
            <p className="text-ink text-sm">{windowLabel}</p>
            <p className="text-skyline text-sm">{status}</p>
          </div>
          {hasMutations ? (
            <div className="flex flex-col gap-2">
              {canAssign ? (
                <button
                  className={btnSecondary}
                  disabled={pending}
                  onClick={() => onAssignToOrder(extra)}
                  type="button"
                >
                  Assign to order
                </button>
              ) : null}
              {canMove ? (
                <button
                  className={btnSecondary}
                  disabled={pending}
                  onClick={() => onMoveWindow(extra)}
                  type="button"
                >
                  Move pickup window
                </button>
              ) : null}
              {canCut ? (
                <button
                  className={btnSecondary}
                  disabled={pending}
                  onClick={() => onCutIntoSlices(extra)}
                  type="button"
                >
                  Cut into slices
                </button>
              ) : null}
              {canUnconfirm ? (
                <div>
                  <button
                    className={btnSecondary}
                    disabled={pending}
                    onClick={runUnconfirm}
                    type="button"
                  >
                    Undo availability
                  </button>
                  <p className="text-skyline mt-1 text-xs leading-relaxed">
                    Returns this Extra to a proposal. Use this only to reverse
                    a mistaken confirm — not to assign, move, or cut a cake.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="text-status-danger text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className={btnSecondary}
            disabled={pending}
            onClick={() => {
              if (pending) return;
              onClose();
            }}
            type="button"
          >
            Close
          </button>
        </div>
      ) : null}
    </dialog>
  );
}
