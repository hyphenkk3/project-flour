"use client";

/**
 * M4-P3 Slice 2B-2 — Delivery Charges (Owner/Manager direct + Counter request + resolve).
 */

import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormTextarea,
} from "@/components/ui/form";
import {
  canCancelPendingFeeRequest,
  type GuestOrderWorkspaceCapabilities,
} from "@/engines/orders/delivery-finance-capabilities";
import {
  DELIVERY_CHARGES_SECTION_ID,
  DELIVERY_FEE_MORE_PRESETS,
  DELIVERY_FEE_PRIMARY_PRESETS,
  deliveryFeeAmountSuspendedByWaiver,
  deliveryFinanceFactsFromDelivery,
  effectiveDeliveryFeePayable,
  effectiveProcessingFeePayable,
  processingFeeAmountSuspendedByWaiver,
  shouldShowDeliveryChargesSection,
} from "@/engines/orders/delivery-finance";
import { focusDeliveryChargesSection } from "@/workspaces/owner/orders/missing-delivery-fee-confirmation";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontOrder } from "@/types/storefront";
import {
  cancelGuestOrderDeliveryFeeRequestAction,
  cancelGuestOrderProcessingFeeRequestAction,
  overrideGuestOrderProcessingFeeAction,
  requestGuestOrderDeliveryFeeWaiverAction,
  requestGuestOrderProcessingFeeChangeAction,
  resolveGuestOrderDeliveryFeeRequestAction,
  resolveGuestOrderProcessingFeeRequestAction,
  restoreGuestOrderDeliveryFeeAction,
  restoreGuestOrderProcessingFeeAction,
  setGuestOrderDeliveryFeeQuoteAction,
  waiveGuestOrderDeliveryFeeAction,
  waiveGuestOrderProcessingFeeAction,
} from "@/workspaces/owner/orders/actions";
import {
  formatTimelineDateTime,
  isGuestOrderEditable,
} from "@/workspaces/owner/orders/labels";
import { feeRequestRequesterLabel } from "@/engines/orders/delivery-fee-request-attribution";

type DeliveryChargesSectionProps = {
  order: StorefrontOrder;
  capabilities: GuestOrderWorkspaceCapabilities;
};

type FeeDialogTarget =
  | "waive-processing"
  | "waive-delivery"
  | "restore-processing"
  | "restore-delivery"
  | null;

type CounterDialog =
  | "delivery-waiver"
  | "processing-change"
  | null;

type ResolveDialog =
  | {
      category: "delivery" | "processing";
      decision: "approve" | "reject";
    }
  | null;

