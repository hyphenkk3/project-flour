"use client";

import type { ExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import {
  EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES,
  formatWalkInHoldUntilClock,
} from "@/engines/extra/walk-in-hold";
import type { ExtraStockUnit } from "@/workspaces/extra/types";

type WalkInHoldPanelProps = {
  unit: ExtraStockUnit;
  capabilities: ExtraWorkspaceCapabilities;
  pending: boolean;
  onPlaceHold: (unit: ExtraStockUnit) => void;
  onExtend: (unit: ExtraStockUnit) => void;
  onRelease: (unit: ExtraStockUnit) => void;
};

const btnSecondary =
  "border-fog text-ink hover:bg-mist inline-flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium transition disabled:opacity-60";

export function WalkInHoldPanel({
  unit,
  capabilities,
  pending,
  onPlaceHold,
  onExtend,
  onRelease,
}: WalkInHoldPanelProps) {
  if (!capabilities.canViewWalkInHold) return null;

  if (!unit.walkInHeld) {
    if (!capabilities.canCreateWalkInHold) return null;
    return (
      <div className="mt-3">
        <button
          className={btnSecondary}
          disabled={pending}
          onClick={() => onPlaceHold(unit)}
          type="button"
        >
          Walk-in Hold
        </button>
      </div>
    );
  }

  const until = formatWalkInHoldUntilClock(unit.walkInHeldUntil);
  const extended = Boolean(unit.walkInHoldExtendedAt);
  const canMutate =
    capabilities.canExtendWalkInHold || capabilities.canReleaseWalkInHold;

  return (
    <div className="mt-3 space-y-2">
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
              disabled={pending || extended}
              onClick={() => onExtend(unit)}
              type="button"
            >
              Extend {EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES} min
            </button>
          ) : null}
          {capabilities.canReleaseWalkInHold ? (
            <button
              className={btnSecondary}
              disabled={pending}
              onClick={() => onRelease(unit)}
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
          The one {EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES}-minute extension has
          been used.
        </p>
      ) : null}
    </div>
  );
}
