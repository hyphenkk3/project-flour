"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import {
  AUGUST_PROMO_AMOUNT,
  AUGUST_PROMO_CODE,
  AUGUST_PROMO_LABEL,
  evaluateAugustPromoEligibility,
  evaluateAugustPromoRuleFit,
  evaluateRm10CardRuleFit,
  getEffectiveAdjustments,
  hasActiveAdjustmentCode,
  RM10_CARD_AMOUNT,
  RM10_CARD_CODE,
  RM10_CARD_LABEL,
  rm10IssuanceSuppressionLabel,
  singaporeDateFromIso,
} from "@/engines/orders/promotions";
import { isDeliveryFinanceAdjustmentCode } from "@/engines/orders/delivery-finance";
import { calculateCakeSubtotal } from "@/engines/orders/totals";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontOrder } from "@/types/storefront";
import { isGuestOrderEditable } from "@/workspaces/owner/orders/labels";
import {
  applyAugustPromoAction,
  changeAugustPromoToRm10Action,
  redeemRm10VoucherAction,
  removeOrderDiscountAction,
  type RedeemRm10State,
} from "@/workspaces/owner/orders/actions";
import {
  discountExceptionEligibilityReason,
  projectedAmountDueAfterRm10,
  type OperationsApprovalRecord,
} from "@/engines/operations/approvals";
import { createOperationsApprovalAction } from "@/workspaces/owner/approvals/actions";

type OrderDiscountsPanelProps = {
  order: StorefrontOrder;
  /** Owner-only invalid-voucher / eligibility override checkbox. */
  canOverrideDiscountEligibility?: boolean;
  canRequestOperationsApproval?: boolean;
  pendingDiscountApproval?: OperationsApprovalRecord | null;
};

const initialRedeemState: RedeemRm10State = {
  error: null,
  success: false,
};

function formatAdjustmentAmount(amount: number): string {
  if (amount < 0) return `-${formatRm(Math.abs(amount))}`;
  if (amount > 0) return `+${formatRm(amount)}`;
  return formatRm(0);
}

