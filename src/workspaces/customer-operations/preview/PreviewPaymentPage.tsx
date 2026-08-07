import Link from "next/link";
import { PreviewChrome } from "@/workspaces/customer-operations/preview/PreviewChrome";
import {
  previewOrderHref,
  type PreviewOrder,
} from "@/workspaces/customer-operations/preview/preview-demo";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";

type PreviewPaymentPageProps = {
  order: PreviewOrder;
  journeyStep?: JourneyStep | null;
};

export function PreviewPaymentPage({
  order,
  journeyStep = null,
}: PreviewPaymentPageProps) {
  return (
    <PreviewChrome heroState="confirmed" journeyStep={journeyStep}>
      <main className="mx-auto w-full max-w-2xl px-5 py-8 pb-20 sm:px-8 sm:py-12">
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
          href={previewOrderHref(order.id, "confirmed", journeyStep)}
        >
          ← Back to {order.customerName}
        </Link>

        <header className="mt-6 max-w-xl">
          <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
            Payment request preview
          </p>
          <h1 className="font-display text-ink mt-2 text-4xl tracking-tight">
            Preview before sending
          </h1>
          <p className="text-skyline mt-3 text-base leading-relaxed sm:text-lg">
            This is the payment request for {order.customerName}. It is not
            WhatsApp — review only.
          </p>
        </header>

        <section className="border-fog mt-8 rounded-3xl border bg-white p-5 sm:p-8">
          <pre className="text-ink font-sans text-[15px] leading-8 whitespace-pre-wrap">
            {order.paymentMessage}
          </pre>
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="border-fog text-ink hover:border-signal inline-flex min-h-12 items-center justify-center rounded-xl border bg-white px-5 text-sm font-medium transition"
            href={previewOrderHref(order.id, "confirmed", journeyStep)}
          >
            Back
          </Link>
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
            href={
              journeyStep
                ? `/preview/customer-operations/orders/${order.id}?step=payment_requested`
                : `/preview/customer-operations/orders/${order.id}?payment=${order.id}`
            }
          >
            Mark as Sent
          </Link>
        </div>
      </main>
    </PreviewChrome>
  );
}
