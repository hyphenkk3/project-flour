"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField, FormTextarea } from "@/components/ui/form";
import { formatLongBusinessDate } from "@/lib/dates";
import type { ExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import { isBakeryExtraProposalActionable } from "@/engines/extra/availability";
import {
  clampExtraOrderCutoffDate,
  defaultExtraOrderCutoffSlot,
  defaultExtraPickupFromSlot,
  evaluateExtraConfirm,
  extraAvailabilityDayLabel,
  extraFreshPickDates,
  extraFreshPickDay,
  formatExtraBoardWindowInstant,
  extraOrderCutoffDateOptions,
  extraOrderCutoffSlotsForDate,
  extraPickupFromSlotsForDate,
  extraPickupThroughIso,
  EXTRA_NO_TODAY_SLOTS_LEFT,
  EXTRA_THROUGH_SLOT_REQUIRED,
} from "@/engines/extra/fresh-picks-eligibility";
import {
  confirmExtraStockAction,
  createConfirmedExtraStockAction,
  proposeExtraStockAction,
  rejectExtraStockAction,
  unconfirmExtraStockAction,
  undoRejectExtraStockAction,
} from "@/workspaces/extra/actions";
import type { ExtraCakeOption, ExtraStockUnit } from "@/workspaces/extra/types";

type ExtraBoardProps = {
  units: ExtraStockUnit[];
  cakes: ExtraCakeOption[];
  capabilities: ExtraWorkspaceCapabilities;
  initialMode?: "propose" | "create";
  todayYmd: string;
};

type WindowDraft = {
  pickupFromDate: string;
  pickupFromSlot: string;
  cutoffDate: string;
  cutoffSlot: string;
};

function initialWindow(todayYmd: string, preparedOn?: string | null): WindowDraft {
  const locked = extraFreshPickDay(preparedOn ?? null, todayYmd);
  const pickupFromDate = locked && preparedOn ? preparedOn : todayYmd;
  const pickupFromSlot =
    defaultExtraPickupFromSlot({ pickupFromDate, todayYmd }) ?? "";
  const fromIso = extraPickupThroughIso(pickupFromDate, pickupFromSlot);
  const cutoffDate = todayYmd;
  let cutoffSlot =
    defaultExtraOrderCutoffSlot({
      cutoffDate,
      todayYmd,
      notBeforeIso: fromIso ?? undefined,
    }) ?? "";
  if (!cutoffSlot && extraFreshPickDates(todayYmd).tomorrow) {
    return {
      pickupFromDate,
      pickupFromSlot,
      cutoffDate: extraFreshPickDates(todayYmd).tomorrow!,
      cutoffSlot:
        defaultExtraOrderCutoffSlot({
          cutoffDate: extraFreshPickDates(todayYmd).tomorrow!,
          todayYmd,
          notBeforeIso: fromIso ?? undefined,
        }) ?? "",
    };
  }
  return { pickupFromDate, pickupFromSlot, cutoffDate, cutoffSlot };
}

export function ExtraBoard({
  units,
  cakes,
  capabilities,
  initialMode = "create",
  todayYmd,
}: ExtraBoardProps) {
  const dates = extraFreshPickDates(todayYmd);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"propose" | "create">(
    initialMode === "propose" && capabilities.canProposeExtra
      ? "propose"
      : capabilities.canCreateConfirmedExtra
        ? "create"
        : "propose",
  );
  const [rejectingUnit, setRejectingUnit] = useState<ExtraStockUnit | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [drafts, setDrafts] = useState<Record<string, WindowDraft>>({});

  const proposed = useMemo(
    () => units.filter((u) => isBakeryExtraProposalActionable(u)),
    [units],
  );
  const eligibleProposed = useMemo(
    () =>
      proposed.filter(
        (u) => !u.preparedOn || extraFreshPickDay(u.preparedOn, todayYmd),
      ),
    [proposed, todayYmd],
  );
  const ineligibleProposed = useMemo(
    () =>
      proposed.filter(
        (u) => u.preparedOn && !extraFreshPickDay(u.preparedOn, todayYmd),
      ),
    [proposed, todayYmd],
  );
  const freshPicks = useMemo(
    () => units.filter((u) => u.available && !u.soldAt),
    [units],
  );
  const sold = useMemo(
    () => units.filter((u) => u.lifecycle === "confirmed" && Boolean(u.soldAt)),
    [units],
  );
  const past = useMemo(
    () =>
      units.filter(
        (u) =>
          u.lifecycle === "rejected" ||
          (u.lifecycle === "confirmed" && !u.soldAt && !u.available),
      ),
    [units],
  );

  const [cakeId, setCakeId] = useState(cakes[0]?.id ?? "");
  const selectedCake = cakes.find((c) => c.id === cakeId) ?? cakes[0];
  const [sizeId, setSizeId] = useState(selectedCake?.sizes[0]?.id ?? "");
  const selectedSize =
    selectedCake?.sizes.find((s) => s.id === sizeId) ??
    selectedCake?.sizes[0];

  const [preparedOn, setPreparedOn] = useState(todayYmd);
  const [createWindow, setCreateWindow] = useState<WindowDraft>(() =>
    initialWindow(todayYmd),
  );
  const [note, setNote] = useState("");

  function onCakeChange(nextId: string) {
    setCakeId(nextId);
    const cake = cakes.find((c) => c.id === nextId);
    setSizeId(cake?.sizes[0]?.id ?? "");
  }

  function patchCreateWindow(patch: Partial<WindowDraft>) {
    setCreateWindow((prev) => nextWindow(prev, patch, todayYmd));
  }

  function draftFor(unit: ExtraStockUnit): WindowDraft {
    return drafts[unit.id] ?? initialWindow(todayYmd, unit.preparedOn);
  }

  function patchDraft(unitId: string, patch: Partial<WindowDraft>) {
    setDrafts((prev) => {
      const unit = units.find((row) => row.id === unitId);
      const base = prev[unitId] ?? initialWindow(todayYmd, unit?.preparedOn);
      return { ...prev, [unitId]: nextWindow(base, patch, todayYmd) };
    });
  }

  function runCreateOrPropose() {
    if (!selectedCake || !selectedSize) {
      setError("Choose a cake and size.");
      return;
    }
    setError(null);
    if (mode === "create" && !createWindow.cutoffSlot) {
      setError(
        extraFreshPickDay(createWindow.cutoffDate, todayYmd) === "today"
          ? EXTRA_NO_TODAY_SLOTS_LEFT
          : EXTRA_THROUGH_SLOT_REQUIRED,
      );
      return;
    }
    startTransition(async () => {
      if (mode === "propose") {
        const result = await proposeExtraStockAction({
          cakeName: selectedCake.name,
          sizeLabel: selectedSize.label,
          preparedOn: preparedOn || null,
          note: note || null,
          libraryCakeId: selectedCake.id,
          libraryCakeSizeId: selectedSize.id,
        });
        if (result.error) setError(result.error);
        else setNote("");
        return;
      }
      const result = await createConfirmedExtraStockAction({
        cakeName: selectedCake.name,
        sizeLabel: selectedSize.label,
        pickupFromDate: createWindow.pickupFromDate,
        pickupFromSlot: createWindow.pickupFromSlot,
        cutoffDate: createWindow.cutoffDate,
        cutoffSlot: createWindow.cutoffSlot,
        note: note || null,
        libraryCakeId: selectedCake.id,
        libraryCakeSizeId: selectedSize.id,
      });
      if (result.error) setError(result.error);
      else {
        setNote("");
        setCreateWindow(initialWindow(todayYmd));
      }
    });
  }

  function runConfirm(unit: ExtraStockUnit) {
    const draft = draftFor(unit);
    const decision = evaluateExtraConfirm({
      pickupFromDate: draft.pickupFromDate,
      pickupFromSlot: draft.pickupFromSlot,
      cutoffDate: draft.cutoffDate,
      cutoffSlot: draft.cutoffSlot,
      todayYmd,
    });
    if (!decision.ok) {
      setError(decision.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await confirmExtraStockAction({
        extraStockId: unit.id,
        pickupFromDate: decision.pickupFromDate,
        pickupFromSlot: decision.pickupFromSlot,
        cutoffDate: decision.cutoffDate,
        cutoffSlot: decision.cutoffSlot,
        note: note || unit.note,
      });
      if (result.error) setError(result.error);
    });
  }

  function runUnconfirm(unit: ExtraStockUnit) {
    if (unit.soldAt) {
      setError("Cannot undo a sold Extra.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await unconfirmExtraStockAction(unit.id);
      if (result.error) setError(result.error);
    });
  }

  function openReject(unit: ExtraStockUnit) {
    setError(null);
    setRejectingUnit(unit);
    setRejectReason("");
  }

  function runReject() {
    if (!rejectingUnit) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setError("A rejection reason is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await rejectExtraStockAction(rejectingUnit.id, reason);
      if (result.error) setError(result.error);
      else {
        setRejectingUnit(null);
        setRejectReason("");
      }
    });
  }

  function runUndoReject(unit: ExtraStockUnit) {
    setError(null);
    startTransition(async () => {
      const result = await undoRejectExtraStockAction(unit.id);
      if (result.error) setError(result.error);
    });
  }

  const fieldClass =
    "border-fog text-ink focus:border-signal w-full rounded-lg border bg-white px-3 py-2.5 text-base outline-none";
  const btnPrimary =
    "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition disabled:opacity-60";
  const btnSecondary =
    "border-fog text-ink hover:bg-mist inline-flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium transition disabled:opacity-60";

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-7 pb-20 sm:px-8 sm:py-10">
      <p>
        <Link className="text-skyline hover:text-ink text-sm" href="/bakery">
          ← Bakery
        </Link>
      </p>
      <div className="mt-4">
        <h1 className="font-display text-ink text-3xl tracking-tight sm:text-4xl">
          EXTRA stock
        </h1>
        <p className="text-skyline mt-2 text-sm sm:text-base">
          Fresh Picks are Bakery-confirmed extra cakes for today or tomorrow —
          separate from the monthly catalogue.
        </p>
      </div>

      {error ? (
        <p className="text-status-danger mt-4 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {capabilities.canProposeExtra || capabilities.canCreateConfirmedExtra ? (
        <section className="border-fog mt-8 rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap gap-2">
            {capabilities.canCreateConfirmedExtra ? (
              <button
                className={mode === "create" ? btnPrimary : btnSecondary}
                disabled={pending}
                onClick={() => setMode("create")}
                type="button"
              >
                Create available
              </button>
            ) : null}
            {capabilities.canProposeExtra ? (
              <button
                className={mode === "propose" ? btnPrimary : btnSecondary}
                disabled={pending}
                onClick={() => setMode("propose")}
                type="button"
              >
                Propose
              </button>
            ) : null}
          </div>
          <p className="text-skyline mt-3 text-sm">
            {mode === "create"
              ? "Bakery posts a Fresh Pick live immediately. Pickup available from is the earliest pickup time. Orders available through is the last time a new customer may order."
              : "Proposal stays unsellable until Bakery confirms it as a Fresh Pick for today or tomorrow."}
          </p>

          {cakes.length === 0 ? (
            <p className="text-status-warning mt-4 text-sm">
              No active Library cakes available to pick from.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-ink font-medium">Cake</span>
                <select
                  className={`${fieldClass} mt-1.5`}
                  disabled={pending}
                  onChange={(e) => onCakeChange(e.target.value)}
                  value={selectedCake?.id ?? ""}
                >
                  {cakes.map((cake) => (
                    <option key={cake.id} value={cake.id}>
                      {cake.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink font-medium">Size</span>
                <select
                  className={`${fieldClass} mt-1.5`}
                  disabled={pending || !selectedCake}
                  onChange={(e) => setSizeId(e.target.value)}
                  value={selectedSize?.id ?? ""}
                >
                  {(selectedCake?.sizes ?? []).map((size) => (
                    <option key={size.id} value={size.id}>
                      {size.label}
                    </option>
                  ))}
                </select>
              </label>
              {mode === "create" ? (
                <WindowFields
                  dates={dates}
                  disabled={pending}
                  fieldClass={fieldClass}
                  todayYmd={todayYmd}
                  value={createWindow}
                  onChange={patchCreateWindow}
                />
              ) : (
                <label className="block text-sm">
                  <span className="text-ink font-medium">
                    Prepared / origin date (optional)
                  </span>
                  <input
                    className={`${fieldClass} mt-1.5`}
                    disabled={pending}
                    onChange={(e) => setPreparedOn(e.target.value)}
                    type="date"
                    value={preparedOn}
                  />
                </label>
              )}
              <label className="block text-sm sm:col-span-2">
                <span className="text-ink font-medium">Note (optional)</span>
                <input
                  className={`${fieldClass} mt-1.5`}
                  disabled={pending}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. deliberate extra bake, remake"
                  type="text"
                  value={note}
                />
              </label>
            </div>
          )}

          <div className="mt-4">
            <button
              className={btnPrimary}
              disabled={pending || cakes.length === 0}
              onClick={runCreateOrPropose}
              type="button"
            >
              {pending
                ? "Working…"
                : mode === "create"
                  ? "Create Available EXTRA"
                  : "Submit proposal"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
          Fresh Picks to confirm
          <span className="text-skyline ml-2 font-normal normal-case">
            {eligibleProposed.length}
          </span>
        </h2>
        {eligibleProposed.length === 0 ? (
          <p className="text-skyline mt-3 text-sm">
            No Extra cakes eligible for today or tomorrow.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {eligibleProposed.map((unit) => {
              const draft = draftFor(unit);
              const lockedDay = extraFreshPickDay(unit.preparedOn, todayYmd);
              return (
                <li
                  key={unit.id}
                  className="border-fog rounded-2xl border bg-white p-4"
                >
                  <p className="text-ink text-base font-semibold">
                    {unit.cakeName}{" "}
                    <span className="text-skyline font-normal">
                      {unit.sizeLabel}
                    </span>
                  </p>
                  <p className="text-skyline mt-1 text-sm">
                    Proposed by {unit.proposedByName ?? "Staff"}
                  </p>
                  {unit.note ? (
                    <p className="text-ink mt-2 text-sm">{unit.note}</p>
                  ) : null}

                  {lockedDay ? (
                    <p className="text-ink mt-3 text-sm font-medium">
                      Prepared {extraAvailabilityDayLabel(lockedDay)}
                    </p>
                  ) : null}

                  {capabilities.canConfirmExtra ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <WindowFields
                        dates={dates}
                        disabled={pending}
                        fieldClass={fieldClass}
                        todayYmd={todayYmd}
                        value={draft}
                        onChange={(patch) => patchDraft(unit.id, patch)}
                      />
                    </div>
                  ) : null}

                  {!draft.cutoffSlot &&
                  extraFreshPickDay(draft.cutoffDate, todayYmd) === "today" ? (
                    <p className="text-status-danger mt-2 text-sm">
                      {EXTRA_NO_TODAY_SLOTS_LEFT}
                    </p>
                  ) : null}

                  {capabilities.canConfirmExtra || capabilities.canRejectExtra ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {capabilities.canConfirmExtra ? (
                        <button
                          className={btnPrimary}
                          disabled={
                            pending || !draft.pickupFromSlot || !draft.cutoffSlot
                          }
                          onClick={() => runConfirm(unit)}
                          type="button"
                        >
                          {pending ? "Working…" : "Confirm Available"}
                        </button>
                      ) : null}
                      {capabilities.canRejectExtra ? (
                        <button
                          className={btnSecondary}
                          disabled={pending}
                          onClick={() => openReject(unit)}
                          type="button"
                        >
                          Reject
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {ineligibleProposed.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
            Not eligible for Fresh Picks
            <span className="text-skyline ml-2 font-normal normal-case">
              {ineligibleProposed.length}
            </span>
          </h2>
          <p className="text-skyline mt-1 text-sm">
            Fresh Picks pickup available from must be today or tomorrow.
          </p>
          <ul className="mt-4 space-y-3">
            {ineligibleProposed.map((unit) => (
              <li
                key={unit.id}
                className="border-fog rounded-2xl border bg-white p-4"
              >
                <p className="text-ink text-base font-semibold">
                  {unit.cakeName}{" "}
                  <span className="text-skyline font-normal">
                    {unit.sizeLabel}
                  </span>
                </p>
                <p className="text-skyline mt-1 text-sm">
                  Prepared{" "}
                  {unit.preparedOn
                    ? formatLongBusinessDate(unit.preparedOn)
                    : "—"}{" "}
                  — not today or tomorrow.
                </p>
                {capabilities.canRejectExtra ? (
                  <div className="mt-3">
                    <button
                      className={btnSecondary}
                      disabled={pending}
                      onClick={() => openReject(unit)}
                      type="button"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
          Fresh Picks
          <span className="text-skyline ml-2 font-normal normal-case">
            {freshPicks.length}
          </span>
        </h2>
        {freshPicks.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No Fresh Picks yet"
              description="Confirmed Extra cakes appear here until they sell or the order cutoff passes."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {freshPicks.map((unit) => (
              <li
                key={unit.id}
                className="border-fog rounded-2xl border bg-white p-4"
              >
                <p className="text-ink text-base font-semibold">
                  {unit.cakeName}{" "}
                  <span className="text-skyline font-normal">
                    {unit.sizeLabel}
                  </span>
                </p>
                <p className="text-ink mt-1 text-sm font-medium">Fresh Pick</p>
                <p className="text-skyline mt-1 text-sm">
                  Pickup available from{" "}
                  {formatExtraBoardWindowInstant(
                    unit.pickupAvailableFromAt ?? "",
                  )}
                </p>
                <p className="text-skyline mt-1 text-sm">
                  Orders available through{" "}
                  {formatExtraBoardWindowInstant(unit.pickupThroughAt ?? "")}
                </p>
                {unit.note ? (
                  <p className="text-ink mt-2 text-sm">{unit.note}</p>
                ) : null}
                {capabilities.canUnconfirmExtra ? (
                  <div className="mt-3">
                    <button
                      className={btnSecondary}
                      disabled={pending}
                      onClick={() => runUnconfirm(unit)}
                      type="button"
                    >
                      Undo availability
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {sold.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
            Sold
            <span className="text-skyline ml-2 font-normal normal-case">
              {sold.length}
            </span>
          </h2>
          <p className="text-skyline mt-1 text-sm">
            Sold Extra cakes leave Fresh Picks immediately. Pickup for the
            existing order is unaffected.
          </p>
          <ul className="mt-4 space-y-3">
            {sold.map((unit) => (
              <li
                key={unit.id}
                className="border-fog rounded-2xl border bg-white p-4"
              >
                <p className="text-ink text-base font-semibold">
                  {unit.cakeName}{" "}
                  <span className="text-skyline font-normal">
                    {unit.sizeLabel}
                  </span>
                </p>
                <p className="text-skyline mt-1 text-sm">Sold</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
          Past
          <span className="text-skyline ml-2 font-normal normal-case">
            {past.length}
          </span>
        </h2>
        <p className="text-skyline mt-1 text-sm">
          Rejected proposals and confirmed units whose order cutoff has already
          passed.
        </p>
        {past.length === 0 ? (
          <p className="text-skyline mt-3 text-sm">Nothing past yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {past.map((unit) => (
              <li
                key={unit.id}
                className="border-fog rounded-2xl border bg-white p-4"
              >
                <p className="text-ink text-base font-semibold">
                  {unit.cakeName}{" "}
                  <span className="text-skyline font-normal">
                    {unit.sizeLabel}
                  </span>
                </p>
                <p className="text-skyline mt-1 text-sm">
                  {unit.lifecycle === "rejected"
                    ? "Rejected"
                    : "Order cutoff passed"}
                  {unit.preparedOn
                    ? ` · prepared ${formatLongBusinessDate(unit.preparedOn)}`
                    : null}
                </p>
                {unit.lifecycle === "rejected" && unit.rejectReason ? (
                  <p className="text-ink mt-2 text-sm">
                    Reason: {unit.rejectReason}
                  </p>
                ) : null}
                {unit.lifecycle === "rejected" &&
                capabilities.canUndoRejectExtra ? (
                  <div className="mt-3">
                    <button
                      className={btnSecondary}
                      disabled={pending}
                      onClick={() => runUndoReject(unit)}
                      type="button"
                    >
                      Undo Reject
                    </button>
                  </div>
                ) : null}
                {unit.lifecycle === "confirmed" &&
                capabilities.canUnconfirmExtra ? (
                  <div className="mt-3">
                    <button
                      className={btnSecondary}
                      disabled={pending}
                      onClick={() => runUnconfirm(unit)}
                      type="button"
                    >
                      Undo availability
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        allowDismiss={!pending}
        confirmLabel="Reject EXTRA"
        description={
          rejectingUnit
            ? `Reject ${rejectingUnit.cakeName} ${rejectingUnit.sizeLabel}? This proposal will no longer be available for Bakery confirmation.`
            : undefined
        }
        onCancel={() => {
          if (pending) return;
          setRejectingUnit(null);
          setRejectReason("");
        }}
        onConfirm={runReject}
        open={rejectingUnit != null}
        pending={pending}
        title="Reject EXTRA?"
        tone="danger"
      >
        <FormField htmlFor="extra-reject-reason" label="Reason for rejection">
          <FormTextarea
            id="extra-reject-reason"
            onChange={(event) => setRejectReason(event.target.value)}
            required
            rows={3}
            value={rejectReason}
          />
        </FormField>
      </ConfirmDialog>
    </main>
  );
}

function nextWindow(
  base: WindowDraft,
  patch: Partial<WindowDraft>,
  todayYmd: string,
): WindowDraft {
  const next = { ...base, ...patch };
  if (patch.pickupFromDate && patch.pickupFromSlot == null) {
    next.pickupFromSlot =
      defaultExtraPickupFromSlot({
        pickupFromDate: patch.pickupFromDate,
        todayYmd,
      }) ?? "";
  }
  if (patch.pickupFromDate && patch.cutoffDate == null) {
    next.cutoffDate = clampExtraOrderCutoffDate(
      next.pickupFromDate,
      next.cutoffDate,
    );
  }
  if (
    patch.pickupFromDate ||
    patch.pickupFromSlot ||
    patch.cutoffDate
  ) {
    const fromIso = extraPickupThroughIso(
      next.pickupFromDate,
      next.pickupFromSlot,
    );
    if (patch.cutoffSlot == null) {
      next.cutoffSlot =
        defaultExtraOrderCutoffSlot({
          cutoffDate: next.cutoffDate,
          todayYmd,
          notBeforeIso: fromIso ?? undefined,
        }) ?? "";
    }
  }
  return next;
}

function WindowFields({
  value,
  onChange,
  dates,
  todayYmd,
  disabled,
  fieldClass,
}: {
  value: WindowDraft;
  onChange: (patch: Partial<WindowDraft>) => void;
  dates: { today: string; tomorrow: string | null };
  todayYmd: string;
  disabled: boolean;
  fieldClass: string;
}) {
  const pickupSlots = extraPickupFromSlotsForDate({
    pickupFromDate: value.pickupFromDate,
    todayYmd,
  });
  const cutoffDates = extraOrderCutoffDateOptions(
    value.pickupFromDate,
    todayYmd,
  );
  const cutoffSlots = extraOrderCutoffSlotsForDate({
    cutoffDate: value.cutoffDate,
    todayYmd,
  });
  return (
    <>
      <label className="block text-sm">
        <span className="text-ink font-medium">Pickup available from</span>
        <select
          className={`${fieldClass} mt-1.5`}
          disabled={disabled}
          onChange={(e) => onChange({ pickupFromDate: e.target.value })}
          value={value.pickupFromDate}
        >
          <option value={dates.today}>Today</option>
          {dates.tomorrow ? (
            <option value={dates.tomorrow}>Tomorrow</option>
          ) : null}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink font-medium">Pickup from time</span>
        <select
          className={`${fieldClass} mt-1.5`}
          disabled={disabled}
          onChange={(e) => onChange({ pickupFromSlot: e.target.value })}
          value={value.pickupFromSlot}
        >
          {pickupSlots.map((slot) => (
            <option disabled={slot.disabled} key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink font-medium">Orders available through</span>
        <select
          className={`${fieldClass} mt-1.5`}
          disabled={disabled}
          onChange={(e) => onChange({ cutoffDate: e.target.value })}
          value={value.cutoffDate}
        >
          {cutoffDates.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink font-medium">Order cutoff time</span>
        <select
          className={`${fieldClass} mt-1.5`}
          disabled={disabled}
          onChange={(e) => onChange({ cutoffSlot: e.target.value })}
          value={value.cutoffSlot}
        >
          {cutoffSlots.map((slot) => (
            <option disabled={slot.disabled} key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-skyline sm:col-span-2 text-xs leading-relaxed">
        Order cutoff is the last time a new customer may place an order.
        Pickup times follow bakery hours and are not cut off at this time.
      </p>
    </>
  );
}
