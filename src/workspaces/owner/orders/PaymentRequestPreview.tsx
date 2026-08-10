"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  defaultPaymentDeadlineAt,
  PAYMENT_METHOD_LABELS,
  type PaymentRequestMethod,
} from "@/engines/orders/payment-details";
import {
  buildPaymentRequestPayload,
  generatePaymentRequestMessage,
  hasPriorVerifiedPayment,
  paymentRequestCollectAmount,
} from "@/engines/orders/payment-message";
import { getEffectiveAdjustments } from "@/engines/orders/promotions";
import { buildWhatsAppDeepLink } from "@/engines/orders/whatsapp";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontOrder } from "@/types/storefront";
import {
  markPaymentRequestSentAction,
  recordPaymentRequestPreparedAction,
} from "@/workspaces/owner/orders/actions";
import {
  formatPaymentDueRelative,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/workspaces/owner/orders/labels";
import { FormField, FormInput } from "@/components/ui/form";
import {
  ownerOrderWorkspaceHref,
  resolveOwnerReturnTo,
} from "@/workspaces/owner/navigation/return-to";

type PaymentRequestPreviewProps = {
  order: StorefrontOrder;
  returnTo?: string;
};

const REQUEST_METHODS: PaymentRequestMethod[] = ["wb_qr", "online_transfer"];

export function PaymentRequestPreview({
  order,
  returnTo,
}: PaymentRequestPreviewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [preparedLogged, setPreparedLogged] = useState(false);
  const [method, setMethod] = useState<PaymentRequestMethod>("wb_qr");
  const back = resolveOwnerReturnTo(returnTo);
  const workspaceHref = ownerOrderWorkspaceHref(
    order.id,
    back.label === "Whole Cake Calendar" ? back.href : null,
  );

  const settlement = order.settlement;
  const isOutstandingBalanceRequest =
    hasPriorVerifiedPayment(settlement.netReceived) &&
    settlement.remainingBalance > 0;

  // Follow-up after prior payment (e.g. Paid → amended → Awaiting Payment):
  // allow Mark as Sent again and set a fresh follow-up deadline.
  const canMarkSent =
    settlement.remainingBalance > 0 &&
    (!order.paymentDeadlineAt || isOutstandingBalanceRequest);

  const [deadlineLocal, setDeadlineLocal] = useState(() =>
    toDatetimeLocalValue(
      isOutstandingBalanceRequest
        ? defaultPaymentDeadlineAt()
        : order.paymentDeadlineAt
          ? new Date(order.paymentDeadlineAt)
          : defaultPaymentDeadlineAt(),
    ),
  );
  const [adjustDeadline, setAdjustDeadline] = useState(false);

  const deadlineIso = fromDatetimeLocalValue(deadlineLocal);
  const deadlineLabel = deadlineIso
    ? formatPaymentDueRelative(deadlineIso)
    : "—";

  const effectiveAdjustments = useMemo(
    () => getEffectiveAdjustments(order.adjustments),
    [order.adjustments],
  );

  const payload = buildPaymentRequestPayload({
    commercialSubtotal: settlement.subtotal,
    amountDue: settlement.amountDue,
    netReceived: settlement.netReceived,
    remainingBalance: settlement.remainingBalance,
    adjustments: effectiveAdjustments.map((row) => ({
      label: row.label,
      amount: row.amount,
      metadata: row.metadata,
      referenceNumber:
        typeof row.metadata.voucher_number === "string"
          ? row.metadata.voucher_number
          : null,
    })),
    method,
  });
  const collectAmount = paymentRequestCollectAmount(payload);
  const message = generatePaymentRequestMessage(payload);
  const whatsappUrl = buildWhatsAppDeepLink(order.phone, message);

  useEffect(() => {
    const key = `wb-pay-prepared:${order.id}:${settlement.remainingBalance}`;
    try {
      if (window.sessionStorage.getItem(key) === "1") {
        setPreparedLogged(true);
        return;
      }
      window.sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable
    }
    if (preparedLogged) return;
    setPreparedLogged(true);
    void recordPaymentRequestPreparedAction(order.id);
  }, [order.id, preparedLogged, settlement.remainingBalance]);

  function handleCopy() {
    void navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleOpenWhatsApp() {
    if (!order.phone.trim()) {
      setError("No WhatsApp phone on this order.");
      return;
    }
    if (!whatsappUrl) {
      setError("Could not build a WhatsApp link from this phone number.");
      return;
    }
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  function handleMarkSent() {
    setError(null);
    const iso = fromDatetimeLocalValue(deadlineLocal);
    if (!iso) {
      setError("Enter a valid payment deadline.");
      return;
    }

    startTransition(async () => {
      const result = await markPaymentRequestSentAction(order.id, {
        method,
        messageBody: message,
        deadlineAtIso: iso,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(workspaceHref);
      router.refresh();
    });
  }

  if (settlement.remainingBalance <= 0) {
    return (
      <div className="space-y-4">
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={workspaceHref}
        >
          ← Order Workspace
        </Link>
        <p className="text-ink text-sm">
          No outstanding balance — a Payment Request is not needed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={workspaceHref}
        >
          ← Order Workspace
        </Link>
        <h1 className="font-display text-ink mt-3 text-2xl tracking-tight">
          Payment Request
        </h1>
        <p className="text-skyline mt-1 text-sm">
          {isOutstandingBalanceRequest
            ? "Ask only for the outstanding balance. Money already received stays credited."
            : "Choose the payment instructions to send. WB QR is the normal default."}{" "}
          Opening WhatsApp does not record payment or change the hold.
        </p>
      </div>

      <section className="border-fog space-y-5 rounded-xl border bg-white p-5">
        <div className="space-y-1">
          <p className="text-skyline text-xs tracking-wide uppercase">
            {isOutstandingBalanceRequest
              ? "Balance to pay"
              : "Amount to request"}
          </p>
          <p className="text-ink text-2xl font-semibold tracking-tight">
            {formatRm(collectAmount)}
          </p>
          {isOutstandingBalanceRequest ? (
            <p className="text-skyline text-sm">
              Amount due {formatRm(settlement.amountDue)} · Received{" "}
              {formatRm(settlement.netReceived)}
            </p>
          ) : null}
        </div>

        <fieldset className="space-y-3">
          <legend className="text-ink text-sm font-medium">
            Payment instructions
          </legend>
          <div
            aria-label="Payment instructions"
            className="grid gap-2 sm:grid-cols-2"
            role="radiogroup"
          >
            {REQUEST_METHODS.map((value) => {
              const selected = method === value;
              return (
                <button
                  aria-checked={selected}
                  className={
                    selected
                      ? "border-ink bg-ink text-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-4 text-sm font-medium"
                      : "border-fog text-ink hover:border-skyline hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium"
                  }
                  key={value}
                  onClick={() => setMethod(value)}
                  role="radio"
                  type="button"
                >
                  {PAYMENT_METHOD_LABELS[value]}
                </button>
              );
            })}
          </div>
          <p className="text-skyline text-xs">
            Instructions being sent to the customer — not the final recorded
            payment method. Actual method is set when you Record & Verify
            Payment.
          </p>
        </fieldset>

        <div className="space-y-2">
          <p className="text-ink text-sm font-medium">Payment due</p>
          <p className="text-ink text-lg font-semibold tracking-tight">
            {deadlineLabel}
          </p>
          <p className="text-skyline text-sm">
            {isOutstandingBalanceRequest
              ? "Follow-up window for the outstanding balance"
              : order.paymentDeadlineAt && !isOutstandingBalanceRequest
                ? "Existing payment hold — unchanged when sending alternative instructions"
                : "24-hour payment window"}
          </p>
          {order.paymentDeadlineAt && !isOutstandingBalanceRequest ? (
            <p className="text-skyline text-xs">
              To change the hold, use Extend follow-up in Order Workspace.
            </p>
          ) : !adjustDeadline ? (
            <button
              className="text-signal text-sm font-medium"
              onClick={() => setAdjustDeadline(true)}
              type="button"
            >
              Adjust
            </button>
          ) : (
            <div className="space-y-2 pt-1">
              <FormField htmlFor="payment_deadline" label="Exact deadline">
                <FormInput
                  id="payment_deadline"
                  onChange={(event) => setDeadlineLocal(event.target.value)}
                  type="datetime-local"
                  value={deadlineLocal}
                />
              </FormField>
              <p className="text-skyline text-xs">
                Changing this deadline does not cancel the order if it passes.
              </p>
              <button
                className="text-skyline hover:text-ink text-sm font-medium"
                onClick={() => setAdjustDeadline(false)}
                type="button"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </section>

      <pre className="border-fog text-ink overflow-x-auto whitespace-pre-wrap rounded-xl border bg-white p-4 text-sm leading-relaxed">
        {message}
      </pre>

      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <button
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium"
          onClick={handleOpenWhatsApp}
          type="button"
        >
          Open WhatsApp
        </button>
        <button
          className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          onClick={handleCopy}
          type="button"
        >
          {copied ? "Copied" : "Copy Message"}
        </button>
        {canMarkSent ? (
          <button
            className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={handleMarkSent}
            type="button"
          >
            {pending
              ? "Saving…"
              : isOutstandingBalanceRequest
                ? "Mark Outstanding Balance Request as Sent"
                : "Mark Payment Request as Sent"}
          </button>
        ) : null}
        <p className="text-skyline text-xs">
          {canMarkSent
            ? isOutstandingBalanceRequest
              ? "Open WhatsApp and Copy never change order status. Mark as Sent records this outstanding-balance follow-up and sets/updates the payment hold."
              : "Open WhatsApp and Copy never change order status. Only Mark as Sent records that the request was sent and starts the payment hold."
            : "Open WhatsApp or Copy to send alternative instructions (e.g. Online Transfer). This does not create a payment, mark Paid, or reset the payment hold."}
        </p>
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-10 items-center justify-center text-sm font-medium"
          href={workspaceHref}
        >
          Back
        </Link>
      </div>
    </div>
  );
}