export function OrderDiscountsPanel({
  order,
  canOverrideDiscountEligibility = false,
  canRequestOperationsApproval = false,
  pendingDiscountApproval = null,
}: OrderDiscountsPanelProps) {
  const router = useRouter();
  const [promoPending, startPromo] = useTransition();
  const [lifecyclePending, startLifecycle] = useTransition();
  const [promoError, setPromoError] = useState<string | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [showRm10Form, setShowRm10Form] = useState(false);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [changeOverride, setChangeOverride] = useState(false);
  const [voucherNumber, setVoucherNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [changeVoucherNumber, setChangeVoucherNumber] = useState("");
  const [changeExpiryDate, setChangeExpiryDate] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalPending, startApproval] = useTransition();

  const effective = useMemo(
    () =>
      getEffectiveAdjustments(order.adjustments).filter(
        (row) => !isDeliveryFinanceAdjustmentCode(row.code),
      ),
    [order.adjustments],
  );
  const hasAugust = hasActiveAdjustmentCode(order.adjustments, AUGUST_PROMO_CODE);
  const hasRm10 = hasActiveAdjustmentCode(order.adjustments, RM10_CARD_CODE);
  const canMutateDiscounts = isGuestOrderEditable(order.status);
  const orderDate = singaporeDateFromIso(order.createdAt);

  const activePromo = effective.find((row) => row.code === AUGUST_PROMO_CODE);
  const activeRm10 = effective.find((row) => row.code === RM10_CARD_CODE);

  const cakeSubtotal = calculateCakeSubtotal(order.items);

  const august = evaluateAugustPromoEligibility({
    orderSource: order.orderSource,
    orderDate,
    pickupDate: order.pickupDate,
    cakeSubtotal,
    hasAugustPromo: hasAugust,
    hasRm10Card: hasRm10,
    hasVerifiedPayments: order.settlement.netReceived > 0,
    orderStatus: order.status,
  });

  const augustRuleFit = evaluateAugustPromoRuleFit({
    orderSource: order.orderSource,
    orderDate,
    pickupDate: order.pickupDate,
    cakeSubtotal,
  });

  const rm10Expiry =
    typeof activeRm10?.metadata.expiry_date === "string"
      ? activeRm10.metadata.expiry_date
      : null;
  const rm10RuleFit = rm10Expiry
    ? evaluateRm10CardRuleFit({
        items: order.items,
        orderDate,
        pickupDate: order.pickupDate,
        expiryDate: rm10Expiry,
      })
    : evaluateRm10CardRuleFit({
        items: order.items,
        orderDate,
        pickupDate: order.pickupDate,
        expiryDate: "9999-12-31",
      });

  const canOfferRm10Form = canMutateDiscounts && !hasAugust && !hasRm10;
  const redeemException = expiryDate
    ? discountExceptionEligibilityReason({
        items: order.items,
        orderDate,
        pickupDate: order.pickupDate,
        expiryDate,
        hasAugustPromo: hasAugust,
        hasRm10Card: hasRm10,
      })
    : { canRequest: false, reason: null };
  const changeException = changeExpiryDate
    ? discountExceptionEligibilityReason({
        items: order.items,
        orderDate,
        pickupDate: order.pickupDate,
        expiryDate: changeExpiryDate,
        hasAugustPromo: false,
        hasRm10Card: hasRm10,
      })
    : { canRequest: false, reason: null };

  function requestDiscountApproval(input: {
    action: "redeem_rm10" | "change_august_to_rm10";
    voucherNumber: string;
    expiryDate: string;
    eligibilityReason: string;
  }) {
    const reason = approvalReason.trim() || input.eligibilityReason;
    if (!reason) {
      setApprovalError("A reason is required.");
      return;
    }
    if (!input.voucherNumber.trim() || !input.expiryDate) {
      setApprovalError("Enter the voucher number and expiry date.");
      return;
    }
    setApprovalError(null);
    startApproval(async () => {
      const result = await createOperationsApprovalAction({
        orderId: order.id,
        requestType: "discount_exception",
        reason,
        payload: {
          kind: "discount_exception",
          action: input.action,
          voucherNumber: input.voucherNumber.trim(),
          expiryDate: input.expiryDate,
          eligibilityReason: input.eligibilityReason,
          currentAmountDue: order.settlement.amountDue,
          requestedAmountDue: projectedAmountDueAfterRm10({
            currentAmountDue: order.settlement.amountDue,
            action: input.action,
          }),
        },
      });
      if (result.error) {
        setApprovalError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const boundRedeem = redeemRm10VoucherAction.bind(null, order.id);
  const [redeemState, redeemAction, redeemPending] = useActionState(
    boundRedeem,
    initialRedeemState,
  );

  const boundChange = changeAugustPromoToRm10Action.bind(null, order.id);
  const [changeState, changeAction, changePending] = useActionState(
    boundChange,
    initialRedeemState,
  );

  useEffect(() => {
    if (!redeemState.success) return;
    setShowRm10Form(false);
    setOwnerOverride(false);
    router.refresh();
  }, [redeemState.success, router]);

  useEffect(() => {
    if (!changeState.success) return;
    setShowChangeForm(false);
    setChangeOverride(false);
    router.refresh();
  }, [changeState.success, router]);

  function handleApplyAugust() {
    setPromoError(null);
    startPromo(async () => {
      const result = await applyAugustPromoAction(order.id);
      if (result.error) {
        setPromoError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRemove(adjustmentId: string) {
    setLifecycleError(null);
    startLifecycle(async () => {
      const result = await removeOrderDiscountAction(order.id, adjustmentId);
      if (result.error) {
        setLifecycleError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const suppressionLabel = rm10IssuanceSuppressionLabel(
    order.rm10CardIssuanceSuppressionCode,
  );

  const projectedChangeDue =
    order.settlement.subtotal + RM10_CARD_AMOUNT;

  return (
    <div className="space-y-4">
      {effective.length > 0 ? (
        <ul className="space-y-2">
          <li className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-skyline">Subtotal</span>
            <span className="text-ink font-medium">
              {formatRm(order.settlement.subtotal)}
            </span>
          </li>
          {effective.map((row) => (
            <li
              className="flex items-baseline justify-between gap-3 text-sm"
              key={row.id}
            >
              <span className="text-ink">
                {row.label}
                {typeof row.metadata.voucher_number === "string"
                  ? ` #${row.metadata.voucher_number}`
                  : ""}
              </span>
              <span className="text-ink font-medium">
                {formatAdjustmentAmount(row.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {order.rm10CardIssuanceSuppressed && suppressionLabel ? (
        <p className="text-skyline text-xs">
          RM10 Discount Card · Do not issue
          <br />
          Reason: {suppressionLabel}
        </p>
      ) : null}

      {hasAugust && !augustRuleFit.eligible ? (
        <p className="text-status-warning text-xs">
          {AUGUST_PROMO_LABEL} no longer meets its normal eligibility rules
          {augustRuleFit.reason ? ` (${augustRuleFit.reason})` : ""}. Staff may
          still keep, change, or remove it.
        </p>
      ) : null}

      {hasRm10 && !rm10RuleFit.eligible ? (
        <p className="text-status-warning text-xs">
          {RM10_CARD_LABEL} no longer meets its normal eligibility rules
          {rm10RuleFit.reason ? ` (${rm10RuleFit.reason})` : ""}. Staff may still
          keep or remove it.
        </p>
      ) : null}

      {canMutateDiscounts && (activePromo || activeRm10) ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {activePromo ? (
            <>
              <button
                className="border-fog text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium"
                disabled={lifecyclePending}
                onClick={() => {
                  setShowChangeForm(true);
                  setShowRm10Form(false);
                  setLifecycleError(null);
                }}
                type="button"
              >
                Change Discount
              </button>
              <button
                className="text-skyline hover:text-ink inline-flex min-h-10 items-center justify-center px-2 text-sm font-medium disabled:opacity-60"
                disabled={lifecyclePending}
                onClick={() => handleRemove(activePromo.id)}
                type="button"
              >
                {lifecyclePending ? "Updating…" : "Remove Discount"}
              </button>
            </>
          ) : null}
          {activeRm10 ? (
            <button
              className="text-skyline hover:text-ink inline-flex min-h-10 items-center justify-center px-2 text-sm font-medium disabled:opacity-60"
              disabled={lifecyclePending}
              onClick={() => handleRemove(activeRm10.id)}
              type="button"
            >
              {lifecyclePending ? "Updating…" : "Remove Discount"}
            </button>
          ) : null}
        </div>
      ) : null}

      {lifecycleError ? (
        <p className="text-status-danger text-sm" role="alert">
          {lifecycleError}
        </p>
      ) : null}

      {pendingDiscountApproval ? (
        <p className="border-status-warning/30 bg-status-warning-soft text-status-warning rounded-lg border px-4 py-3 text-sm">
          Discount exception approval is pending Owner review.
        </p>
      ) : null}

      {showChangeForm && activePromo && canMutateDiscounts ? (
        <form
          action={changeAction}
          className="border-fog space-y-3 rounded-lg border p-3"
        >
          <p className="text-ink text-sm font-medium">Change Discount</p>
          <p className="text-skyline text-sm">
            Replace {AUGUST_PROMO_LABEL} ({formatAdjustmentAmount(AUGUST_PROMO_AMOUNT)})
            with {RM10_CARD_LABEL} ({formatAdjustmentAmount(RM10_CARD_AMOUNT)}).
          </p>
          <p className="text-ink text-sm">
            Resulting amount due · {formatRm(projectedChangeDue)}
          </p>
          <FormField htmlFor="change_voucher_number" label="Voucher number">
            <FormInput
              id="change_voucher_number"
              name="voucher_number"
              onChange={(event) => setChangeVoucherNumber(event.target.value)}
              placeholder="e.g. 325"
              required
              value={changeVoucherNumber}
            />
          </FormField>
          <FormField htmlFor="change_expiry_date" label="Expiry date">
            <FormInput
              id="change_expiry_date"
              name="expiry_date"
              onChange={(event) => setChangeExpiryDate(event.target.value)}
              required
              type="date"
              value={changeExpiryDate}
            />
          </FormField>
          {canOverrideDiscountEligibility ? (
            <>
              <label className="text-ink flex items-center gap-2 text-sm">
                <input
                  checked={changeOverride}
                  name="owner_override"
                  onChange={(event) => setChangeOverride(event.target.checked)}
                  type="checkbox"
                  value="1"
                />
                Owner override (invalid voucher exception)
              </label>
              {changeOverride ? (
                <FormField htmlFor="change_override_reason" label="Override reason">
                  <FormTextarea
                    id="change_override_reason"
                    name="override_reason"
                    placeholder="Required reason for the exception"
                    required
                    rows={2}
                  />
                </FormField>
              ) : (
                <input name="owner_override" type="hidden" value="0" />
              )}
            </>
          ) : canRequestOperationsApproval && changeException.canRequest ? (
            <div className="space-y-2">
              <p className="text-status-warning text-sm">
                Voucher cannot be applied automatically.
              </p>
              <p className="text-ink text-sm">
                This voucher does not meet the normal eligibility rules.
                {changeException.reason ? ` ${changeException.reason}` : ""}
              </p>
              <FormField htmlFor="change_approval_reason" label="Reason">
                <FormTextarea
                  id="change_approval_reason"
                  onChange={(event) => setApprovalReason(event.target.value)}
                  placeholder={changeException.reason ?? "Why this exception is needed"}
                  rows={2}
                  value={approvalReason}
                />
              </FormField>
              <input name="owner_override" type="hidden" value="0" />
            </div>
          ) : (
            <input name="owner_override" type="hidden" value="0" />
          )}
          <FormError message={changeState.error ?? approvalError} />
          <FormActions>
            {canRequestOperationsApproval && changeException.canRequest ? (
              <button
                className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
                disabled={approvalPending || Boolean(pendingDiscountApproval)}
                onClick={() =>
                  requestDiscountApproval({
                    action: "change_august_to_rm10",
                    voucherNumber: changeVoucherNumber,
                    expiryDate: changeExpiryDate,
                    eligibilityReason: changeException.reason ?? "",
                  })
                }
                type="button"
              >
                {approvalPending ? "Requesting…" : "Request Approval"}
              </button>
            ) : (
              <FormSubmitButton pending={changePending}>
                Confirm Change
              </FormSubmitButton>
            )}
            <button
              className="text-skyline hover:text-ink text-sm font-medium"
              onClick={() => setShowChangeForm(false)}
              type="button"
            >
              Cancel
            </button>
          </FormActions>
        </form>
      ) : null}

      {canMutateDiscounts ? (
        <div className="space-y-3">
          {august.eligible ? (
            <div className="border-fog space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-ink text-sm font-medium">Eligible promotion</p>
              <p className="text-skyline text-sm">
                {AUGUST_PROMO_LABEL} · {formatRm(Math.abs(AUGUST_PROMO_AMOUNT))}{" "}
                off
              </p>
              <button
                className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
                disabled={promoPending}
                onClick={handleApplyAugust}
                type="button"
              >
                {promoPending ? "Applying…" : "Apply Promotion"}
              </button>
              {promoError ? (
                <p className="text-status-danger text-sm" role="alert">
                  {promoError}
                </p>
              ) : null}
            </div>
          ) : null}

          {canOfferRm10Form && !pendingDiscountApproval ? (
            <div className="space-y-2">
              {!showRm10Form ? (
                <button
                  className="border-fog text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium"
                  onClick={() => {
                    setShowRm10Form(true);
                    setShowChangeForm(false);
                  }}
                  type="button"
                >
                  Redeem RM10 Discount Card
                </button>
              ) : (
                <form
                  action={redeemAction}
                  className="border-fog space-y-3 rounded-lg border p-3"
                >
                  <p className="text-ink text-sm font-medium">
                    {RM10_CARD_LABEL} · {formatRm(Math.abs(RM10_CARD_AMOUNT))}
                  </p>
                  <p className="text-skyline text-xs">
                    Enter details from the customer’s card photo. No OCR —
                    verify manually.
                  </p>
                  <FormField htmlFor="voucher_number" label="Voucher number">
                    <FormInput
                      id="voucher_number"
                      name="voucher_number"
                      onChange={(event) => setVoucherNumber(event.target.value)}
                      placeholder="e.g. 325"
                      required
                      value={voucherNumber}
                    />
                  </FormField>
                  <FormField htmlFor="expiry_date" label="Expiry date">
                    <FormInput
                      id="expiry_date"
                      name="expiry_date"
                      onChange={(event) => setExpiryDate(event.target.value)}
                      required
                      type="date"
                      value={expiryDate}
                    />
                  </FormField>
                  {canOverrideDiscountEligibility ? (
                    <>
                      <label className="text-ink flex items-center gap-2 text-sm">
                        <input
                          checked={ownerOverride}
                          name="owner_override"
                          onChange={(event) =>
                            setOwnerOverride(event.target.checked)
                          }
                          type="checkbox"
                          value="1"
                        />
                        Owner override (invalid voucher exception)
                      </label>
                      {ownerOverride ? (
                        <FormField htmlFor="override_reason" label="Override reason">
                          <FormTextarea
                            id="override_reason"
                            name="override_reason"
                            placeholder="Required reason for the exception"
                            required
                            rows={2}
                          />
                        </FormField>
                      ) : (
                        <input name="owner_override" type="hidden" value="0" />
                      )}
                    </>
                  ) : canRequestOperationsApproval && redeemException.canRequest ? (
                    <div className="space-y-2">
                      <p className="text-status-warning text-sm">
                        Voucher cannot be applied automatically.
                      </p>
                      <p className="text-ink text-sm">
                        This voucher does not meet the normal eligibility rules.
                        {redeemException.reason
                          ? ` ${redeemException.reason}`
                          : ""}
                      </p>
                      <FormField htmlFor="rm10_approval_reason" label="Reason">
                        <FormTextarea
                          id="rm10_approval_reason"
                          onChange={(event) =>
                            setApprovalReason(event.target.value)
                          }
                          placeholder={
                            redeemException.reason ??
                            "Why this exception is needed"
                          }
                          rows={2}
                          value={approvalReason}
                        />
                      </FormField>
                      <input name="owner_override" type="hidden" value="0" />
                    </div>
                  ) : (
                    <input name="owner_override" type="hidden" value="0" />
                  )}
                  <FormError message={redeemState.error ?? approvalError} />
                  <FormActions>
                    {canRequestOperationsApproval &&
                    redeemException.canRequest ? (
                      <button
                        className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
                        disabled={approvalPending}
                        onClick={() =>
                          requestDiscountApproval({
                            action: "redeem_rm10",
                            voucherNumber,
                            expiryDate,
                            eligibilityReason: redeemException.reason ?? "",
                          })
                        }
                        type="button"
                      >
                        {approvalPending ? "Requesting…" : "Request Approval"}
                      </button>
                    ) : (
                      <FormSubmitButton pending={redeemPending}>
                        Redeem & Apply
                      </FormSubmitButton>
                    )}
                    <button
                      className="text-skyline hover:text-ink text-sm font-medium"
                      onClick={() => setShowRm10Form(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </FormActions>
                </form>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