export function DeliveryChargesSection({
  order,
  capabilities,
}: DeliveryChargesSectionProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showProcessingEdit, setShowProcessingEdit] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const [showMore, setShowMore] = useState(false);
  const [customAmount, setCustomAmount] = useState("");

  const [feeDialog, setFeeDialog] = useState<FeeDialogTarget>(null);
  const [feeDialogReason, setFeeDialogReason] = useState("");

  const [counterDialog, setCounterDialog] = useState<CounterDialog>(null);
  const [counterReason, setCounterReason] = useState("");
  const [processingRequestMode, setProcessingRequestMode] = useState<
    "waiver" | "override"
  >("waiver");
  const [processingRequestAmount, setProcessingRequestAmount] = useState("");

  const [resolveDialog, setResolveDialog] = useState<ResolveDialog>(null);
  const [resolveNote, setResolveNote] = useState("");

  const facts = deliveryFinanceFactsFromDelivery(order.delivery);
  const showSection =
    shouldShowDeliveryChargesSection(order) && Boolean(facts && order.delivery);

  useEffect(() => {
    if (!showSection) return;
    if (window.location.hash !== `#${DELIVERY_CHARGES_SECTION_ID}`) return;
    focusDeliveryChargesSection();
  }, [showSection]);

  if (!showSection || !facts || !order.delivery) {
    return null;
  }

  const orderEditable = isGuestOrderEditable(order.status);
  const canQuote = orderEditable && capabilities.canQuoteDeliveryFee;
  const canDirect = orderEditable && capabilities.canDirectFeeExceptions;
  const canRequest = orderEditable && capabilities.canRequestFeeExceptions;
  const canResolve = orderEditable && capabilities.canResolveFeeRequests;

  const applicable = Number(facts.processingFeeApplicableAmount ?? 0);
  const processingPayable = effectiveProcessingFeePayable(facts);
  const deliveryPayable = effectiveDeliveryFeePayable(facts);
  const isProcessingWaived = facts.processingFeeWaived;
  const isProcessingOverridden =
    !isProcessingWaived && facts.processingFeeOverrideAmount != null;
  const deliveryStatus = facts.deliveryFeeStatus;
  const quotedAmount = facts.deliveryFeeQuotedAmount;
  const processingRestoreAmount = processingFeeAmountSuspendedByWaiver(facts);
  const deliveryRestoreAmount = deliveryFeeAmountSuspendedByWaiver(facts);
  const hasVerifiedPayment = order.settlement.netReceived > 0;

  const deliveryReq = order.delivery.deliveryFeeRequest;
  const processingReq = order.delivery.processingFeeRequest;
  const deliveryPending = deliveryReq.status === "pending";
  const processingPending = processingReq.status === "pending";
  const canCancelDelivery = canCancelPendingFeeRequest({
    capabilities,
    requestedBy: deliveryReq.requestedBy,
  });
  const canCancelProcessing = canCancelPendingFeeRequest({
    capabilities,
    requestedBy: processingReq.requestedBy,
  });

  function runAction(action: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setError(result.error);
          return;
        }
        // Server actions already revalidatePath; do not router.refresh() here.
        setShowProcessingEdit(false);
        setOverrideReason("");
        setCustomAmount("");
        setFeeDialog(null);
        setFeeDialogReason("");
        setCounterDialog(null);
        setCounterReason("");
        setProcessingRequestAmount("");
        setProcessingRequestMode("waiver");
        setResolveDialog(null);
        setResolveNote("");
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Something went wrong. Please try again.",
        );
      }
    });
  }

  function handleQuote(amount: number) {
    if (!canQuote || pending) return;
    runAction(() => setGuestOrderDeliveryFeeQuoteAction(order.id, amount));
  }

  function handleCustomQuote() {
    if (!canQuote || pending) return;
    const amount = Number(customAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Delivery fee quote must be greater than RM0.");
      return;
    }
    handleQuote(amount);
  }

  function handleOverrideSave() {
    if (!canDirect || pending || processingPending) return;
    const amount = Number(overrideAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Processing fee override must be non-negative.");
      return;
    }
    runAction(() =>
      overrideGuestOrderProcessingFeeAction(
        order.id,
        amount,
        overrideReason.trim() || null,
      ),
    );
  }

  function openProcessingEdit() {
    setError(null);
    setOverrideAmount(String(processingPayable));
    setOverrideReason("");
    setShowProcessingEdit(true);
  }

  function confirmFeeDialog() {
    if (!canDirect || pending || !feeDialog) return;
    const reason = feeDialogReason.trim() || null;
    if (feeDialog === "waive-processing") {
      runAction(() => waiveGuestOrderProcessingFeeAction(order.id, reason));
      return;
    }
    if (feeDialog === "waive-delivery") {
      runAction(() => waiveGuestOrderDeliveryFeeAction(order.id, reason));
      return;
    }
    if (feeDialog === "restore-processing") {
      runAction(() => restoreGuestOrderProcessingFeeAction(order.id, reason));
      return;
    }
    runAction(() => restoreGuestOrderDeliveryFeeAction(order.id, reason));
  }

  function confirmResolveDialog() {
    if (!canResolve || pending || !resolveDialog) return;
    const note = resolveNote.trim() || null;
    const approve = resolveDialog.decision === "approve";
    if (resolveDialog.category === "delivery") {
      runAction(() =>
        resolveGuestOrderDeliveryFeeRequestAction(order.id, approve, note),
      );
      return;
    }
    runAction(() =>
      resolveGuestOrderProcessingFeeRequestAction(order.id, approve, note),
    );
  }

  function confirmCounterDialog() {
    if (!canRequest || pending || !counterDialog) return;
    const reason = counterReason.trim();
    if (!reason) {
      setError("Reason is required.");
      return;
    }
    if (counterDialog === "delivery-waiver") {
      runAction(() =>
        requestGuestOrderDeliveryFeeWaiverAction(order.id, reason),
      );
      return;
    }
    if (processingRequestMode === "waiver") {
      runAction(() =>
        requestGuestOrderProcessingFeeChangeAction(
          order.id,
          "processing_waiver",
          reason,
          null,
        ),
      );
      return;
    }
    const amount = Number(processingRequestAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(
        "Processing fee change amount must be greater than RM0 (use waive for RM0).",
      );
      return;
    }
    runAction(() =>
      requestGuestOrderProcessingFeeChangeAction(
        order.id,
        "processing_override",
        reason,
        amount,
      ),
    );
  }

  const selectedQuote =
    deliveryStatus === "quoted" || deliveryStatus === "quoted_waived"
      ? Number(quotedAmount ?? NaN)
      : NaN;

  const feeDialogTitle =
    feeDialog === "waive-processing"
      ? "Waive Processing Fee"
      : feeDialog === "waive-delivery"
        ? "Waive Delivery Fee"
        : feeDialog === "restore-processing"
          ? "Restore Processing Fee?"
          : feeDialog === "restore-delivery"
            ? "Restore Delivery Fee?"
            : "";

  const feeDialogDescription = (() => {
    if (feeDialog === "waive-processing") {
      return `The applicable processing fee of ${formatRm(applicable)} will be waived. Effective payable processing fee becomes RM0.`;
    }
    if (feeDialog === "waive-delivery") {
      return `The quoted delivery fee of ${formatRm(Number(quotedAmount ?? 0))} will be waived. Effective payable delivery fee becomes RM0.`;
    }
    if (feeDialog === "restore-processing") {
      const amountLabel = formatRm(processingRestoreAmount);
      let copy = `The waived Processing Fee of ${amountLabel} will be restored. The effective Processing Fee will become ${amountLabel}.`;
      if (hasVerifiedPayment && processingRestoreAmount > 0) {
        copy +=
          " This order already has payment recorded. Restoring this fee may create an additional balance due.";
      }
      return copy;
    }
    if (feeDialog === "restore-delivery") {
      const amountLabel = formatRm(deliveryRestoreAmount);
      let copy = `The waived Delivery Fee of ${amountLabel} will be restored. The effective Delivery Fee will become ${amountLabel}.`;
      if (hasVerifiedPayment && deliveryRestoreAmount > 0) {
        copy +=
          " This order already has payment recorded. Restoring this fee may create an additional balance due.";
      }
      return copy;
    }
    return undefined;
  })();

  const feeDialogConfirmLabel =
    feeDialog === "waive-processing"
      ? "Waive Processing Fee"
      : feeDialog === "waive-delivery"
        ? "Waive Delivery Fee"
        : feeDialog === "restore-processing"
          ? "Restore Processing Fee"
          : feeDialog === "restore-delivery"
            ? "Restore Delivery Fee"
            : "Confirm";

  const quoteControls = canQuote && deliveryStatus !== "quoted_waived" && (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {DELIVERY_FEE_PRIMARY_PRESETS.map((amount) => {
          const selected = selectedQuote === amount;
          return (
            <button
              className={
                selected
                  ? "bg-ink text-mist inline-flex min-h-10 items-center justify-center rounded-lg px-2 text-sm font-medium disabled:opacity-60"
                  : "border-fog text-ink inline-flex min-h-10 items-center justify-center rounded-lg border bg-white px-2 text-sm font-medium disabled:opacity-60"
              }
              disabled={pending}
              key={amount}
              onClick={() => handleQuote(amount)}
              type="button"
            >
              {formatRm(amount)}
            </button>
          );
        })}
        <button
          className="border-fog text-ink inline-flex min-h-10 items-center justify-center rounded-lg border bg-white px-2 text-sm font-medium disabled:opacity-60"
          disabled={pending}
          onClick={() => setShowMore((value) => !value)}
          type="button"
        >
          More {showMore ? "▴" : "▾"}
        </button>
      </div>

      {showMore ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {DELIVERY_FEE_MORE_PRESETS.map((amount) => {
              const selected = selectedQuote === amount;
              return (
                <button
                  className={
                    selected
                      ? "bg-ink text-mist inline-flex min-h-10 items-center justify-center rounded-lg px-2 text-sm font-medium disabled:opacity-60"
                      : "border-fog text-ink inline-flex min-h-10 items-center justify-center rounded-lg border bg-white px-2 text-sm font-medium disabled:opacity-60"
                  }
                  disabled={pending}
                  key={amount}
                  onClick={() => handleQuote(amount)}
                  type="button"
                >
                  {formatRm(amount)}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <FormField
              className="min-w-0 flex-1"
              htmlFor={`delivery-custom-${order.id}`}
              label="Custom (RM)"
            >
              <FormInput
                id={`delivery-custom-${order.id}`}
                inputMode="decimal"
                min={0.01}
                onChange={(event) => setCustomAmount(event.target.value)}
                placeholder="e.g. 12"
                step="0.01"
                type="number"
                value={customAmount}
              />
            </FormField>
            <button
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium disabled:opacity-60"
              disabled={pending}
              onClick={handleCustomQuote}
              type="button"
            >
              Set
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      className="border-fog space-y-4 rounded-xl border bg-white p-5 focus:outline-none"
      id={DELIVERY_CHARGES_SECTION_ID}
      tabIndex={-1}
    >
      <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
        Delivery Charges
      </h2>

      <FormError message={error} />

      <div className="space-y-2">
        <p className="text-skyline text-xs font-medium tracking-wide uppercase">
          Processing Fee
        </p>
        {isProcessingWaived ? (
          <div className="space-y-1">
            <p className="text-ink text-base font-semibold">{formatRm(0)}</p>
            <p className="text-skyline text-sm">
              {formatRm(processingRestoreAmount)} waived
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-ink text-base font-semibold">
              {formatRm(processingPayable)}
            </p>
            {isProcessingOverridden ? (
              <p className="text-skyline text-sm">
                Overridden from {formatRm(applicable)}
              </p>
            ) : null}
          </div>
        )}

        {processingPending ? (
          <PendingRequestCard
            canCancel={canCancelProcessing && orderEditable}
            canResolve={canResolve}
            fromAmount={processingPayable}
            kindLabel={
              processingReq.kind === "processing_override"
                ? "Change requested"
                : "Waiver requested"
            }
            onApprove={() => {
              if (!canResolve || pending) return;
              setError(null);
              setResolveNote("");
              setResolveDialog({
                category: "processing",
                decision: "approve",
              });
            }}
            onCancel={() => {
              if (!canCancelProcessing || pending) return;
              runAction(() =>
                cancelGuestOrderProcessingFeeRequestAction(order.id),
              );
            }}
            onReject={() => {
              if (!canResolve || pending) return;
              setError(null);
              setResolveNote("");
              setResolveDialog({
                category: "processing",
                decision: "reject",
              });
            }}
            pending={pending}
            reason={processingReq.reason}
            requestedAt={processingReq.requestedAt}
            requestedByName={processingReq.requestedByName}
            toAmount={
              processingReq.kind === "processing_override"
                ? Number(processingReq.proposedAmount ?? 0)
                : 0
            }
          />
        ) : null}

        {canDirect && isProcessingWaived ? (
          <button
            className="text-signal text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() => {
              setFeeDialogReason("");
              setFeeDialog("restore-processing");
            }}
            type="button"
          >
            Restore Processing Fee
          </button>
        ) : null}

        {canDirect && !isProcessingWaived && !processingPending ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              className="text-signal text-sm font-medium disabled:opacity-60"
              disabled={pending}
              onClick={openProcessingEdit}
              type="button"
            >
              Edit
            </button>
            <button
              className="text-signal text-sm font-medium disabled:opacity-60"
              disabled={pending}
              onClick={() => {
                setFeeDialogReason("");
                setFeeDialog("waive-processing");
              }}
              type="button"
            >
              Waive Processing Fee
            </button>
          </div>
        ) : null}

        {canRequest && !processingPending && !isProcessingWaived ? (
          <button
            className="text-signal text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() => {
              setError(null);
              setCounterReason("");
              setProcessingRequestMode("waiver");
              setProcessingRequestAmount("");
              setCounterDialog("processing-change");
            }}
            type="button"
          >
            Request Change
          </button>
        ) : null}

        {showProcessingEdit &&
        canDirect &&
        !isProcessingWaived &&
        !processingPending ? (
          <div className="border-fog space-y-3 rounded-lg border p-3">
            <FormField
              htmlFor={`processing-override-${order.id}`}
              label="Override amount (RM)"
            >
              <FormInput
                id={`processing-override-${order.id}`}
                inputMode="decimal"
                min={0}
                onChange={(event) => setOverrideAmount(event.target.value)}
                step="0.01"
                type="number"
                value={overrideAmount}
              />
            </FormField>
            <FormField
              htmlFor={`processing-override-reason-${order.id}`}
              label="Reason (optional)"
            >
              <FormTextarea
                id={`processing-override-reason-${order.id}`}
                onChange={(event) => setOverrideReason(event.target.value)}
                rows={2}
                value={overrideReason}
              />
            </FormField>
            <FormActions>
              <button
                className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium disabled:opacity-60"
                disabled={pending}
                onClick={handleOverrideSave}
                type="button"
              >
                {pending ? "Saving…" : "Save override"}
              </button>
              <button
                className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium"
                disabled={pending}
                onClick={() => setShowProcessingEdit(false)}
                type="button"
              >
                Cancel
              </button>
            </FormActions>
          </div>
        ) : null}
      </div>

      <div className="border-fog space-y-3 border-t pt-4">
        <p className="text-skyline text-xs font-medium tracking-wide uppercase">
          Delivery Fee
        </p>

        {deliveryStatus === "not_set" ? (
          <p className="text-status-warning text-base font-semibold">Not set</p>
        ) : deliveryStatus === "quoted_waived" ? (
          <div className="space-y-1">
            <p className="text-ink text-base font-semibold">{formatRm(0)}</p>
            <p className="text-skyline text-sm">
              {formatRm(Number(quotedAmount ?? 0))} waived
            </p>
          </div>
        ) : (
          <p className="text-ink text-base font-semibold">
            {formatRm(deliveryPayable)}
          </p>
        )}

        {deliveryPending ? (
          <PendingRequestCard
            canCancel={canCancelDelivery && orderEditable}
            canResolve={canResolve}
            fromAmount={Number(
              deliveryReq.quotedAmount ?? quotedAmount ?? deliveryPayable,
            )}
            kindLabel="Waiver requested"
            onApprove={() => {
              if (!canResolve || pending) return;
              setError(null);
              setResolveNote("");
              setResolveDialog({ category: "delivery", decision: "approve" });
            }}
            onCancel={() => {
              if (!canCancelDelivery || pending) return;
              runAction(() =>
                cancelGuestOrderDeliveryFeeRequestAction(order.id),
              );
            }}
            onReject={() => {
              if (!canResolve || pending) return;
              setError(null);
              setResolveNote("");
              setResolveDialog({ category: "delivery", decision: "reject" });
            }}
            pending={pending}
            reason={deliveryReq.reason}
            requestedAt={deliveryReq.requestedAt}
            requestedByName={deliveryReq.requestedByName}
            toAmount={0}
          />
        ) : null}

        {canDirect && deliveryStatus === "quoted_waived" ? (
          <button
            className="text-signal text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() => {
              setFeeDialogReason("");
              setFeeDialog("restore-delivery");
            }}
            type="button"
          >
            Restore Delivery Fee
          </button>
        ) : null}

        {quoteControls}

        {canDirect && deliveryStatus === "quoted" && !deliveryPending ? (
          <button
            className="text-signal text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() => {
              setFeeDialogReason("");
              setFeeDialog("waive-delivery");
            }}
            type="button"
          >
            Waive Delivery Fee
          </button>
        ) : null}

        {canRequest &&
        deliveryStatus === "quoted" &&
        !deliveryPending ? (
          <button
            className="text-signal text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() => {
              setError(null);
              setCounterReason("");
              setCounterDialog("delivery-waiver");
            }}
            type="button"
          >
            Request Waiver
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        confirmLabel={feeDialogConfirmLabel}
        description={feeDialogDescription}
        onCancel={() => {
          if (pending) return;
          setFeeDialog(null);
          setFeeDialogReason("");
        }}
        onConfirm={confirmFeeDialog}
        open={feeDialog != null}
        pending={pending}
        title={feeDialogTitle}
      >
        <FormField
          htmlFor={`fee-dialog-reason-${order.id}`}
          label="Reason (optional)"
        >
          <FormTextarea
            id={`fee-dialog-reason-${order.id}`}
            onChange={(event) => setFeeDialogReason(event.target.value)}
            rows={2}
            value={feeDialogReason}
          />
        </FormField>
      </ConfirmDialog>

      <ConfirmDialog
        confirmLabel={
          counterDialog === "delivery-waiver"
            ? "Submit Waiver Request"
            : "Submit Request"
        }
        description={
          counterDialog === "delivery-waiver"
            ? `Request waiver of the quoted Delivery Fee ${formatRm(Number(quotedAmount ?? 0))} → ${formatRm(0)}. Amount due stays unchanged until Owner or Manager approval.`
            : "Request a Processing Fee change. Amount due stays unchanged until Owner or Manager approval."
        }
        onCancel={() => {
          if (pending) return;
          setCounterDialog(null);
          setCounterReason("");
        }}
        onConfirm={confirmCounterDialog}
        open={counterDialog != null}
        pending={pending}
        title={
          counterDialog === "delivery-waiver"
            ? "Request Delivery Fee Waiver"
            : "Request Processing Fee Change"
        }
      >
        {counterDialog === "processing-change" ? (
          <div className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-ink text-sm font-medium">
                Change type
              </legend>
              <label className="text-ink flex items-center gap-2 text-sm">
                <input
                  checked={processingRequestMode === "waiver"}
                  disabled={pending}
                  name="processing-request-mode"
                  onChange={() => setProcessingRequestMode("waiver")}
                  type="radio"
                />
                Waive Processing Fee
              </label>
              <label className="text-ink flex items-center gap-2 text-sm">
                <input
                  checked={processingRequestMode === "override"}
                  disabled={pending}
                  name="processing-request-mode"
                  onChange={() => setProcessingRequestMode("override")}
                  type="radio"
                />
                Change Processing Fee
              </label>
            </fieldset>
            {processingRequestMode === "override" ? (
              <FormField
                htmlFor={`processing-request-amount-${order.id}`}
                label="Requested amount (RM)"
              >
                <FormInput
                  id={`processing-request-amount-${order.id}`}
                  inputMode="decimal"
                  min={0.01}
                  onChange={(event) =>
                    setProcessingRequestAmount(event.target.value)
                  }
                  step="0.01"
                  type="number"
                  value={processingRequestAmount}
                />
              </FormField>
            ) : null}
          </div>
        ) : null}
        <FormField
          htmlFor={`counter-request-reason-${order.id}`}
          label="Reason (required)"
        >
          <FormTextarea
            id={`counter-request-reason-${order.id}`}
            onChange={(event) => setCounterReason(event.target.value)}
            rows={3}
            value={counterReason}
          />
        </FormField>
      </ConfirmDialog>

      <ConfirmDialog
        confirmLabel={
          resolveDialog?.decision === "approve"
            ? "Approve"
            : resolveDialog?.decision === "reject"
              ? "Reject"
              : "Confirm"
        }
        description={
          resolveDialog?.decision === "approve"
            ? resolveDialog.category === "delivery"
              ? "Approve this Delivery Fee waiver. Amount due will update."
              : "Approve this Processing Fee request. Amount due will update."
            : resolveDialog?.decision === "reject"
              ? resolveDialog.category === "delivery"
                ? "Reject this Delivery Fee waiver. The authoritative fee stays unchanged."
                : "Reject this Processing Fee request. The authoritative fee stays unchanged."
              : undefined
        }
        onCancel={() => {
          if (pending) return;
          setResolveDialog(null);
          setResolveNote("");
        }}
        onConfirm={confirmResolveDialog}
        open={resolveDialog != null}
        pending={pending}
        title={
          resolveDialog?.decision === "approve"
            ? resolveDialog.category === "delivery"
              ? "Approve Delivery Fee Waiver"
              : "Approve Processing Fee Request"
            : resolveDialog?.decision === "reject"
              ? resolveDialog.category === "delivery"
                ? "Reject Delivery Fee Waiver"
                : "Reject Processing Fee Request"
              : ""
        }
      >
        <FormField
          htmlFor={`resolve-note-${order.id}`}
          label={
            resolveDialog?.decision === "reject"
              ? "Rejection note (optional)"
              : "Note (optional)"
          }
        >
          <FormTextarea
            id={`resolve-note-${order.id}`}
            onChange={(event) => setResolveNote(event.target.value)}
            rows={2}
            value={resolveNote}
          />
        </FormField>
      </ConfirmDialog>
    </section>
  );
}

