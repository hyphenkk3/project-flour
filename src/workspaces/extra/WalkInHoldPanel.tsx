"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import {
  EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES,
  EXTRA_WALK_IN_HOLD_MINUTES,
  WALK_IN_HOLD_RELEASE_CONFIRM_DESCRIPTION,
  formatWalkInHoldUntilClock,
  walkInHoldExtendConfirmDescription,
  walkInHoldPlaceConfirmDescription,
} from "@/engines/extra/walk-in-hold";
import {
  extendExtraWalkInHoldAction,
  holdExtraStockWalkInAction,
  releaseExtraWalkInHoldAction,
} from "@/workspaces/extra/actions";
import type { ExtraStockUnit } from "@/workspaces/extra/types";

type WalkInHoldPanelProps = {
  unit: ExtraStockUnit;
  capabilities: ExtraWorkspaceCapabilities;
  className?: string;
  disabled?: boolean;
};

const btnSecondary =
  "border-fog text-ink hover:bg-mist inline-flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium transition disabled:opacity-60";

export function WalkInHoldPanel({
  unit,
  capabilities,
  className,
  disabled = false,
}: WalkInHoldPanelProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"hold" | "extend" | "release" | null>(
    null,
  );
  const busy = pending || disabled;

  function runHold() {
    setError(null);
    startTransition(async () => {
      const result = await holdExtraStockWalkInAction(unit.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDialog(null);
    });
  }

  function runExtend() {
    setError(null);
    startTransition(async () => {
      const result = await extendExtraWalkInHoldAction(unit.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDialog(null);
    });
  }

  function runRelease() {
    setError(null);
    startTransition(async () => {
      const result = await releaseExtraWalkInHoldAction(unit.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDialog(null);
    });
  }

  if (!capabilities.canViewWalkInHold) return null;
  if (!unit.walkInHeld && !capabilities.canCreateWalkInHold) return null;

  const until = formatWalkInHoldUntilClock(unit.walkInHeldUntil);
  const extended = Boolean(unit.walkInHoldExtendedAt);
  const canMutate =
    capabilities.canExtendWalkInHold || capabilities.canReleaseWalkInHold;

  return (
    <div className={className ?? "mt-3 space-y-2"}>
      {!unit.walkInHeld ? (
        capabilities.canCreateWalkInHold ? (
          <button
            className={btnSecondary}
            disabled={busy}
            onClick={() => {
              setError(null);
              setDialog("hold");
            }}
            type="button"
          >
            Walk-in Hold
          </button>
        ) : null
      ) : (
        <>
          <p className="text-ink text-sm font-medium">Walk-in Hold</p>
          <p className="text-skyline text-sm">Held until {until}</p>
          <p className="text-skyline text-sm">
            Held by {unit.walkInHeldByName?.trim() || "staff"}
          </p>
          {canMutate ? (
            <div className="flex flex-wrap gap-2">
              {capabilities.canExtendWalkInHold ? (
                <button
                  className={btnSecondary}
                  disabled={busy || extended}
                  onClick={() => {
                    setError(null);
                    setDialog("extend");
                  }}
                  type="button"
                >
                  Extend {EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES} min
                </button>
              ) : null}
              {capabilities.canReleaseWalkInHold ? (
                <button
                  className={btnSecondary}
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setDialog("release");
                  }}
                  type="button"
                >
                  Release
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-skyline text-xs leading-relaxed">
              Bakery can see this hold but cannot place, extend, or release it.
            </p>
          )}
          {canMutate && extended ? (
            <p className="text-skyline text-xs leading-relaxed">
              The one {EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES}-minute extension
              has been used.
            </p>
          ) : null}
        </>
      )}
      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        allowDismiss={!pending}
        confirmLabel="Place Hold"
        description={walkInHoldPlaceConfirmDescription(
          EXTRA_WALK_IN_HOLD_MINUTES,
        )}
        onCancel={() => {
          if (pending) return;
          setDialog(null);
        }}
        onConfirm={runHold}
        open={dialog === "hold"}
        pending={pending}
        title="Walk-in Hold?"
      />
      <ConfirmDialog
        allowDismiss={!pending}
        confirmLabel={`Extend ${EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES} min`}
        description={walkInHoldExtendConfirmDescription(
          EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES,
        )}
        onCancel={() => {
          if (pending) return;
          setDialog(null);
        }}
        onConfirm={runExtend}
        open={dialog === "extend"}
        pending={pending}
        title="Extend walk-in hold?"
      />
      <ConfirmDialog
        allowDismiss={!pending}
        confirmLabel="Release"
        description={WALK_IN_HOLD_RELEASE_CONFIRM_DESCRIPTION}
        onCancel={() => {
          if (pending) return;
          setDialog(null);
        }}
        onConfirm={runRelease}
        open={dialog === "release"}
        pending={pending}
        title="Release walk-in hold?"
      />
    </div>
  );
}
