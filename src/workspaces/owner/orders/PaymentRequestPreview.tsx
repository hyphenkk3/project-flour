"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  defaultPaymentDeadlineAt,
  isWholecakePreorderPaymentContext,
  PAYMENT_METHOD_LABELS,
  WHOLECAKE_PREORDER_PAYMENT_QR_LABEL,
  WHOLECAKE_PREORDER_PAYMENT_QR_SCOPE,
  WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
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
  shouldPropagateOwnerReturnTo,
} from "@/workspaces/owner/navigation/return-to";
import {
  copyPaymentMessageWithQr,
  copyPaymentMessageWithQrError,
} from "@/workspaces/owner/orders/copy-payment-message-with-qr";
import {
  fetchPaymentQrFile,
  sharePaymentMessageWithQr,
  sharePaymentMessageWithQrError,
} from "@/workspaces/owner/orders/share-payment-message-with-qr";

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
  const [copiedMessageAndQr, setCopiedMessageAndQr] = useState(false);
  const [copyingMessageAndQr, setCopyingMessageAndQr] = useState(false);
  const [paymentShared, setPaymentShared] = useState(false);
  const [sharingPayment, setSharingPayment] = useState(false);
  const qrFileRef = useRef<File | null>(null);
  const [preparedLogged, setPreparedLogged] = useState(false);
  const [method, setMethod] = useState<PaymentRequestMethod>("wb_qr");
  const back = resolveOwnerReturnTo(returnTo);
  const workspaceHref = ownerOrderWorkspaceHref(
    order.id,
    shouldPropagateOwnerReturnTo(back) ? back.href : null,
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

  const wholecakePreorderQr = isWholecakePreorderPaymentContext({
    extraStockId: order.extraStockId,
    fulfilmentMethod: order.fulfilmentMethod,
  });

  const payload = buildPaymentRequestPayload({
    commercialSubtotal: settlement.subtotal,
    amountDue: settlement.amountDue,
    netReceived: settlement.netReceived,
    remainingBalance: settlement.remainingBalance,
    adjustments: effectiveAdjustments.map((row) => ({
      label: row.label,
      amount: row.amount,
      code: row.code,
      metadata: row.metadata,
      referenceNumber:
        typeof row.metadata.voucher_number === "string"
          ? row.metadata.voucher_number
          : null,
    })),
    method,
    wholecakePreorderQr,
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

  const canCopyMessageAndQr = method === "wb_qr" && wholecakePreorderQr;
  const canSharePayment = canCopyMessageAndQr;

  useEffect(() => {
    if (!canSharePayment) return;
    let cancelled = false;
    // Prefetch so Share Payment can call navigator.share in the click turn.
    // Awaiting fetch inside the click can lose Safari's user gesture.
    void fetchPaymentQrFile({ qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC }).then(
      (file) => {
        if (!cancelled && file) qrFileRef.current = file;
      },
    );
    return () => {
      cancelled = true;
    };
  }, [canSharePayment]);

  async function handleCopyMessageAndQr() {
    if (!canCopyMessageAndQr || copyingMessageAndQr) return;
    setError(null);
    setCopyingMessageAndQr(true);
    try {
      const result = await copyPaymentMessageWithQr({
        message,
        qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
      });
      if (!result.ok) {
        setError(copyPaymentMessageWithQrError(result.reason));
        return;
      }
      setCopiedMessageAndQr(true);
      window.setTimeout(() => setCopiedMessageAndQr(false), 2000);
    } catch {
      setError(copyPaymentMessageWithQrError("failed"));
    } finally {
      setCopyingMessageAndQr(false);
    }
  }

  async function handleSharePayment() {
    if (!canSharePayment || sharingPayment) return;
    setError(null);
    setSharingPayment(true);
    try {
      let qrFile = qrFileRef.current;
      if (!qrFile) {
        qrFile = await fetchPaymentQrFile({
          qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
        });
        if (!qrFile) {
          setError(sharePaymentMessageWithQrError("failed"));
          return;
        }
        qrFileRef.current = qrFile;
      }
      const result = await sharePaymentMessageWithQr({
        message,
        qrFile,
      });
      if (result.ok) {
        setPaymentShared(true);
        window.setTimeout(() => setPaymentShared(false), 2000);
        return;
      }
      if (result.reason === "cancelled") return;
      setError(sharePaymentMessageWithQrError(result.reason));
    } catch {
      setError(sharePaymentMessageWithQrError("failed"));
    } finally {
      setSharingPayment(false);
    }
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

      {method === "wb_qr" && wholecakePreorderQr ? (
        <figure className="border-fog space-y-3 rounded-xl border bg-white p-5">
          <figcaption className="text-ink text-sm font-medium">
            {WHOLECAKE_PREORDER_PAYMENT_QR_LABEL}
          </figcaption>
          <div className="bg-white p-3">
            {/* contrast-[1000%] maps a grey QR to near-black without changing the file. */}
            <Image
              alt={WHOLECAKE_PREORDER_PAYMENT_QR_LABEL}
              className="mx-auto h-auto w-56 max-w-full bg-white contrast-[1000%]"
              height={660}
              src={WHOLECAKE_PREORDER_PAYMENT_QR_SRC}
              unoptimized
              width={645}
            />
          </div>
          <p className="text-skyline text-xs leading-relaxed">
            {WHOLECAKE_PREORDER_PAYMENT_QR_SCOPE} Send this QR with the WhatsApp
            message. Opening WhatsApp does not attach the image or verify
            payment.
          </p>
        </figure>
      ) : null}

      <pre className="border-fog text-ink overflow-x-auto rounded-xl border bg-white p-4 text-sm leading-relaxed whitespace-pre-wrap">
        {message}
      </pre>

      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {canSharePayment ? (
          <button
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium disabled:opacity-60"
            disabled={sharingPayment}
            onClick={() => void handleSharePayment()}
            onPointerDown={() => {
              if (qrFileRef.current) return;
              void fetchPaymentQrFile({
                qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
              }).then((file) => {
                if (file) qrFileRef.current = file;
              });
            }}
            type="button"
          >
            {paymentShared ? "Payment shared" : "Share Payment"}
          </button>
        ) : null}
        {canCopyMessageAndQr ? (
          <button
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium disabled:opacity-60"
            disabled={copyingMessageAndQr}
            onClick={() => void handleCopyMessageAndQr()}
            type="button"
          >
            {copiedMessageAndQr ? "Message + QR copied" : "Copy Message + QR"}
          </button>
        ) : null}
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