function PendingRequestCard({
  kindLabel,
  fromAmount,
  toAmount,
  requestedByName,
  requestedAt,
  reason,
  canCancel,
  canResolve,
  pending,
  onCancel,
  onApprove,
  onReject,
}: {
  kindLabel: string;
  fromAmount: number;
  toAmount: number;
  requestedByName: string | null;
  requestedAt: string | null;
  reason: string | null;
  canCancel: boolean;
  canResolve: boolean;
  pending: boolean;
  onCancel: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="border-fog space-y-1 rounded-lg border bg-mist/40 px-3 py-2">
      <p className="text-ink text-sm font-medium">
        {kindLabel} · {formatRm(fromAmount)} → {formatRm(toAmount)}
      </p>
      <p className="text-skyline text-sm">
        Requested by {feeRequestRequesterLabel(requestedByName)}
        {requestedAt ? ` · ${formatTimelineDateTime(requestedAt)}` : ""}
      </p>
      {reason?.trim() ? (
        <p className="text-skyline text-sm">Reason: {reason.trim()}</p>
      ) : null}
      {canResolve ? (
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            className="text-signal text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={onApprove}
            type="button"
          >
            Approve
          </button>
          <button
            className="text-signal text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={onReject}
            type="button"
          >
            Reject
          </button>
        </div>
      ) : (
        <p className="text-skyline text-sm">Pending review</p>
      )}
      {canCancel ? (
        <button
          className="text-signal text-sm font-medium disabled:opacity-60"
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          Cancel Request
        </button>
      ) : null}
    </div>
  );
}
