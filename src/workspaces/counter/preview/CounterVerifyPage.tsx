import Link from "next/link";
import { CounterPackingChecklist } from "@/workspaces/counter/preview/CounterPackingChecklist";
import { CounterPreviewChrome } from "@/workspaces/counter/preview/CounterPreviewChrome";
import {
  COUNTER_COLLECTION_LABEL,
  counterOrderHref,
  counterVerifiedHref,
  type CounterOrder,
} from "@/workspaces/counter/preview/counter-preview-demo";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";

type CounterVerifyPageProps = {
  order: CounterOrder;
  journeyStep?: JourneyStep | null;
};

export function CounterVerifyPage({
  order,
  journeyStep = null,
}: CounterVerifyPageProps) {
  return (
    <CounterPreviewChrome heroState="arrived" journeyStep={journeyStep}>
      <main className="mx-auto w-full max-w-2xl px-5 py-8 pb-20 sm:px-8 sm:py-12">
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
          href={counterOrderHref(order.id, "arrived", journeyStep)}
        >
          ← Back to {order.guestLabel}
        </Link>

        <header className="mt-6 max-w-xl">
          <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
            Verify order
          </p>
          <h1 className="font-display text-ink mt-2 text-4xl tracking-tight">
            Check before handover
          </h1>
          <p className="text-skyline mt-3 text-base leading-relaxed sm:text-lg">
            Confirm the cake and packing for {order.guestLabel}. This is not a
            stock count.
          </p>
        </header>

        <section className="border-fog mt-8 rounded-2xl border bg-white p-5 sm:p-6">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-skyline">Guest</dt>
              <dd className="text-ink font-medium">{order.guestLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-skyline">Cake</dt>
              <dd className="text-ink text-right font-medium">
                {order.cakeName} · {order.cakeSize}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-skyline">Collection</dt>
              <dd className="text-ink text-right font-medium">
                {order.collectionTime} ·{" "}
                {COUNTER_COLLECTION_LABEL[order.collectionMethod]}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-skyline">Notes</dt>
              <dd className="text-ink text-right font-medium">
                {order.specialNotes ?? "None"}
              </dd>
            </div>
          </dl>
        </section>

        <div className="mt-4">
          <CounterPackingChecklist
            hint="Tick as you check. Reminder only."
            items={order.packingItems}
            title="Packing"
          />
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="border-fog text-ink hover:border-signal inline-flex min-h-12 items-center justify-center rounded-xl border bg-white px-5 text-sm font-medium transition"
            href={counterOrderHref(order.id, "arrived", journeyStep)}
          >
            Back
          </Link>
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
            href={counterVerifiedHref(order.id, journeyStep)}
          >
            Order Verified
          </Link>
        </div>
      </main>
    </CounterPreviewChrome>
  );
}
