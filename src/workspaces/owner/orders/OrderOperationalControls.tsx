"use client";

import { useState } from "react";
import { DATA_FETCH_TIMEOUT_MS } from "@/lib/supabase/fetch-timeout";
import {
  deriveOperationalState,
  isDeliveryFulfilment,
  MARK_OUT_FOR_DELIVERY_LABEL,
  operationalCompleteActionLabel,
  operationalCompletedAtPrefix,
  operationalSectionTitle,
  operationalStateLabel,
  operationalUndoCompleteActionLabel,
  UNDO_OUT_FOR_DELIVERY_LABEL,
  type OperationalTimestamps,
} from "@/engines/orders/operational-state";
import type { StorefrontOrderFulfilmentMethod } from "@/types/storefront";
import { formatTimelineTime } from "@/workspaces/owner/orders/labels";
import {
  markOrderDeliveredAction,
  markOrderOutForDeliveryAction,
  markOrderPickedUpAction,
  markOrderReadyAction,
  undoOrderDeliveredAction,
  undoOrderOutForDeliveryAction,
  undoOrderPickedUpAction,
  undoOrderReadyAction,
} from "@/workspaces/owner/orders/actions";

type OrderOperationalControlsProps = {
  orderId: string;
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null;
  /** Called after a successful mutation so the parent can refetch. */
  onSuccess?: () => void | Promise<void>;
  /** Quieter layout for dense surfaces (e.g. Order Workspace). */
  compact?: boolean;
  /**
   * Mark/Undo Ready (Owner). SQL allowlist is bakery|manager|owner —
   * Customer Operations must not see these controls.
   */
  canMarkReady?: boolean;
};

type MutationKind =
  | "ready"
  | "undo_ready"
  | "picked_up"
  | "undo_picked_up"
  | "out_for_delivery"
  | "undo_out_for_delivery"
  | "delivered"
  | "undo_delivered";

