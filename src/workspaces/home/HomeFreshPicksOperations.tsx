"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  extraFreshPickOperationalStatus,
  extraFreshPickOperationalStatusLabel,
  extraOperationalActionFlags,
  type ExtraWorkspaceCapabilities,
} from "@/engines/extra/capabilities";
import {
  EXTRA_WALK_IN_HOLD_ACTIVE_ERROR,
  freshPickHomeSummaryLine,
} from "@/engines/extra/walk-in-hold";
import { unconfirmExtraStockAction } from "@/workspaces/extra/actions";
import { AssignExtraToOrderDialog } from "@/workspaces/extra/AssignExtraToOrderDialog";
import { CutExtraIntoSlicesDialog } from "@/workspaces/extra/CutExtraIntoSlicesDialog";
import { MoveExtraWindowDialog } from "@/workspaces/extra/MoveExtraWindowDialog";
import { WalkInHoldPanel } from "@/workspaces/extra/WalkInHoldPanel";
import type { ExtraStockUnit } from "@/workspaces/extra/types";

type HomeFreshPicksOperationsProps = {
  units: ExtraStockUnit[];
  capabilities: ExtraWorkspaceCapabilities;
  todayYmd: string;
};

const btnPrimary =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition disabled:opacity-60";
const btnSecondary =
  "border-fog text-ink hover:bg-mist inline-flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium transition disabled:opacity-60";

function extraWorkspaceHref(
  capabilities: ExtraWorkspaceCapabilities,
): { href: string; label: string } | null {
  if (capabilities.canAccessExtraSurface) {
    return { href: "/bakery/extra", label: "View Extra →" };
  }
  if (capabilities.canViewWalkInHold) {
    return {
      href: "/customer-operations/fresh-picks",
      label: "View Fresh Picks →",
    };
  }
  return null;
}

export function HomeFreshPicksOperations({
  units,
  capabilities,
  todayYmd,
}: HomeFreshPicksOperationsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assigningUnit, setAssigningUnit] = useState<ExtraStockUnit | null>(
    null,
  );
  const [movingUnit, setMovingUnit] = useState<ExtraStockUnit | null>(null);
  const [slicingUnit, setSlicingUnit] = useState<ExtraStockUnit | null>(null);
  const [undoingUnit, setUndoingUnit] = useState<ExtraStockUnit | null>(null);
  const extraLink = extraWorkspaceHref(capabilities);

  function runUnconfirm() {
    if (!undoingUnit) return;
    if (undoingUnit.walkInHeld) {
      setError(EXTRA_WALK_IN_HOLD_ACTIVE_ERROR);
      setUndoingUnit(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await unconfirmExtraStockAction(undoingUnit.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setUndoingUnit(null);
    });
  }

  return (
    <section aria-labelledby="home-fresh-picks">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2
          className="text-ink text-sm font-semibold tracking-wide"
          id="home-fresh-picks"
        >
          Fresh Picks
        </h2>
        {extraLink ? (
          <Link
            className="text-signal hover:text-ink shrink-0 text-sm font-medium transition"
            href={extraLink.href}
          >
            {extraLink.label}
          </Link>
        ) : null}
      </div>

      {error ? (
        <p className="text-status-danger mb-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {units.length === 0 ? (
        <p className="text-skyline text-sm">No Fresh Picks right now.</p>
      ) : (
        <ul className="space-y-2">
          {units.map((unit) => (
            <HomeFreshPickCard
              capabilities={capabilities}
              key={unit.id}
              pending={pending}
              todayYmd={todayYmd}
              unit={unit}
              onAssign={() => {
                setError(null);
                setAssigningUnit(unit);
              }}
              onCut={() => {
                setError(null);
                setSlicingUnit(unit);
              }}
              onMove={() => {
                setError(null);
                setMovingUnit(unit);
              }}
              onUndo={() => {
                setError(null);
                setUndoingUnit(unit);
              }}
            />
          ))}
        </ul>
      )}

      <AssignExtraToOrderDialog
        extra={assigningUnit}
        onAssigned={() => setAssigningUnit(null)}
        onClose={() => setAssigningUnit(null)}
        open={assigningUnit != null}
      />
      <MoveExtraWindowDialog
        extra={movingUnit}
        onClose={() => setMovingUnit(null)}
        onMoved={() => setMovingUnit(null)}
        open={movingUnit != null}
        todayYmd={todayYmd}
      />
      <CutExtraIntoSlicesDialog
        extra={slicingUnit}
        onClose={() => setSlicingUnit(null)}
        onCut={() => setSlicingUnit(null)}
        open={slicingUnit != null}
      />
      <ConfirmDialog
        allowDismiss={!pending}
        confirmLabel="Undo availability"
        description="Returns this Extra to a proposal. Use this only to reverse a mistaken confirm — not to assign, move, or cut a cake."
        onCancel={() => {
          if (pending) return;
          setUndoingUnit(null);
        }}
        onConfirm={runUnconfirm}
        open={undoingUnit != null}
        pending={pending}
        title="Undo availability?"
        tone="danger"
      />
    </section>
  );
}

