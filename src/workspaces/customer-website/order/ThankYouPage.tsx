import Link from "next/link";
import { formatCakePrice } from "@/workspaces/customer-website/browse/cake-detail-demo";
import {
  decodePreorderConfirmation,
  type PreorderConfirmation,
} from "@/workspaces/customer-website/order/order-journey-demo";

type ThankYouPageProps = {
  confirmation: PreorderConfirmation | null;
  journeyActive?: boolean;
};

export function ThankYouPage({
  confirmation,
  journeyActive = false,
}: ThankYouPageProps) {
  if (!confirmation) {
    return (
      <main className="bg-mist min-h-dvh px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-lg space-y-4">
          <h1 className="font-display text-ink text-3xl tracking-tight">
            No preorder found
          </h1>
          <p className="text-skyline text-base leading-relaxed">
            Start from Browse Cakes to complete a celebration request.
          </p>
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
            href="/browse"
          >
            Browse Cakes
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-mist min-h-dvh">
      <div className="mx-auto w-full max-w-2xl px-6 pt-12 pb-24 sm:px-10 sm:pt-16 sm:pb-28">
        <p className="text-signal text-sm font-medium tracking-[0.18em] uppercase">
          Thank you
        </p>
        <h1 className="font-display text-ink mt-3 text-4xl tracking-tight sm:text-5xl">
          Your celebration request is in.
        </h1>
        <p className="text-skyline mt-4 text-base leading-relaxed sm:text-lg">
          We&apos;ve received your preorder request for{" "}
          <span className="text-ink font-medium">{confirmation.cakeName}</span>.
          This is a mock confirmation — no payment was taken.
        </p>

        <section className="border-fog mt-10 space-y-5 rounded-3xl border bg-white p-5 sm:p-7">
          <div>
            <p className="text-skyline text-xs font-medium tracking-wide uppercase">
              Reference
            </p>
            <p className="font-display text-ink mt-1 text-2xl tracking-tight">
              {confirmation.reference}
            </p>
          </div>

          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Cake</dt>
              <dd className="text-ink text-right font-medium">
                {confirmation.cakeName}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Size</dt>
              <dd className="text-ink text-right font-medium">
                {confirmation.sizeLabel} · {confirmation.serves}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Collection</dt>
              <dd className="text-ink text-right font-medium">
                {confirmation.collectionMethodLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">When</dt>
              <dd className="text-ink text-right font-medium">
                {confirmation.dateLabel} · {confirmation.timeLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Contact</dt>
              <dd className="text-ink text-right font-medium">
                {confirmation.customerName}
                <br />
                {confirmation.customerPhone}
                {confirmation.customerEmail ? (
                  <>
                    <br />
                    {confirmation.customerEmail}
                  </>
                ) : null}
              </dd>
            </div>
            <div className="border-fog flex justify-between gap-4 border-t pt-4">
              <dt className="text-skyline">Total</dt>
              <dd className="font-display text-ink text-2xl tracking-tight">
                {formatCakePrice(confirmation.priceRm)}
              </dd>
            </div>
          </dl>
        </section>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          {journeyActive ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href="/preview/customer-operations/orders/amy?step=submitted"
            >
              Continue to Customer Operations →
            </Link>
          ) : (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href="/"
            >
              Back to Whitebird
            </Link>
          )}
          <Link
            className="border-fog text-ink hover:border-signal inline-flex min-h-12 items-center justify-center rounded-xl border bg-white px-5 text-sm font-medium transition"
            href="/browse"
          >
            Browse more cakes
          </Link>
        </div>
      </div>
    </main>
  );
}

export function confirmationFromSearchParam(
  encoded: string | undefined,
): PreorderConfirmation | null {
  if (!encoded) {
    return null;
  }
  return decodePreorderConfirmation(encoded);
}
