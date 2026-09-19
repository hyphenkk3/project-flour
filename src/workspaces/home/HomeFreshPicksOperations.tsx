"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import {
  extraOperationalActionFlags,
  type ExtraWorkspaceCapabilities,
} from "@/engines/extra/capabilities";
import {
  formatHomeFreshPickSizePrice,
  homeFreshPickStatusLabel,
  previewHomeFreshPicks,
} from "@/engines/extra/home-fresh-picks";
import {
  EXTRA_WALK_IN_HOLD_ACTIVE_ERROR,
  freshPickHomeSummaryLine,
  walkInHoldHomeUntilLine,
} from "@/engines/extra/walk-in-hold";
import {
  listHomeFreshPickUnitsAction,
  unconfirmExtraStockAction,
} from "@/workspaces/extra/actions";
import { AssignExtraToOrderDialog } from "@/workspaces/extra/AssignExtraToOrderDialog";
import { CutExtraIntoSlicesDialog } from "@/workspaces/extra/CutExtraIntoSlicesDialog";
import { MoveExtraWindowDialog } from "@/workspaces/extra/MoveExtraWindowDialog";
import { WalkInHoldPanel } from "@/workspaces/extra/WalkInHoldPanel";
import type { ExtraStockUnit } from "@/workspaces/extra/types";

type HomeFreshPicksOperationsProps = {
  units: ExtraStockUnit[];
  capabilities: ExtraWorkspaceCapabilities;
  todayYmd: string;
  loadError?: boolean;
};

const btnPrimary =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition disabled:opacity-60";
const btnSecondary =
  "border-fog text-ink hover:bg-mist inline-flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium transition disabled:opacity-60";

function homeFreshPicksDesktopGridClass(count: number): string {
  if (count <= 1) return "lg:max-w-md";
  return "lg:grid-cols-2";
}

function extraWorkspaceHref(
  capabilities: ExtraWorkspaceCapabilities,
): { href: string; label: string } | null {
  if (capabilities.canAccessExtraSurface) {
    return { href: "/bakery/extra", label: "View all →" };
  }
  if (capabilities.canViewWalkInHold) {
    return {
      href: "/customer-operations/fresh-picks",
      label: "View all →",
    };
  }
  return null;
}