function HomeFreshPickCard({
  unit,
  capabilities,
  todayYmd,
  pending,
  onAssign,
  onMove,
  onCut,
  onUndo,
}: {
  unit: ExtraStockUnit;
  capabilities: ExtraWorkspaceCapabilities;
  todayYmd: string;
  pending: boolean;
  onAssign: () => void;
  onMove: () => void;
  onCut: () => void;
  onUndo: () => void;
}) {
  const flags = extraOperationalActionFlags({
    capabilities,
    walkInHeld: unit.walkInHeld,
  });
  const status = extraFreshPickOperationalStatus(unit);
  const statusLabel = extraFreshPickOperationalStatusLabel(status);
  const summary = freshPickHomeSummaryLine({
    preparedOn: unit.preparedOn,
    pickupThroughAt: unit.pickupThroughAt,
    todayYmd,
  });
  const hasBakeryActions =
    flags.assign || flags.move || flags.cut || flags.unconfirm;
  const hasMore = flags.move || flags.cut || flags.unconfirm;

  return (
    <li className="border-fog rounded-xl border bg-white px-3.5 py-3">
      <p className="text-ink text-sm font-medium">
        {unit.cakeName}{" "}
        <span className="text-skyline font-normal">{unit.sizeLabel}</span>
      </p>
      <p className="text-skyline mt-0.5 text-[11px] font-medium tracking-wide uppercase">
        Fresh Pick · {statusLabel}
      </p>
      <p className="text-skyline mt-1 text-sm">{summary}</p>

      {unit.walkInHeld || !hasBakeryActions ? (
        <WalkInHoldPanel capabilities={capabilities} unit={unit} />
      ) : (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {flags.assign ? (
            <button
              className={btnPrimary}
              disabled={pending}
              onClick={onAssign}
              type="button"
            >
              Assign to order
            </button>
          ) : null}
          <WalkInHoldPanel
            capabilities={capabilities}
            className="inline-flex"
            unit={unit}
          />
          {hasMore ? (
            <details className="relative">
              <summary
                className={`${btnSecondary} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
              >
                More
              </summary>
              <div className="border-fog mt-2 flex flex-wrap gap-2 rounded-xl border bg-white p-2">
                {flags.move ? (
                  <button
                    className={btnSecondary}
                    disabled={pending}
                    onClick={onMove}
                    type="button"
                  >
                    Move pickup window
                  </button>
                ) : null}
                {flags.cut ? (
                  <button
                    className={btnSecondary}
                    disabled={pending}
                    onClick={onCut}
                    type="button"
                  >
                    Cut into slices
                  </button>
                ) : null}
                {flags.unconfirm ? (
                  <button
                    className={btnSecondary}
                    disabled={pending}
                    onClick={onUndo}
                    type="button"
                  >
                    Undo availability
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </li>
  );
}
