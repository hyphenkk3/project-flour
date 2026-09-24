"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  formatCatalogueVoucherHeadline,
} from "@/engines/vouchers/catalogue-voucher";
import { evaluateOrderCatalogueVouchers } from "@/engines/vouchers/catalogue-voucher-context";
import { CATALOGUE_VOUCHER_ADJUSTMENT_CODE } from "@/types/catalogue-voucher";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { CatalogueVoucherRecord } from "@/types/catalogue-voucher";
import type { StorefrontOrder } from "@/types/storefront";
import {
  applyCatalogueVoucherAction,
  removeOrderDiscountAction,
} from "@/workspaces/owner/orders/actions";
import { listStaffCatalogueVouchersAction } from "@/workspaces/vouchers/catalogue-actions";
import { isGuestOrderEditable } from "@/workspaces/owner/orders/labels";

export function CatalogueVoucherPaymentPanel({
  order,
}: {
  order: StorefrontOrder;
}) {
  const router = useRouter();
  const [vouchers, setVouchers] = useState<CatalogueVoucherRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const today = singaporeDateFromIso(new Date().toISOString());
  const canApply = isGuestOrderEditable(order.status);

  useEffect(() => {
    void listStaffCatalogueVouchersAction()
      .then(setVouchers)
      .catch(() => setVouchers([]));
  }, []);

  const evaluated = useMemo(
    () => evaluateOrderCatalogueVouchers(vouchers, order, today),
    [order, today, vouchers],
  );
  const applied = order.adjustments.find(
    (row) =>
      row.code === CATALOGUE_VOUCHER_ADJUSTMENT_CODE &&
      (row.status ?? "active") === "active" &&
      !row.reversesAdjustmentId,
  );
  const applicable = evaluated.filter((row) => row.result.eligible);

  if (applied) {
    return (
      <div className="border-fog space-y-1 rounded-lg border px-3 py-3">
        <p className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Catalogue voucher
        </p>
        <p className="text-ink text-sm">
          {applied.label} · {formatRm(applied.amount)}
        </p>
        {canApply ? (
          <button
            className="text-skyline hover:text-ink text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const result = await removeOrderDiscountAction(
                  order.id,
                  applied.id,
                );
                if (result.error) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
            type="button"
          >
            {pending ? "Updating…" : "Remove Discount"}
          </button>
        ) : null}
        {error ? (
          <p className="text-status-danger text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!canApply || applicable.length === 0) return null;

  return (
    <div className="border-fog space-y-3 rounded-lg border px-3 py-3">
      <p className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
        Applicable Vouchers
      </p>
      <ul className="space-y-3">
        {applicable.map(({ voucher, result }) => (
          <li key={voucher.id}>
            <p className="text-ink text-sm font-medium">
              {formatCatalogueVoucherHeadline(voucher)}
            </p>
            <p className="text-skyline text-sm">{voucher.code}</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {result.passedConditions.map((condition) => (
                <li className="text-ink" key={condition.key}>
                  ✓ {condition.detail}
                </li>
              ))}
            </ul>
            <button
              className="bg-ink text-mist hover:bg-skyline mt-2 inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
              disabled={pending}
              onClick={() => {
                setError(null);
                start(async () => {
                  const appliedResult = await applyCatalogueVoucherAction(
                    order.id,
                    voucher.id,
                  );
                  if (appliedResult.error) {
                    setError(appliedResult.error);
                    return;
                  }
                  router.refresh();
                });
              }}
              type="button"
            >
              {pending
                ? "Applying…"
                : `Apply ${formatCatalogueVoucherHeadline(voucher)}`}
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
