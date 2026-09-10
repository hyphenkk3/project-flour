"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cutExtraStockIntoSlicesAction } from "@/workspaces/extra/actions";

export type CutExtraIntoSlicesTarget = {
  id: string;
  cakeName: string;
  sizeLabel: string;
};

type CutExtraIntoSlicesDialogProps = {
  extra: CutExtraIntoSlicesTarget | null;
  open: boolean;
  onClose: () => void;
  onCut?: () => void;
};

export function CutExtraIntoSlicesDialog({
  extra,
  open,
  onClose,
  onCut,
}: CutExtraIntoSlicesDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open, extra?.id]);

  function runCut() {
    if (!extra) return;
    setError(null);
    startTransition(async () => {
      const result = await cutExtraStockIntoSlicesAction(extra.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      onCut?.();
      onClose();
    });
  }

  return (
    <ConfirmDialog
      allowDismiss={!pending}
      confirmLabel="Cut into slices"
      description={
        extra
          ? `${extra.cakeName} ${extra.sizeLabel} will no longer be offered as a whole-cake Fresh Pick. No slice inventory is created.`
          : undefined
      }
      onCancel={() => {
        if (pending) return;
        onClose();
      }}
      onConfirm={runCut}
      open={open && extra != null}
      pending={pending}
      title="Cut into slices?"
      tone="danger"
    >
      {extra ? (
        <input name="extra_stock_id" type="hidden" value={extra.id} />
      ) : null}
      {error ? <p className="text-status-danger text-sm">{error}</p> : null}
    </ConfirmDialog>
  );
}