const OPERATIONAL_ACTION_TIMEOUT_MS = Math.max(DATA_FETCH_TIMEOUT_MS, 15_000);
const ACTION_TIMEOUT_MESSAGE =
  "This update is taking too long. Reload and check whether it saved.";

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(ACTION_TIMEOUT_MESSAGE));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function OrderOperationalControls({
  orderId,
  readyAt,
  pickedUpAt,
  outForDeliveryAt = null,
  deliveredAt = null,
  fulfilmentMethod = null,
  onSuccess,
  compact = false,
  canMarkReady = true,
}: OrderOperationalControlsProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [activeKind, setActiveKind] = useState<MutationKind | null>(null);

  const isDelivery = isDeliveryFulfilment(fulfilmentMethod);
  const timestamps: OperationalTimestamps = {
    readyAt,
    pickedUpAt,
    outForDeliveryAt,
    deliveredAt,
    fulfilmentMethod,
  };
  const state = deriveOperationalState(timestamps);
  const label = operationalStateLabel(state, fulfilmentMethod);
  const sectionTitle = operationalSectionTitle(fulfilmentMethod);
  const completeLabel = operationalCompleteActionLabel(fulfilmentMethod);
  const undoCompleteLabel = operationalUndoCompleteActionLabel(fulfilmentMethod);
  const completedAtPrefix = operationalCompletedAtPrefix(fulfilmentMethod);

  async function run(
    kind: MutationKind,
    action: () => Promise<{ error: string | null }>,
  ) {
    if (pending) return;
    setError(null);
    setActiveKind(kind);
    setPending(true);
    let succeeded = false;
    try {
      const result = await withTimeout(
        action(),
        OPERATIONAL_ACTION_TIMEOUT_MS,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      succeeded = true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update operational state.",
      );
    } finally {
      setActiveKind(null);
      setPending(false);
    }
    // Refresh after the button has recovered. Never await router.refresh()
    // while Working… is shown — that left the button hung (M4-P3 Slice 2A).
    if (succeeded) {
      try {
        await onSuccess?.();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Updated, but the screen did not refresh. Reload to see the latest state.",
        );
      }
    }
  }

  const buttonClass =
    "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60";
  const primaryClass = `${buttonClass} bg-ink text-mist hover:bg-skyline`;
  const secondaryClass = `${buttonClass} border-line text-ink hover:bg-mist border`;

  function workingLabel(kind: MutationKind, idle: string) {
    return pending && activeKind === kind ? "Working…" : idle;
  }

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
          {sectionTitle}
        </h3>
        <p className="text-ink text-base font-semibold">{label}</p>
        {state === "ready" && readyAt ? (
          <p className="text-skyline text-xs">
            Ready at {formatTimelineTime(readyAt)}
          </p>
        ) : null}
        {state === "out_for_delivery" && outForDeliveryAt ? (
          <p className="text-skyline text-xs">
            Out for delivery at {formatTimelineTime(outForDeliveryAt)}
          </p>
        ) : null}
        {state === "delivered" && deliveredAt ? (
          <p className="text-skyline text-xs">
            {completedAtPrefix} {formatTimelineTime(deliveredAt)}
          </p>
        ) : null}
        {state === "picked_up" && pickedUpAt ? (
          <p className="text-skyline text-xs">
            {completedAtPrefix} {formatTimelineTime(pickedUpAt)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {isDelivery ? (
          <>
            {state === "not_ready" ? (
              <>
                {canMarkReady ? (
                  <button
                    className={primaryClass}
                    disabled={pending}
                    onClick={() =>
                      run("ready", () => markOrderReadyAction(orderId))
                    }
                    type="button"
                  >
                    {workingLabel("ready", "Mark Ready")}
                  </button>
                ) : null}
                <button
                  className={canMarkReady ? secondaryClass : primaryClass}
                  disabled={pending}
                  onClick={() =>
                    run("out_for_delivery", () =>
                      markOrderOutForDeliveryAction(orderId),
                    )
                  }
                  type="button"
                >
                  {workingLabel("out_for_delivery", MARK_OUT_FOR_DELIVERY_LABEL)}
                </button>
              </>
            ) : null}

            {state === "ready" ? (
              <>
                <button
                  className={primaryClass}
                  disabled={pending}
                  onClick={() =>
                    run("out_for_delivery", () =>
                      markOrderOutForDeliveryAction(orderId),
                    )
                  }
                  type="button"
                >
                  {workingLabel("out_for_delivery", MARK_OUT_FOR_DELIVERY_LABEL)}
                </button>
                <button
                  className={secondaryClass}
                  disabled={pending}
                  onClick={() =>
                    run("delivered", () => markOrderDeliveredAction(orderId))
                  }
                  type="button"
                >
                  {workingLabel("delivered", completeLabel)}
                </button>
                {canMarkReady ? (
                  <button
                    className={secondaryClass}
                    disabled={pending}
                    onClick={() =>
                      run("undo_ready", () => undoOrderReadyAction(orderId))
                    }
                    type="button"
                  >
                    {workingLabel("undo_ready", "Undo Ready")}
                  </button>
                ) : null}
              </>
            ) : null}

            {state === "out_for_delivery" ? (
              <>
                <button
                  className={primaryClass}
                  disabled={pending}
                  onClick={() =>
                    run("delivered", () => markOrderDeliveredAction(orderId))
                  }
                  type="button"
                >
                  {workingLabel("delivered", completeLabel)}
                </button>
                <button
                  className={secondaryClass}
                  disabled={pending}
                  onClick={() =>
                    run("undo_out_for_delivery", () =>
                      undoOrderOutForDeliveryAction(orderId),
                    )
                  }
                  type="button"
                >
                  {workingLabel(
                    "undo_out_for_delivery",
                    UNDO_OUT_FOR_DELIVERY_LABEL,
                  )}
                </button>
              </>
            ) : null}

            {state === "delivered" ? (
              <button
                className={secondaryClass}
                disabled={pending}
                onClick={() =>
                  run("undo_delivered", () => undoOrderDeliveredAction(orderId))
                }
                type="button"
              >
                {workingLabel("undo_delivered", undoCompleteLabel)}
              </button>
            ) : null}
          </>
        ) : (
          <>
            {state === "not_ready" ? (
              <>
                {canMarkReady ? (
                  <button
                    className={primaryClass}
                    disabled={pending}
                    onClick={() =>
                      run("ready", () => markOrderReadyAction(orderId))
                    }
                    type="button"
                  >
                    {workingLabel("ready", "Mark Ready")}
                  </button>
                ) : null}
                <button
                  className={canMarkReady ? secondaryClass : primaryClass}
                  disabled={pending}
                  onClick={() =>
                    run("picked_up", () => markOrderPickedUpAction(orderId))
                  }
                  type="button"
                >
                  {workingLabel("picked_up", completeLabel)}
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
                  {workingLabel("picked_up", completeLabel)}
                </button>
                {canMarkReady ? (
                  <button
                    className={secondaryClass}
                    disabled={pending}
                    onClick={() =>
                      run("undo_ready", () => undoOrderReadyAction(orderId))
                    }
                    type="button"
                  >
                    {workingLabel("undo_ready", "Undo Ready")}
                  </button>
                ) : null}
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
                {workingLabel("undo_picked_up", undoCompleteLabel)}
              </button>
            ) : null}
          </>
        )}
      </div>

      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
