"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
} from "@/components/ui/form";
import { formatBusinessCalendarDate } from "@/lib/dates";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/engines/orders/payment-details";
import { formatCatalogueVoucherHeadline } from "@/engines/vouchers/catalogue-voucher";
import { evaluateDraftCatalogueVouchers } from "@/engines/vouchers/catalogue-voucher-context";
import type { CatalogueVoucherRecord } from "@/types/catalogue-voucher";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  CatalogueVoucherAmountLines,
  catalogueVoucherPreviewPayable,
} from "@/workspaces/storefront/offers/CatalogueVoucherAmountLines";
import type { CatalogueVoucherPreview } from "@/workspaces/storefront/offers/useEligibleCatalogueVoucher";
import { listStaffCatalogueVouchersAction } from "@/workspaces/vouchers/catalogue-actions";
import {
  completeExtraStockWalkInSaleAction,
  previewExtraWalkInSaleAction,
  type ExtraWalkInSalePreview,
} from "@/workspaces/extra/actions";
import type { ExtraStockUnit } from "@/workspaces/extra/types";

type WalkInHoldCompleteSaleDialogProps = {
  extra: ExtraStockUnit | null;
  open: boolean;
  onClose: () => void;
  onSold?: () => void;
};

export function WalkInHoldCompleteSaleDialog({
  extra,
  open,
  onClose,
  onSold,
}: WalkInHoldCompleteSaleDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExtraWalkInSalePreview | null>(null);
  const [vouchers, setVouchers] = useState<CatalogueVoucherRecord[]>([]);
  const [voucherId, setVoucherId] = useState("");
  const [physicalVoucherNumber, setPhysicalVoucherNumber] = useState("");
  const [physicalVoucherExpiry, setPhysicalVoucherExpiry] = useState("");
  const [physicalVoucherApplied, setPhysicalVoucherApplied] = useState(false);
  const [rm10OwnerOverride, setRm10OwnerOverride] = useState(false);
  const [rm10OverrideReason, setRm10OverrideReason] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("wb_qr");
  const [methodDescription, setMethodDescription] = useState("");

  useEffect(() => {
    if (!open || !extra) return;
    const extraId = extra.id;
    let cancelled = false;
    startTransition(async () => {
      const [sale, nextVouchers] = await Promise.all([
        previewExtraWalkInSaleAction(extraId),
        listStaffCatalogueVouchersAction().catch(
          () => [] as CatalogueVoucherRecord[],
        ),
      ]);
      if (cancelled) return;
      setVoucherId("");
      setPhysicalVoucherNumber("");
      setPhysicalVoucherExpiry("");
      setPhysicalVoucherApplied(false);
      setRm10OwnerOverride(false);
      setRm10OverrideReason("");
      setMethod("wb_qr");
      setMethodDescription("");
      setVouchers(nextVouchers);
      if (sale.error || !sale.preview) {
        setPreview(null);
        setError(sale.error ?? "Could not load this sale.");
        return;
      }
      setError(null);
      setPreview(sale.preview);
    });
    return () => {
      cancelled = true;
    };
  }, [open, extra]);

  const today = singaporeDateFromIso(new Date().toISOString());
  const evaluated = useMemo(() => {
    if (!preview) return [];
    return evaluateDraftCatalogueVouchers(
      vouchers,
      {
        pickupDate: preview.pickupDate,
        items: [
          {
            cakeId: preview.cakeId,
            sizeId: preview.sizeId,
            sizeLabel: preview.sizeLabel,
            quantity: 1,
            unitPrice: preview.unitPrice,
          },
        ],
      },
      today,
      "fresh_pick",
    );
  }, [preview, today, vouchers]);
  const applicable = evaluated.filter((row) => row.result.eligible);
  const selected = applicable.find((row) => row.voucher.id === voucherId);
  const voucherPreview: CatalogueVoucherPreview | null =
    selected && selected.result.amount != null
      ? {
          id: selected.voucher.id,
          code: selected.voucher.code,
          headline: formatCatalogueVoucherHeadline(selected.voucher),
          amount: selected.result.amount,
        }
      : null;
  const finalTotal = preview
    ? Math.max(
        0,
        catalogueVoucherPreviewPayable(preview.unitPrice, voucherPreview) -
          (physicalVoucherApplied ? 10 : 0),
      )
    : 0;

  function applyPhysicalVoucher() {
    if (!physicalVoucherNumber.trim()) {
      setError("Enter the physical RM10 voucher number.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(physicalVoucherExpiry)) {
      setError("Enter a valid physical voucher expiry date.");
      return;
    }
    if (voucherPreview) {
      setError(
        "Catalogue vouchers cannot be stacked with an RM10 Discount Card.",
      );
      return;
    }
    setError(null);
    setPhysicalVoucherApplied(true);
  }

  function runSold() {
    if (!extra || !preview || pending) return;
    if (method === "others" && !methodDescription.trim()) {
      setError("Description is required when payment method is Others.");
      return;
    }
    if (voucherPreview && physicalVoucherApplied) {
      setError(
        "Catalogue vouchers cannot be stacked with an RM10 Discount Card.",
      );
      return;
    }
    if (physicalVoucherApplied && !physicalVoucherNumber.trim()) {
      setError("Enter the physical RM10 voucher number.");
      return;
    }
    if (
      physicalVoucherApplied &&
      !/^\d{4}-\d{2}-\d{2}$/.test(physicalVoucherExpiry)
    ) {
      setError("Enter a valid physical voucher expiry date.");
      return;
    }
    if (
      physicalVoucherApplied &&
      rm10OwnerOverride &&
      !rm10OverrideReason.trim()
    ) {
      setError("Owner override requires a reason.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await completeExtraStockWalkInSaleAction({
        extraStockId: extra.id,
        paymentMethod: method,
        paymentMethodDescription:
          method === "others" ? methodDescription.trim() : null,
        catalogueVoucherId: voucherPreview?.id ?? null,
        physicalRm10VoucherNumber: physicalVoucherApplied
          ? physicalVoucherNumber.trim()
          : null,
        physicalRm10ExpiryDate: physicalVoucherApplied
          ? physicalVoucherExpiry
          : null,
        rm10OwnerOverride: physicalVoucherApplied && rm10OwnerOverride,
        rm10OverrideReason:
          physicalVoucherApplied && rm10OwnerOverride
            ? rm10OverrideReason.trim()
            : null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onSold?.();
      onClose();
    });
  }

  return (
    <ConfirmDialog
      allowDismiss={!pending}
      confirmLabel="Confirm Sale"
      onCancel={() => {
        if (pending) return;
        onClose();
      }}
      onConfirm={runSold}
      open={open}
      pending={pending}
      title="Complete walk-in sale"
    >
      {preview ? (
        <div className="space-y-3">
          <p className="text-ink text-sm font-medium">{preview.cakeName}</p>
          <dl className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-skyline text-sm">Size</dt>
              <dd className="text-ink text-sm">{preview.sizeLabel}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-skyline text-sm">Pickup / collection</dt>
              <dd className="text-ink text-sm">
                {formatBusinessCalendarDate(preview.pickupDate)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-skyline text-sm">Base selling price</dt>
              <dd className="text-ink text-sm tabular-nums">
                {formatRm(preview.unitPrice)}
              </dd>
            </div>
          </dl>

          <div className="border-fog space-y-2 rounded-lg border px-3 py-3">
            <p className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
              Discount
            </p>
            <p className="text-ink text-sm font-medium">Catalogue voucher</p>
            {applicable.length === 0 ? (
              <p className="text-skyline text-sm">
                No applicable catalogue vouchers for this Fresh Pick.
              </p>
            ) : (
              <ul className="space-y-2">
                <li>
                  <label className="text-ink flex min-h-11 items-center gap-2 text-sm">
                    <input
                      checked={voucherId === ""}
                      name="walk-in-sale-voucher"
                      onChange={() => {
                        setVoucherId("");
                        setError(null);
                      }}
                      type="radio"
                    />
                    No voucher
                  </label>
                </li>
                {applicable.map(({ voucher, result }) => (
                  <li key={voucher.id}>
                    <label className="text-ink flex min-h-11 items-start gap-2 text-sm">
                      <input
                        checked={voucherId === voucher.id}
                        className="mt-1"
                        name="walk-in-sale-voucher"
                        onChange={() => {
                          if (physicalVoucherApplied) {
                            setError(
                              "Catalogue vouchers cannot be stacked with an RM10 Discount Card.",
                            );
                            return;
                          }
                          setError(null);
                          setVoucherId(voucher.id);
                        }}
                        type="radio"
                      />
                      <span>
                        <span className="font-medium">
                          {formatCatalogueVoucherHeadline(voucher)}
                        </span>
                        <span className="text-skyline block">
                          {voucher.code}
                        </span>
                        {result.passedConditions[0] ? (
                          <span className="text-skyline block text-xs">
                            {result.passedConditions[0].detail}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-fog space-y-2 rounded-lg border px-3 py-3">
            <p className="text-ink text-sm font-medium">
              Physical RM10 voucher
            </p>
            <p className="text-skyline text-xs">
              Enter the card number and expiry. The voucher is verified when you
              confirm the sale.
            </p>
            <FormField
              htmlFor="walk-in-physical-rm10-number"
              label="Voucher number"
            >
              <FormInput
                autoComplete="off"
                id="walk-in-physical-rm10-number"
                onChange={(event) => {
                  setPhysicalVoucherNumber(event.target.value);
                  setPhysicalVoucherApplied(false);
                  setRm10OwnerOverride(false);
                  setRm10OverrideReason("");
                }}
                placeholder="Enter the number on the physical card"
                value={physicalVoucherNumber}
              />
            </FormField>
            <FormField
              htmlFor="walk-in-physical-rm10-expiry"
              label="Expiry date"
            >
              <FormInput
                id="walk-in-physical-rm10-expiry"
                onChange={(event) => {
                  setPhysicalVoucherExpiry(event.target.value);
                  setPhysicalVoucherApplied(false);
                  setRm10OwnerOverride(false);
                  setRm10OverrideReason("");
                }}
                type="date"
                value={physicalVoucherExpiry}
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <button
                className="border-fog text-ink inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium disabled:opacity-60"
                disabled={
                  !physicalVoucherNumber.trim() || !physicalVoucherExpiry
                }
                onClick={applyPhysicalVoucher}
                type="button"
              >
                Apply RM10 voucher
              </button>
              {physicalVoucherApplied ? (
                <button
                  className="text-skyline inline-flex min-h-10 items-center px-2 text-sm"
                  onClick={() => {
                    setPhysicalVoucherApplied(false);
                    setRm10OwnerOverride(false);
                    setRm10OverrideReason("");
                  }}
                  type="button"
                >
                  Remove
                </button>
              ) : null}
            </div>
            {physicalVoucherApplied ? (
              <p className="text-ink text-sm font-medium">
                RM10 physical card applied · −{formatRm(10)}
              </p>
            ) : null}
            {physicalVoucherApplied && preview.canOverridePhysicalRm10 ? (
              <div className="space-y-2">
                <label className="text-ink flex items-start gap-2 text-sm">
                  <input
                    checked={rm10OwnerOverride}
                    onChange={(event) =>
                      setRm10OwnerOverride(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    Owner/Manager override for an otherwise ineligible expiry
                  </span>
                </label>
                {rm10OwnerOverride ? (
                  <FormField
                    htmlFor="walk-in-rm10-override-reason"
                    label="Override reason"
                  >
                    <FormTextarea
                      id="walk-in-rm10-override-reason"
                      onChange={(event) =>
                        setRm10OverrideReason(event.target.value)
                      }
                      placeholder="Required reason for the exception"
                      required
                      rows={2}
                      value={rm10OverrideReason}
                    />
                  </FormField>
                ) : null}
              </div>
            ) : null}
          </div>

          {voucherPreview ? (
            <dl className="space-y-1">
              <CatalogueVoucherAmountLines
                commercialTotal={preview.unitPrice}
                emphasizeTotal
                voucher={voucherPreview}
              />
            </dl>
          ) : (
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-ink text-sm font-medium">Final total</p>
              <p className="text-ink text-sm font-medium tabular-nums">
                {formatRm(finalTotal)}
              </p>
            </div>
          )}

          <FormField htmlFor="walk-in-sale-method" label="Payment method">
            <FormSelect
              id="walk-in-sale-method"
              onChange={(event) =>
                setMethod(event.target.value as PaymentMethod)
              }
              required
              value={method}
            >
              <option value="wb_qr">{PAYMENT_METHOD_LABELS.wb_qr}</option>
              <option value="online_transfer">
                {PAYMENT_METHOD_LABELS.online_transfer}
              </option>
              <option value="others">{PAYMENT_METHOD_LABELS.others}</option>
            </FormSelect>
          </FormField>
          {method === "others" ? (
            <FormField
              htmlFor="walk-in-sale-method-description"
              label="Others description"
            >
              <FormInput
                id="walk-in-sale-method-description"
                onChange={(event) => setMethodDescription(event.target.value)}
                placeholder="e.g. Cash, Card terminal"
                required
                value={methodDescription}
              />
            </FormField>
          ) : null}
        </div>
      ) : pending ? (
        <p className="text-skyline text-sm">Loading sale details…</p>
      ) : null}
      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
