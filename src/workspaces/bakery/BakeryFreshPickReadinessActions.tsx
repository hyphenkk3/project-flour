"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { FormTextarea } from "@/components/ui/FormTextarea";
import { isBakeryFreshPickReadinessEligible } from "@/workspaces/bakery/eligibility";
import type { BakeryAssignedFreshPickStock } from "@/workspaces/bakery/types";
import type { StorefrontOrderFulfilmentMethod } from "@/types/storefront";
import {
  markExtraStockReadyForCollectionAction,
  undoExtraStockReadyForCollectionAction,
} from "@/workspaces/extra/actions";

type BakeryFreshPickReadinessActionsProps = {
  allocationVerified: boolean;
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  stocks: BakeryAssignedFreshPickStock[];
  canMarkReady: boolean;
  canUndoReady: boolean;
};

export function BakeryFreshPickReadinessActions({
  allocationVerified,
  fulfilmentMethod,
  pickedUpAt,
  outForDeliveryAt,
  stocks,
  canMarkReady,
  canUndoReady,
}: BakeryFreshPickReadinessActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<
    { id: string; cakeName: string; sizeLabel: string; ready: boolean } | null
  >(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const eligibleStocks = allocationVerified
    ? stocks.filter((stock) =>
        isBakeryFreshPickReadinessEligible({
          fulfilmentMethod,
          pickedUpAt,
          outForDeliveryAt,
          stock,
        }),
      )
    : [];

  const actionableStocks = eligibleStocks.filter(
    (stock) =>
      (stock.readyForCollection && canUndoReady) ||
      (!stock.readyForCollection && canMarkReady),
  );

  if (actionableStocks.length === 0) return null;

  function submit() {
    if (!selected || pending) return;
    const stock = selected;
    setError(null);
    startTransition(async () => {
      try {
        const result = stock.ready
          ? await undoExtraStockReadyForCollectionAction(stock.id, reason)
          : await markExtraStockReadyForCollectionAction(stock.id, reason);
        if (result.error) {
          setError(result.error);
          return;
        }
        setSelected(null);
        setReason("");
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not update Fresh Pick readiness. Reload and check whether it saved.",
        );
      }
    });
  }

  return (
    <section className="border-fog mx-auto mt-5 max-w-2xl rounded-2xl border bg-white p-5">
      <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
        Assigned Fresh Pick readiness
      </h2>
      <p className="text-skyline mt-2 text-sm leading-relaxed">
        Each action applies to one assigned physical cake and uses the existing
        Fresh Pick audit workflow.
      </p>
      {error ? (
        <p className="text-status-danger mt-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {actionableStocks.map((stock) => (
          <li
            className="border-fog flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
            key={stock.id}
          >
            <div>
              <p className="text-ink text-sm font-medium">
                {stock.cakeName} · {stock.sizeLabel}
              </p>
              <p className="text-skyline mt-1 text-xs">One assigned physical cake</p>
            </div>
            <button
              className={
                stock.readyForCollection
                  ? "border-fog text-ink hover:bg-mist inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium transition disabled:opacity-60"
                  : "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-medium transition disabled:opacity-60"
              }
              disabled={pending}
              onClick={() => {
                setError(null);
                setReason("");
                setSelected({ ...stock, ready: stock.readyForCollection });
              }}
              type="button"
            >
              {stock.readyForCollection
                ? "Undo Ready for Collection"
                : "Mark Ready for Collection"}
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        allowDismiss={!pending}
        confirmLabel={
          selected?.ready ? "Undo Ready status" : "Mark this cake Ready"
        }
        description={
          selected
            ? selected.ready
              ? `Remove Ready status from this assigned physical ${selected.cakeName} ${selected.sizeLabel} Fresh Pick? A separate audit event will be recorded.`
              : `Mark this assigned physical ${selected.cakeName} ${selected.sizeLabel} Fresh Pick as Ready for Collection? A separate audit event will be recorded.`
            : undefined
        }
        onCancel={() => {
          if (pending) return;
          setSelected(null);
          setReason("");
        }}
        onConfirm={submit}
        open={selected !== null}
        pending={pending}
        title={selected?.ready ? "Undo Ready status?" : "Mark Ready for Collection?"}
      >
        <FormField htmlFor="bakery-fresh-pick-ready-reason" label="Reason (optional)">
          <FormTextarea
            id="bakery-fresh-pick-ready-reason"
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            value={reason}
          />
        </FormField>
      </ConfirmDialog>
    </section>
  );
}
