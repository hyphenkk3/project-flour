"use client";

import { useMemo, useState, useTransition } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField, FormTextarea } from "@/components/ui/form";
import { formatLongBusinessDate } from "@/lib/dates";
import type { ExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import { isBakeryExtraProposalActionable } from "@/engines/extra/availability";
import {
  confirmExtraStockAction,
  createConfirmedExtraStockAction,
  proposeExtraStockAction,
  rejectExtraStockAction,
  undoRejectExtraStockAction,
} from "@/workspaces/extra/actions";
import type { ExtraCakeOption, ExtraStockUnit } from "@/workspaces/extra/types";

type ExtraBoardProps = {
  units: ExtraStockUnit[];
  cakes: ExtraCakeOption[];
  capabilities: ExtraWorkspaceCapabilities;
  initialMode?: "propose" | "create";
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string {
  const d = new Date(local);
  return d.toISOString();
}

function formatPickupThrough(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function ExtraBoard({
  units,
  cakes,
  capabilities,
  initialMode = "create",
}: ExtraBoardProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"propose" | "create">(
    initialMode === "propose" && capabilities.canProposeExtra
      ? "propose"
      : capabilities.canCreateConfirmedExtra
        ? "create"
        : "propose",
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingUnit, setRejectingUnit] = useState<ExtraStockUnit | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");

  const proposed = useMemo(
    () => units.filter((u) => isBakeryExtraProposalActionable(u)),
    [units],
  );
  const available = useMemo(
    () => units.filter((u) => u.available),
    [units],
  );
  const past = useMemo(
    () =>
      units.filter(
        (u) =>
          u.lifecycle === "rejected" ||
          (u.lifecycle === "confirmed" && !u.available),
      ),
    [units],
  );

  const [cakeId, setCakeId] = useState(cakes[0]?.id ?? "");
  const selectedCake = cakes.find((c) => c.id === cakeId) ?? cakes[0];
  const [sizeId, setSizeId] = useState(selectedCake?.sizes[0]?.id ?? "");
  const selectedSize =
    selectedCake?.sizes.find((s) => s.id === sizeId) ??
    selectedCake?.sizes[0];

  const [preparedOn, setPreparedOn] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [pickupThroughLocal, setPickupThroughLocal] = useState("");
  const [note, setNote] = useState("");

  function onCakeChange(nextId: string) {
    setCakeId(nextId);
    const cake = cakes.find((c) => c.id === nextId);
    setSizeId(cake?.sizes[0]?.id ?? "");
  }

  function runCreateOrPropose() {
    if (!selectedCake || !selectedSize) {
      setError("Choose a cake and size.");
      return;
    }
    setError(null);
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
      if (!preparedOn || !pickupThroughLocal) {
        setError("Prepared date and pickup-through are required.");
        return;
      }
      const result = await createConfirmedExtraStockAction({
        cakeName: selectedCake.name,
        sizeLabel: selectedSize.label,
        preparedOn,
        pickupThroughAt: fromDatetimeLocalValue(pickupThroughLocal),
        note: note || null,
        libraryCakeId: selectedCake.id,
        libraryCakeSizeId: selectedSize.id,
      });
      if (result.error) setError(result.error);
      else {
        setNote("");
        setPickupThroughLocal("");
      }
    });
  }

  function runConfirm(unit: ExtraStockUnit) {
    const prepared = preparedOn || unit.preparedOn;
    if (!prepared || !pickupThroughLocal) {
      setError("Prepared date and pickup-through are required to confirm.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await confirmExtraStockAction({
        extraStockId: unit.id,
        preparedOn: prepared,
        pickupThroughAt: fromDatetimeLocalValue(pickupThroughLocal),
        note: note || unit.note,
      });
      if (result.error) setError(result.error);
      else {
        setConfirmingId(null);
        setNote("");
        setPickupThroughLocal("");
      }
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
        setConfirmingId(null);
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
      <div>
        <h1 className="font-display text-ink text-3xl tracking-tight sm:text-4xl">
          EXTRA stock
        </h1>
        <p className="text-skyline mt-2 text-sm sm:text-base">
          Physical whole cakes Bakery confirms as sellable stock — separate from
          preorder production.
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
              ? "Bakery creates confirmed Available stock in one step. Pickup-through is required."
              : "Proposal stays unsellable until Bakery confirms with a pickup-through datetime."}
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
              <label className="block text-sm">
                <span className="text-ink font-medium">
                  Prepared / origin date
                  {mode === "create" ? "" : " (optional)"}
                </span>
                <input
                  className={`${fieldClass} mt-1.5`}
                  disabled={pending}
                  onChange={(e) => setPreparedOn(e.target.value)}
                  type="date"
                  value={preparedOn}
                />
              </label>
              {mode === "create" ? (
                <label className="block text-sm">
                  <span className="text-ink font-medium">
                    Pickup through (internal)
                  </span>
                  <input
                    className={`${fieldClass} mt-1.5`}
                    disabled={pending}
                    onChange={(e) => setPickupThroughLocal(e.target.value)}
                    type="datetime-local"
                    value={pickupThroughLocal}
                  />
                </label>
              ) : null}
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
          Proposed
          <span className="text-skyline ml-2 font-normal normal-case">
            {proposed.length}
          </span>
        </h2>
        {proposed.length === 0 ? (
          <p className="text-skyline mt-3 text-sm">No proposals waiting.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {proposed.map((unit) => (
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
                  {unit.preparedOn
                    ? ` · prepared ${formatLongBusinessDate(unit.preparedOn)}`
                    : null}
                </p>
                {unit.note ? (
                  <p className="text-ink mt-2 text-sm">{unit.note}</p>
                ) : null}

                {capabilities.canConfirmExtra || capabilities.canRejectExtra ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {capabilities.canConfirmExtra ? (
                      <button
                        className={btnPrimary}
                        disabled={pending}
                        onClick={() => {
                          setConfirmingId(unit.id);
                          setPreparedOn(
                            unit.preparedOn ??
                              new Date().toISOString().slice(0, 10),
                          );
                          setPickupThroughLocal(
                            toDatetimeLocalValue(unit.pickupThroughAt),
                          );
                          setNote(unit.note ?? "");
                        }}
                        type="button"
                      >
                        Confirm…
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

                {confirmingId === unit.id ? (
                  <div className="border-fog mt-4 space-y-3 border-t pt-4">
                    <label className="block text-sm">
                      <span className="text-ink font-medium">
                        Prepared / origin date
                      </span>
                      <input
                        className={`${fieldClass} mt-1.5`}
                        disabled={pending}
                        onChange={(e) => setPreparedOn(e.target.value)}
                        type="date"
                        value={preparedOn}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-ink font-medium">
                        Pickup through (internal)
                      </span>
                      <input
                        className={`${fieldClass} mt-1.5`}
                        disabled={pending}
                        onChange={(e) => setPickupThroughLocal(e.target.value)}
                        type="datetime-local"
                        value={pickupThroughLocal}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={btnPrimary}
                        disabled={pending}
                        onClick={() => runConfirm(unit)}
                        type="button"
                      >
                        {pending ? "Working…" : "Confirm Available"}
                      </button>
                      <button
                        className={btnSecondary}
                        disabled={pending}
                        onClick={() => setConfirmingId(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
          Available
          <span className="text-skyline ml-2 font-normal normal-case">
            {available.length}
          </span>
        </h2>
        {available.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No Available EXTRA"
              description="Confirmed whole cakes within their Bakery pickup-through window appear here."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {available.map((unit) => (
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
                    : "—"}
                  <span className="text-fog mx-1.5">·</span>
                  Through {formatPickupThrough(unit.pickupThroughAt)}
                </p>
                {unit.note ? (
                  <p className="text-ink mt-2 text-sm">{unit.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
          Past
          <span className="text-skyline ml-2 font-normal normal-case">
            {past.length}
          </span>
        </h2>
        <p className="text-skyline mt-1 text-sm">
          Rejected proposals and confirmed units past pickup-through (still
          historically confirmed).
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
                    : "Past pickup-through"}
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