export function HomeFreshPicksOperations({
  units: initialUnits,
  capabilities,
  todayYmd,
  loadError: initialLoadError = false,
}: HomeFreshPicksOperationsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState({
    units: initialUnits,
    loadError: initialLoadError,
    fromProps: initialUnits,
  });
  if (view.fromProps !== initialUnits) {
    setView({
      units: initialUnits,
      loadError: initialLoadError,
      fromProps: initialUnits,
    });
  }
  const units = view.units;
  const loadError = view.loadError;
  const [now, setNow] = useState(() => new Date());
  const [assigningUnit, setAssigningUnit] = useState<ExtraStockUnit | null>(
    null,
  );
  const [movingUnit, setMovingUnit] = useState<ExtraStockUnit | null>(null);
  const [slicingUnit, setSlicingUnit] = useState<ExtraStockUnit | null>(null);
  const [undoingUnit, setUndoingUnit] = useState<ExtraStockUnit | null>(null);
  const extraLink = extraWorkspaceHref(capabilities);
  const preview = previewHomeFreshPicks(units);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);

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

  function retryFreshPicks() {
    setError(null);
    setLoading(true);
    startTransition(async () => {
      const result = await listHomeFreshPickUnitsAction();
      setLoading(false);
      if (result.error) {
        setView((current) => ({ ...current, loadError: true }));
        return;
      }
      setView((current) => ({
        ...current,
        loadError: false,
        units: result.units,
      }));
    });
  }

  return (
    <section aria-labelledby="home-fresh-picks">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2
          className="text-ink text-sm font-semibold tracking-wide"
          id="home-fresh-picks"
        >
          Fresh Picks · {units.length}
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

      {loading ? (
        <p className="text-skyline text-sm">Loading Fresh Picks…</p>
      ) : loadError ? (
        <div className="space-y-3">
          <p className="text-skyline text-sm" role="alert">
            We couldn&apos;t load Fresh Picks right now.
          </p>
          <button
            className={btnSecondary}
            disabled={pending}
            onClick={retryFreshPicks}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : units.length === 0 ? (
        <p className="text-skyline text-sm">
          Nothing fresh at the moment. Check back later — the Bakery may add
          more anytime.
        </p>
      ) : (
        <ul
          className={`grid grid-cols-1 gap-2 lg:gap-3 ${homeFreshPicksDesktopGridClass(preview.length)}`}
        >
          {preview.map((unit) => (
            <HomeFreshPickCard
              capabilities={capabilities}
              key={unit.id}
              now={now}
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
  now,
  onAssign,
  onMove,
  onCut,
  onUndo,
}: {
  unit: ExtraStockUnit;
  capabilities: ExtraWorkspaceCapabilities;
  todayYmd: string;
  pending: boolean;
  now: Date;
  onAssign: () => void;
  onMove: () => void;
  onCut: () => void;
  onUndo: () => void;
}) {
  const flags = extraOperationalActionFlags({
    capabilities,
    walkInHeld: unit.walkInHeld,
  });
  const statusLabel = homeFreshPickStatusLabel({
    walkInHeld: unit.walkInHeld,
    confirmedAt: unit.confirmedAt,
    now,
  });
  const sizePrice = formatHomeFreshPickSizePrice({
    sizeLabel: unit.sizeLabel,
    unitPrice: unit.unitPrice,
  });
  const summary = freshPickHomeSummaryLine({
    preparedOn: unit.preparedOn,
    pickupThroughAt: unit.pickupThroughAt,
    todayYmd,
  });
  const hasMore = flags.move || flags.cut || flags.unconfirm;
  const photoAlt = unit.imageAlt?.trim() || unit.cakeName;

  return (
    <li
      className={[
        "border-fog flex gap-3 rounded-xl border px-3 py-3 lg:flex-col",
        unit.walkInHeld ? "bg-mist" : "bg-white",
      ].join(" ")}
    >
      <div className="bg-fog relative h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-[10px] lg:aspect-square lg:h-auto lg:w-full">
        {unit.imageUrl ? (
          <CakePhotoImage
            alt={photoAlt}
            sizes="(min-width: 1024px) 180px, 88px"
            src={unit.imageUrl}
          />
        ) : (
          <span className="text-skyline flex h-full items-center justify-center px-1.5 text-center text-[10px]">
            Photo coming soon
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-ink line-clamp-2 text-sm font-medium leading-snug">
          {unit.cakeName}
        </p>
        {sizePrice ? (
          <p className="text-skyline mt-0.5 text-sm tabular-nums">{sizePrice}</p>
        ) : null}
        <p className="text-skyline mt-1 text-[11px] font-medium">{statusLabel}</p>
        {unit.walkInHeld ? (
          <>
            <p className="text-skyline mt-0.5 text-sm">
              {walkInHoldHomeUntilLine(unit.walkInHeldUntil, now)}
            </p>
            <p className="text-skyline mt-0.5 text-sm">
              Held by {unit.walkInHeldByName?.trim() || "staff"}
            </p>
          </>
        ) : (
          <p className="text-skyline mt-0.5 text-sm">{summary}</p>
        )}

        <div
          className="mt-3 flex flex-wrap items-start gap-2 lg:mt-auto lg:items-center lg:pt-3 lg:[&>button]:shrink-0 lg:[&>button]:whitespace-nowrap lg:[&>details>summary]:shrink-0 lg:[&>details>summary]:whitespace-nowrap"
          onClick={(event) => event.stopPropagation()}
        >
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
            className="contents"
            layout="actions"
            unit={unit}
          />
          {hasMore ? (
            <details className="relative">
              <summary
                className={`${btnSecondary} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
              >
                More ▾
              </summary>
              <div className="border-fog absolute left-0 z-20 mt-1 flex min-w-[12.5rem] flex-col gap-1 rounded-xl border bg-white p-2 shadow-lg">
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
      </div>
    </li>
  );
}
