"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormSubmitButton,
} from "@/components/ui/form";
import { buildCakePriceBreakdown } from "@/engines/orders/cake-price-breakdown";
import { paymentMethodLabel } from "@/engines/orders/payment-details";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontOrder } from "@/types/storefront";
import { OWNER_ORDER_PAYMENT_SECTION_ID } from "@/engines/operations/owner-attention";
import { extendPaymentDeadlineAction } from "@/workspaces/owner/orders/actions";
import {
  formatPaymentDueRelative,
  formatPaymentHistoryDate,
  formatTimelineDateTime,
  isPaymentOverdue,
  toDatetimeLocalValue,
} from "@/workspaces/owner/orders/labels";
import { OrderDiscountsPanel } from "@/workspaces/owner/orders/OrderDiscountsPanel";
import { DeliveryFinanceBreakdown } from "@/workspaces/owner/orders/DeliveryFinanceBreakdown";
import { RecordPaymentForm } from "@/workspaces/owner/orders/RecordPaymentForm";
import { RecordRefundForm } from "@/workspaces/owner/orders/RecordRefundForm";
import {
  PAYMENT_CORRECTION_STATUS_LABEL,
  paymentCorrectionStatus,
} from "@/engines/orders/payment-correction";
import { withOwnerReturnTo } from "@/workspaces/owner/navigation/return-to";
import type { OperationsApprovalRecord } from "@/engines/operations/approvals";

type PaymentSectionProps = {
  order: StorefrontOrder;
  returnTo?: string | null;
  canPreparePaymentRequest?: boolean;
  canRecordPayment?: boolean;
  canRecordPaymentCorrection?: boolean;
  canManageDiscounts?: boolean;
  canOverrideDiscountEligibility?: boolean;
  canRequestOperationsApproval?: boolean;
  pendingDiscountApproval?: OperationsApprovalRecord | null;
  canExtendPaymentDeadline?: boolean;
};

