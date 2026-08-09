"use client";

import { useState, useTransition } from "react";
import {
  deriveOperationalState,
  operationalStateLabel,
  type OperationalTimestamps,
} from "@/engines/orders/operational-state";
import { formatTimelineTime } from "@/workspaces/owner/orders/labels";
import {
  markOrderPickedUpAction,
  markOrderReadyAction,
  undoOrderPickedUpAction,
  undoOrderReadyAction,
} from "@/workspaces/owner/orders/actions";

type OrderOperationalControlsProps = {
  orderId: string;
  readyAt: string | null;
  pickedUpAt: string | null;
  /** Called after a successful mutation so the parent can refetch. */
  onSuccess?: () => void | Promise<void>;
  /** Quieter layout for dense surfaces (e.g. Order Workspace). */
  compact?: boolean;
};

type MutationKind = "ready" | "undo_ready" | "picked_up" | "undo_picked_up";

export function OrderOperationalControls({
  orderId,
  readyAt,
  pickedUpAt,
  onSuccess,
  compact = false,
}: OrderOperationalControlsProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeKind, setActiveKind] = useState<MutationKind | null>(null);

  const timestamps: OperationalTimestamps = { readyAt, pickedUpAt };
  const state = deriveOperationalState(timestamps);
  const label = operationalStateLabel(state);

  function run(kind: MutationKind, action: () => Promise<{ error: string | null }>) {
    setError(null);
    setActiveKind(kind);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setError(result.error);
          return;
        }
        await onSuccess?.();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not update operational state.",
        );
      } finally {
        setActiveKind(null);
      }
    });
  }

  const buttonClass =
    "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60";
  const primaryClass = `${buttonClass} bg-ink text-mist hover:bg-skyline`;
  const secondaryClass = `${buttonClass} border-line text-ink hover:bg-mist border`;

  return (
    <section
      className={
        compact
          ? "space-y-3"
          : "border-line space-y-3 rounded-lg border bg-mist/40 px-3 py-3"
      }
    >
      <div className="space-y-1">
        <h3 className="text-skyline text-[11px] font-semibold tracking-wide uppercase">
          Collection
        </h3>
        <p className="text-ink text-base font-semibold">{label}</p>
        {state === "ready" && readyAt ? (
          <p className="text-skyline text-xs">
            Ready at {formatTimelineTime(readyAt)}
          </p>
        ) : null}
        {state === "picked_up" && pickedUpAt ? (
          <p className="text-skyline text-xs">
            Picked up at {formatTimelineTime(pickedUpAt)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {state === "not_ready" ? (
          <>
            <button
              className={primaryClass}
              disabled={pending}
              onClick={() =>
                run("ready", () => markOrderReadyAction(orderId))
              }
              type="button"
            >
              {pending && activeKind === "ready" ? "Working…" : "Mark Ready"}
            </button>
            <button
              className={secondaryClass}
              disabled={pending}
              onClick={() =>
                run("picked_up", () => markOrderPickedUpAction(orderId))
              }
              type="button"
            >
              {pending && activeKind === "picked_up"
                ? "Working…"
                : "Mark Picked Up"}
            </button>
          </>
        ) : null}

        {state === "ready" ? (
          <>
            <button
              className={primaryClass}
              disabled={pending}
              onClick={() =>
                run("picked_up", () => markOrderPickedUpAction(orderId))
              }
              type="button"
            >
              {pending && activeKind === "picked_up"
                ? "Working…"
                : "Mark Picked Up"}
            </button>
            <button
              className={secondaryClass}
              disabled={pending}
              onClick={() =>
                run("undo_ready", () => undoOrderReadyAction(orderId))
              }
              type="button"
            >
              {pending && activeKind === "undo_ready"
                ? "Working…"
                : "Undo Ready"}
            </button>
          </>
        ) : null}

        {state === "picked_up" ? (
          <button
            className={secondaryClass}
            disabled={pending}
            onClick={() =>
              run("undo_picked_up", () => undoOrderPickedUpAction(orderId))
            }
            type="button"
          >
            {pending && activeKind === "undo_picked_up"
              ? "Working…"
              : "Undo Picked Up"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
