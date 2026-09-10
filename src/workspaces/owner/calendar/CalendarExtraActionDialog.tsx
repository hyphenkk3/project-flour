"use client";

import { useEffect, useId, useRef } from "react";
import type { CalendarExtraMarker } from "@/engines/extra/calendar-visibility";
import { extraCalendarBadgeStatus } from "@/engines/extra/calendar-visibility";
import { formatExtraPickupThroughClock } from "@/engines/extra/fresh-picks-time";
import { formatBusinessCalendarDate, toBusinessDateKey } from "@/lib/dates";

type CalendarExtraActionDialogProps = {
  extra: CalendarExtraMarker | null;
  canAssignExtraToOrder: boolean;
  onClose: () => void;
  onAssignToOrder: (extra: CalendarExtraMarker) => void;
};

function compactWindow(iso: string | null): string | null {
  if (!iso) return null;
  const ymd = toBusinessDateKey(iso);
  const clock = formatExtraPickupThroughClock(iso);
  const dateLabel = formatBusinessCalendarDate(ymd);
  if (clock === "—") return dateLabel;
  return `${dateLabel} · ${clock}`;
}

export function CalendarExtraActionDialog({
  extra,
  canAssignExtraToOrder,
  onClose,
  onAssignToOrder,
}: CalendarExtraActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingFromParentRef = useRef(false);
  const titleId = useId();
  const open = extra != null;
  const canAssign =
    extra != null &&
    extra.lifecycle === "confirmed" &&
    canAssignExtraToOrder;

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
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
            {canAssign ? (
              <button
                className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition"
                onClick={() => onAssignToOrder(extra)}
                type="button"
              >
                Assign to order
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