export function PaymentSection({
  order,
  returnTo = null,
  canPreparePaymentRequest = false,
  canRecordPayment = false,
  canRecordPaymentCorrection = false,
  canManageDiscounts = false,
  canOverrideDiscountEligibility = false,
  canRequestOperationsApproval = false,
  pendingDiscountApproval = null,
  canExtendPaymentDeadline = false,
}: PaymentSectionProps) {
  const router = useRouter();
  const [showRecord, setShowRecord] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const settlement = order.settlement;
  const correctionStatus = paymentCorrectionStatus(settlement);
  const canCorrect =
    canRecordPaymentCorrection &&
    order.status !== "cancelled" &&
    settlement.overpayment > 0;
  const isPaid = order.status === "paid";
  const overdue = isPaymentOverdue(
    order.status,
    order.paymentDeadlineAt,
  );
  const canRecord =
    canRecordPayment &&
    order.status === "awaiting_payment" &&
    settlement.remainingBalance > 0;
  const canRequest =
    canPreparePaymentRequest &&
    order.status === "awaiting_payment" &&
    settlement.remainingBalance > 0;
  const canExtendFollowUp =
    canExtendPaymentDeadline &&
    order.status === "awaiting_payment" &&
    Boolean(order.paymentDeadlineAt);

  const cakeBreakdown = buildCakePriceBreakdown(
    order.items.map((item) => ({
      cakeName: item.cakeName,
      sizeLabel: item.sizeLabel,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  );

  const boundExtend = extendPaymentDeadlineAction.bind(null, order.id);
  const [extendState, extendAction, extendPending] = useActionState(
    boundExtend,
    { error: null, success: false },
  );

  useEffect(() => {
    if (!extendState.success) return;
    setShowExtend(false);
    router.refresh();
  }, [extendState.success, router]);

  return (
    <section
      className="border-fog scroll-mt-24 space-y-4 rounded-xl border bg-white p-5"
      id={OWNER_ORDER_PAYMENT_SECTION_ID}
      tabIndex={-1}
    >      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Payment
        </h2>
        {isPaid ? (
          <p className="text-ink text-xs font-semibold tracking-wide uppercase">
            Paid · Preorder Secured
          </p>
        ) : overdue ? (
          <p className="text-status-warning text-xs font-semibold tracking-wide uppercase">
            Payment overdue
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <ul className="space-y-2">
          {cakeBreakdown.lines.map((line, index) => (
            <li key={`${line.title}-${index}`}>
              {line.arithmetic ? (
                <>
                  <p className="text-ink text-sm font-medium">{line.title}</p>
                  <p className="text-skyline text-sm">{line.arithmetic}</p>
                </>
              ) : (
                <p className="text-ink text-sm font-medium">
                  {line.compactWithPrice}
                </p>
              )}
            </li>
          ))}
          {[...(order.paidAddons ?? [])]
            .sort(
              (a, b) =>
                a.sortOrder - b.sortOrder ||
                a.code.localeCompare(b.code, "en"),
            )
            .map((addon) => {
              const lineTotal = addon.unitPrice * addon.quantity;
              const title = `${addon.name} x${addon.quantity}`;
              return (
                <li key={`${addon.code}-${addon.id}`}>
                  {addon.quantity > 1 ? (
                    <>
                      <p className="text-ink text-sm font-medium">{title}</p>
                      <p className="text-skyline text-sm">
                        {formatRm(addon.unitPrice)} × {addon.quantity} ={" "}
                        {formatRm(lineTotal)}
                      </p>
                    </>
                  ) : (
                    <p className="text-ink text-sm font-medium">
                      {title} — {formatRm(lineTotal)}
                    </p>
                  )}
                </li>
              );
            })}
        </ul>
        {cakeBreakdown.sumExpression &&
        (order.paidAddons ?? []).length === 0 ? (
          <p className="text-skyline text-sm">{cakeBreakdown.sumExpression}</p>
        ) : null}
      </div>

      <DeliveryFinanceBreakdown order={order} />

      {canManageDiscounts ? (
        <OrderDiscountsPanel
          canOverrideDiscountEligibility={canOverrideDiscountEligibility}
          canRequestOperationsApproval={canRequestOperationsApproval}
          order={order}
          pendingDiscountApproval={pendingDiscountApproval}
        />
      ) : null}

      <dl
        className={`grid gap-2 text-sm ${
          settlement.overpayment > 0 || settlement.refundsTotal > 0
            ? "sm:grid-cols-2 lg:grid-cols-4"
            : "sm:grid-cols-3"
        }`}
      >
        <div>
          <dt className="text-skyline">Amount due</dt>
          <dd className="text-ink font-semibold">
            {formatRm(settlement.amountDue)}
          </dd>
        </div>
        <div>
          <dt className="text-skyline">Received</dt>
          <dd className="text-ink font-semibold">
            {formatRm(settlement.verifiedPaymentsAllocated)}
          </dd>
        </div>
        <div>
          <dt className="text-skyline">Balance</dt>
          <dd className="text-ink font-semibold">
            {formatRm(settlement.remainingBalance)}
          </dd>
        </div>
        {settlement.refundsTotal > 0 ? (
          <div>
            <dt className="text-skyline">Refunded</dt>
            <dd className="text-ink font-semibold">
              {formatRm(settlement.refundsTotal)}
            </dd>
          </div>
        ) : null}
        {settlement.overpayment > 0 ? (
          <div>
            <dt className="text-skyline">Overpaid</dt>
            <dd className="text-status-warning font-semibold">
              {formatRm(settlement.overpayment)}
            </dd>
          </div>
        ) : null}
      </dl>
      {correctionStatus !== "none" || settlement.overpayment > 0 ? (
        <p className="text-skyline text-sm">
          Correction: {PAYMENT_CORRECTION_STATUS_LABEL[correctionStatus]}.
          {settlement.overpayment > 0
            ? " Payment History stays as originally recorded."
            : null}
        </p>
      ) : null}

      {!isPaid && order.paymentDeadlineAt ? (
        <div className="space-y-1">
          <p className="text-skyline text-xs tracking-wide uppercase">
            Payment due
          </p>
          <p className="text-ink text-sm font-semibold">
            {formatPaymentDueRelative(order.paymentDeadlineAt)}
          </p>
          <p className="text-skyline text-xs">
            {overdue
              ? "Payment overdue — follow up manually"
              : "Payment hold active"}
            {" · "}
            {formatTimelineDateTime(order.paymentDeadlineAt)}
          </p>
        </div>
      ) : null}

      {!isPaid && !order.paymentDeadlineAt && order.paymentRequestSentAt ? (
        <p className="text-skyline text-sm">Payment request sent</p>
      ) : null}

      {order.refunds.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-ink text-xs font-semibold tracking-[0.12em] uppercase">
            Refunds
          </h3>
          <ul className="space-y-3">
            {order.refunds.map((row) => (
              <li key={row.id}>
                <p className="text-ink text-sm font-medium">
                  {formatRm(row.amount)}
                </p>
                <p className="text-skyline text-sm">
                  Recorded {formatPaymentHistoryDate(row.refundedAt)}
                  {" · "}
                  {row.createdByName ?? "Staff"}
                </p>
                {row.reason ? (
                  <p className="text-skyline whitespace-pre-line text-sm">
                    {row.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {order.paymentAllocations.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-ink text-xs font-semibold tracking-[0.12em] uppercase">
            Payment history
          </h3>
          <ul className="space-y-3">
            {order.paymentAllocations.map((row) => (
              <li key={row.id}>
                <p className="text-ink text-sm font-medium">
                  {formatRm(row.amount)}
                </p>
                <p className="text-skyline text-sm">
                  {paymentMethodLabel(row.method, row.methodDescription)}
                  {" · "}
                  {formatPaymentHistoryDate(row.paidAt)}
                </p>
                <p className="text-skyline text-xs">
                  Verified by {row.verifiedByName ?? "Staff"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canRequest || canRecord || canCorrect ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {canRequest ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium"
              href={withOwnerReturnTo(
                `/owner/orders/${order.id}/payment`,
                returnTo,
              )}
            >
              Prepare Payment Request
            </Link>
          ) : null}
          {canRecord ? (
            <button
              className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
              onClick={() => {
                setShowRecord(true);
                setShowRefund(false);
                setShowExtend(false);
              }}
              type="button"
            >
              + Record Payment
            </button>
          ) : null}
          {canCorrect ? (
            <button
              className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
              onClick={() => {
                setShowRefund(true);
                setShowRecord(false);
                setShowExtend(false);
              }}
              type="button"
            >
              Record refund
            </button>
          ) : null}
          {canExtendFollowUp ? (
            <button
              className="text-skyline hover:text-ink inline-flex min-h-12 items-center justify-center px-2 text-sm font-medium"
              onClick={() => {
                setShowExtend((value) => !value);
                setShowRecord(false);
                setShowRefund(false);
              }}
              type="button"
            >
              Extend follow-up
            </button>
          ) : null}
        </div>
      ) : null}

      {showRecord && canRecord ? (
        <RecordPaymentForm
          onCancel={() => setShowRecord(false)}
          orderId={order.id}
          remainingBalance={settlement.remainingBalance}
        />
      ) : null}

      {showRefund && canCorrect ? (
        <RecordRefundForm
          onCancel={() => setShowRefund(false)}
          order={order}
        />
      ) : null}

      {showExtend && canExtendFollowUp ? (
        <form action={extendAction} className="border-fog space-y-3 rounded-xl border bg-mist/30 p-4">
          <FormField htmlFor="deadline_at" label="Follow-up deadline">
            <FormInput
              defaultValue={toDatetimeLocalValue(
                order.paymentDeadlineAt
                  ? new Date(order.paymentDeadlineAt)
                  : new Date(),
              )}
              id="deadline_at"
              name="deadline_at"
              required
              type="datetime-local"
            />
          </FormField>
          <FormError message={extendState.error} />
          <FormActions>
            <FormSubmitButton pending={extendPending}>
              Save deadline
            </FormSubmitButton>
            <button
              className="text-skyline hover:text-ink text-sm font-medium"
              onClick={() => setShowExtend(false)}
              type="button"
            >
              Cancel
            </button>
          </FormActions>
        </form>
      ) : null}
    </section>
  );
}
