"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { evaluateExtraConfirm } from "@/engines/extra/fresh-picks-eligibility";
import { moveExtraStockWindowAction } from "@/workspaces/extra/actions";
import { ExtraWindowFields } from "@/workspaces/extra/ExtraWindowFields";
import {
  initialExtraWindow,
  nextExtraWindow,
  type ExtraWindowDraft,
} from "@/workspaces/extra/extra-window";

export type MoveExtraWindowTarget = {
  id: string;
  cakeName: string;
  sizeLabel: string;
  preparedOn?: string | null;
};

type MoveExtraWindowDialogProps = {
  extra: MoveExtraWindowTarget | null;
  open: boolean;
  todayYmd: string;
  onClose: () => void;
  onMoved?: () => void;
};

export function MoveExtraWindowDialog({
  extra,
  open,
  todayYmd,
  onClose,
  onMoved,
}: MoveExtraWindowDialogProps) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<ExtraWindowDraft>(() =>
    initialExtraWindow(todayYmd, extra?.preparedOn),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initialExtraWindow(todayYmd, extra?.preparedOn));
    setError(null);
  }, [open, extra?.id, extra?.preparedOn, todayYmd]);

  function runMove() {
    if (!extra) return;
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
      const result = await moveExtraStockWindowAction({
        extraStockId: extra.id,
        pickupFromDate: decision.pickupFromDate,
        pickupFromSlot: decision.pickupFromSlot,
        cutoffDate: decision.cutoffDate,
        cutoffSlot: decision.cutoffSlot,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onMoved?.();
      onClose();
    });
  }

  return (
    <ConfirmDialog
      allowDismiss={!pending}
      confirmLabel="Move Fresh Pick"
      description={
        extra
          ? `Move ${extra.cakeName} ${extra.sizeLabel} to another valid Fresh Pick window. The same Extra record is kept.`
          : undefined
      }
      onCancel={() => {
        if (pending) return;
        onClose();
      }}
      onConfirm={runMove}
      open={open && extra != null}
      pending={pending}
      title="Move pickup window"
    >
      {extra ? (
        <input name="extra_stock_id" type="hidden" value={extra.id} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <ExtraWindowFields
          disabled={pending}
          fieldClass="border-fog text-ink focus:border-signal w-full rounded-lg border bg-white px-3 py-2.5 text-base outline-none"
          todayYmd={todayYmd}
          value={draft}
          onChange={(patch) =>
            setDraft((prev) => nextExtraWindow(prev, patch, todayYmd))
          }
        />
      </div>
      {error ? <p className="text-status-danger mt-3 text-sm">{error}</p> : null}
    </ConfirmDialog>
  );
}
