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
  getEffectiveAdjustments,
  hasActiveAdjustmentCode,
  RM10_CARD_AMOUNT,
  RM10_CARD_CODE,
  RM10_CARD_LABEL,
  rm10IssuanceSuppressionLabel,
  singaporeDateFromIso,
} from "@/engines/orders/promotions";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontOrder } from "@/types/storefront";
import {
  applyAugustPromoAction,
  changeAugustPromoToRm10Action,
  redeemRm10VoucherAction,
  removeOrderDiscountAction,
  type RedeemRm10State,
} from "@/workspaces/owner/orders/actions";

type OrderDiscountsPanelProps = {
  order: StorefrontOrder;
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

export function OrderDiscountsPanel({ order }: OrderDiscountsPanelProps) {
  const router = useRouter();
  const [promoPending, startPromo] = useTransition();
  const [lifecyclePending, startLifecycle] = useTransition();
  const [promoError, setPromoError] = useState<string | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [showRm10Form, setShowRm10Form] = useState(false);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [changeOverride, setChangeOverride] = useState(false);

  const effective = useMemo(
    () => getEffectiveAdjustments(order.adjustments),
    [order.adjustments],
  );
  const hasAugust = hasActiveAdjustmentCode(order.adjustments, AUGUST_PROMO_CODE);
  const hasRm10 = hasActiveAdjustmentCode(order.adjustments, RM10_CARD_CODE);
  const hasVerifiedPayments = order.settlement.netReceived > 0;
  const canMutateDiscounts =
    order.status !== "paid" && !hasVerifiedPayments;
  const orderDate = singaporeDateFromIso(order.createdAt);

  const activePromo = effective.find((row) => row.code === AUGUST_PROMO_CODE);
  const activeRm10 = effective.find((row) => row.code === RM10_CARD_CODE);

  const august = evaluateAugustPromoEligibility({
    orderSource: order.orderSource,
    orderDate,
    pickupDate: order.pickupDate,
    subtotal: order.settlement.subtotal,
    hasAugustPromo: hasAugust,
    hasRm10Card: hasRm10,
    hasVerifiedPayments,
    orderStatus: order.status,
  });

  const canOfferRm10Form =
    canMutateDiscounts && !hasAugust && !hasRm10;

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

      {hasVerifiedPayments && (hasAugust || hasRm10) ? (
        <p className="text-skyline text-xs">
          Payment has already been received. Discount changes require a payment
          correction/refund workflow.
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
              placeholder="e.g. 325"
              required
            />
          </FormField>
          <FormField htmlFor="change_expiry_date" label="Expiry date">
            <FormInput
              id="change_expiry_date"
              name="expiry_date"
              required
              type="date"
            />
          </FormField>
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
          <FormError message={changeState.error} />
          <FormActions>
            <FormSubmitButton pending={changePending}>
              Confirm Change
            </FormSubmitButton>
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

          {canOfferRm10Form ? (
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
                      placeholder="e.g. 325"
                      required
                    />
                  </FormField>
                  <FormField htmlFor="expiry_date" label="Expiry date">
                    <FormInput
                      id="expiry_date"
                      name="expiry_date"
                      required
                      type="date"
                    />
                  </FormField>
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
                  <FormError message={redeemState.error} />
                  <FormActions>
                    <FormSubmitButton pending={redeemPending}>
                      Redeem & Apply
                    </FormSubmitButton>
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
