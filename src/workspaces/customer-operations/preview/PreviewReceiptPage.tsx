import Link from "next/link";
import { PreviewChrome } from "@/workspaces/customer-operations/preview/PreviewChrome";
import {
  AMY_PAYMENT_RECEIPT,
  formatPreviewPrice,
  previewOrderHref,
  type PreviewOrder,
} from "@/workspaces/customer-operations/preview/preview-demo";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";

type PreviewReceiptPageProps = {
  order: PreviewOrder;
  journeyStep?: JourneyStep | null;
};

export function PreviewReceiptPage({
  order,
  journeyStep = null,
}: PreviewReceiptPageProps) {
  const payment = order.payment;
  const receipt = AMY_PAYMENT_RECEIPT;
  const amountMatches = Boolean(
    payment && receipt.amount === payment.amountPayable,
  );

  return (
    <PreviewChrome heroState="receipt_submitted" journeyStep={journeyStep}>
      <main className="mx-auto w-full max-w-2xl px-5 py-8 pb-20 sm:px-8 sm:py-12">
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
          href={previewOrderHref(order.id, "receipt_submitted", journeyStep)}
        >
          ← Back to {order.customerName}
        </Link>

        <header className="mt-6 max-w-xl">
          <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
            Payment verification
          </p>
          <h1 className="font-display text-ink mt-2 text-4xl tracking-tight">
            Review receipt
          </h1>
          <p className="text-skyline mt-3 text-base leading-relaxed sm:text-lg">
            {order.customerName} sent a payment receipt. Check the amount, then
            verify payment. This is not a live bank screen.
          </p>
        </header>

        <section className="border-fog mt-8 rounded-3xl border bg-white p-5 sm:p-8">
          <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
            Receipt
          </h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-skyline">Method</dt>
              <dd className="text-ink font-medium">{receipt.methodLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-skyline">Reference</dt>
              <dd className="text-ink font-medium">{receipt.reference}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-skyline">From</dt>
              <dd className="text-ink text-right font-medium">
                {receipt.payerNote}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-skyline">Submitted</dt>
              <dd className="text-ink font-medium">
                {receipt.submittedAtLabel}
              </dd>
            </div>
            <div className="border-fog flex items-end justify-between gap-3 border-t pt-4">
              <dt className="text-skyline text-sm">Receipt amount</dt>
              <dd className="font-display text-ink text-3xl tracking-tight">
                {formatPreviewPrice(receipt.amount)}
              </dd>
            </div>
          </dl>
        </section>

        {payment ? (
          <section className="border-fog mt-4 rounded-3xl border bg-white p-5 sm:p-8">
            <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
              Check against order
            </h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-skyline">Total Payable</dt>
                <dd className="text-ink font-medium">
                  {formatPreviewPrice(payment.amountPayable)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-skyline">Receipt amount</dt>
                <dd className="text-ink font-medium">
                  {formatPreviewPrice(receipt.amount)}
                </dd>
              </div>
              <div className="border-fog flex justify-between gap-3 border-t pt-3">
                <dt className="text-skyline">Match</dt>
                <dd className="text-ink font-medium">
                  {amountMatches ? "Yes — amounts match" : "No — check again"}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="border-fog text-ink hover:border-signal inline-flex min-h-12 items-center justify-center rounded-xl border bg-white px-5 text-sm font-medium transition"
            href={previewOrderHref(order.id, "receipt_submitted", journeyStep)}
          >
            Back
          </Link>
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
            href={
              journeyStep
                ? `/preview/customer-operations/orders/${order.id}?step=payment_verified`
                : `/preview/customer-operations/orders/${order.id}?verified=${order.id}`
            }
          >
            Verify Payment
          </Link>
        </div>
      </main>
    </PreviewChrome>
  );
}
