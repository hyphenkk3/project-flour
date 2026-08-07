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
import { extendPaymentDeadlineAction } from "@/workspaces/owner/orders/actions";
import {
  formatPaymentDueRelative,
  formatPaymentHistoryDate,
  formatTimelineDateTime,
  isPaymentOverdue,
  toDatetimeLocalValue,
} from "@/workspaces/owner/orders/labels";
import { OrderDiscountsPanel } from "@/workspaces/owner/orders/OrderDiscountsPanel";
import { RecordPaymentForm } from "@/workspaces/owner/orders/RecordPaymentForm";

type PaymentSectionProps = {
  order: StorefrontOrder;
};

export function PaymentSection({ order }: PaymentSectionProps) {
  const router = useRouter();
  const [showRecord, setShowRecord] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const settlement = order.settlement;
  const isPaid = order.status === "paid";
  const overdue = isPaymentOverdue(
    order.status,
    order.paymentDeadlineAt,
  );
  const canRecord = order.status === "awaiting_payment";
  const canRequest = order.status === "awaiting_payment";
  const canExtendFollowUp =
    canRecord && Boolean(order.paymentDeadlineAt);

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
    <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Payment
        </h2>
        {isPaid ? (
          <p className="text-status-success text-xs font-semibold tracking-wide uppercase">
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
        </ul>
        {cakeBreakdown.sumExpression ? (
          <p className="text-skyline text-sm">{cakeBreakdown.sumExpression}</p>
        ) : null}
      </div>

      <OrderDiscountsPanel order={order} />

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-skyline">Amount due</dt>
          <dd className="text-ink font-semibold">
            {formatRm(settlement.amountDue)}
          </dd>
        </div>
        <div>
          <dt className="text-skyline">Received</dt>
          <dd className="text-ink font-semibold">
            {formatRm(settlement.netReceived)}
          </dd>
        </div>
        <div>
          <dt className="text-skyline">Balance</dt>
          <dd className="text-ink font-semibold">
            {formatRm(settlement.remainingBalance)}
          </dd>
        </div>
      </dl>

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

      {canRequest || canRecord ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {canRequest ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium"
              href={`/owner/orders/${order.id}/payment`}
            >
              Prepare Payment Request
            </Link>
          ) : null}
          {canRecord ? (
            <button
              className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
              onClick={() => {
                setShowRecord(true);
                setShowExtend(false);
              }}
              type="button"
            >
              + Record Payment
            </button>
          ) : null}
          {canExtendFollowUp ? (
            <button
              className="text-skyline hover:text-ink inline-flex min-h-12 items-center justify-center px-2 text-sm font-medium"
              onClick={() => {
                setShowExtend((value) => !value);
                setShowRecord(false);
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
