"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DATA_FETCH_TIMEOUT_MS } from "@/lib/supabase/fetch-timeout";
import {
  markBakeryOrderReadyAction,
  startBakeryProductionAction,
  undoBakeryOrderReadyAction,
  undoBakeryProductionStartAction,
} from "@/workspaces/bakery/actions";
import {
  BAKERY_WAITING_CONFIRMATION_START_LABEL,
  type BakeryProductionSurface,
} from "@/workspaces/bakery/eligibility";

const ACTION_TIMEOUT_MS = Math.max(DATA_FETCH_TIMEOUT_MS, 15_000);
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

type BakeryProductionActionsProps = {
  orderId: string;
  surface: BakeryProductionSurface;
};

type MutationKind = "start" | "undo_start" | "mark_ready" | "undo_ready";

export function BakeryProductionActions({
  orderId,
  surface,
}: BakeryProductionActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [activeKind, setActiveKind] = useState<MutationKind | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (surface.kind === "none") {
    return null;
  }

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
      const result = await withTimeout(action(), ACTION_TIMEOUT_MS);
      if (result.error) {
        setError(result.error);
        return;
      }
      succeeded = true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update production.",
      );
    } finally {
      setActiveKind(null);
      setPending(false);
      setConfirmOpen(false);
    }
    if (succeeded) {
      try {
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Updated, but the screen did not refresh. Reload to see the latest state.",
        );
      }
    }
  }

  const primaryClass =
    "bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition disabled:opacity-60";
  const secondaryClass =
    "border-fog text-ink hover:bg-mist inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border bg-white px-5 text-sm font-medium transition disabled:opacity-60";
  const disabledClass =
    "bg-mist text-skyline border-fog/80 inline-flex min-h-12 shrink-0 cursor-not-allowed items-center justify-center rounded-xl border px-5 text-sm font-medium";

  function workingLabel(kind: MutationKind, idle: string) {
    return pending && activeKind === kind ? "Working…" : idle;
  }

  return (
    <>
      <div className="border-fog sticky bottom-0 z-20 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-5 py-4 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl min-w-0">
            <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
              Production
            </p>
            {surface.kind === "waiting_confirmation" ? (
              <p className="text-skyline mt-1.5 text-sm leading-relaxed">
                {surface.reason}
              </p>
            ) : surface.kind === "in_production" ? (
              <p className="text-skyline mt-1.5 text-sm leading-relaxed">
                Mark Ready when this order can leave Bakery. Undo Start only if
                production has not finished.
              </p>
            ) : surface.kind === "undo_ready" ? (
              <p className="text-skyline mt-1.5 text-sm leading-relaxed">
                This order is Ready. Undo Ready only before Collection handoff.
              </p>
            ) : surface.kind === "start_unsecured" ? (
              <p className="text-skyline mt-1.5 text-sm leading-relaxed">
                Payment is still pending. You can start production if the cake
                needs to be prepared now.
              </p>
            ) : (
              <p className="text-skyline mt-1.5 text-sm leading-relaxed">
                Start production when you begin this order.
              </p>
            )}
          </div>

          {surface.kind === "waiting_confirmation" ? (
            <span
              aria-disabled="true"
              className={disabledClass}
              title={surface.reason}
            >
              {BAKERY_WAITING_CONFIRMATION_START_LABEL}
            </span>
          ) : surface.kind === "in_production" ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {surface.canMarkReady ? (
                <button
                  className={primaryClass}
                  disabled={pending}
                  onClick={() =>
                    run("mark_ready", () => markBakeryOrderReadyAction(orderId))
                  }
                  type="button"
                >
                  {workingLabel("mark_ready", "Mark Ready for Collection")}
                </button>
              ) : null}
              {surface.canUndoStart ? (
                <button
                  className={secondaryClass}
                  disabled={pending}
                  onClick={() =>
                    run("undo_start", () =>
                      undoBakeryProductionStartAction(orderId),
                    )
                  }
                  type="button"
                >
                  {workingLabel("undo_start", "Undo Start")}
                </button>
              ) : null}
            </div>
          ) : surface.kind === "undo_ready" ? (
            <button
              className={secondaryClass}
              disabled={pending}
              onClick={() =>
                run("undo_ready", () => undoBakeryOrderReadyAction(orderId))
              }
              type="button"
            >
              {workingLabel("undo_ready", "Undo Ready")}
            </button>
          ) : surface.kind === "start_unsecured" ? (
            <button
              className={primaryClass}
              disabled={pending}
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
              type="button"
            >
              {workingLabel("start", "Start Production")}
            </button>
          ) : (
            <button
              className={primaryClass}
              disabled={pending}
              onClick={() =>
                run("start", () => startBakeryProductionAction(orderId))
              }
              type="button"
            >
              {workingLabel("start", "Start Production")}
            </button>
          )}
        </div>
        {error ? (
          <p className="text-status-danger mx-auto max-w-5xl px-5 pb-4 text-sm sm:px-8">
            {error}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Start Production"
        description="Payment is still pending for this preorder. Start production anyway?"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() =>
          run("start", () => startBakeryProductionAction(orderId))
        }
        open={confirmOpen}
        pending={pending && activeKind === "start"}
        title="Start production?"
      />
    </>
  );
}
