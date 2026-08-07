import Link from "next/link";
import { formatDdMmYyyy } from "@/lib/dates";
import { ClearPreorderDraftOnSuccess } from "@/workspaces/storefront/checkout/ClearPreorderDraft";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { getGuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

type StorefrontSuccessPageProps = {
  orderId?: string;
};

export async function StorefrontSuccessPage({
  orderId,
}: StorefrontSuccessPageProps) {
  const receipt = orderId ? await getGuestPreorderReceipt(orderId) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16 sm:px-6">
      <ClearPreorderDraftOnSuccess />
      <div className="text-center">
        <h1 className="font-display text-ink text-3xl tracking-tight">
          Thank you.
        </h1>
        <p className="text-skyline mt-4 text-base leading-relaxed">
          Your preorder has been received.
          <br />
          We&apos;ll be in touch to confirm your order details before payment.
        </p>
      </div>

      {receipt ? (
        <section className="border-fog mt-8 rounded-xl border bg-white px-5 py-4 text-left">
          <p className="text-skyline text-[11px] font-semibold tracking-[0.14em] uppercase">
            Order recap
          </p>
          <ul className="mt-3 space-y-2">
            {receipt.items.map((item) => (
              <li className="text-ink text-sm" key={item.key}>
                <span className="font-medium">{item.cakeName}</span>
                <span className="text-skyline">
                  {" "}
                  · {item.sizeLabel} × {item.quantity}
                  {item.unitPrice != null
                    ? ` · ${formatRm(item.unitPrice * item.quantity)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-fog pt-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Pickup date</dt>
              <dd className="text-ink text-right font-medium">
                {formatDdMmYyyy(receipt.pickupDate)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Pickup time</dt>
              <dd className="text-ink text-right font-medium">
                {formatPickupTime(receipt.pickupTime)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Total</dt>
              <dd className="text-ink text-right font-semibold">
                {formatRm(receipt.total)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="mt-8 space-y-2 text-left text-sm">
        <p className="text-ink flex items-start gap-2 font-medium">
          <span aria-hidden className="text-status-success">
            ✓
          </span>
          Preorder submitted
        </p>
        <p className="text-skyline flex items-start gap-2 pl-5">
          Confirmation next
        </p>
        <p className="text-skyline flex items-start gap-2 pl-5">Payment later</p>
      </section>

      <div className="mt-10 text-center">
        <Link className="text-signal text-sm font-medium underline" href="/">
          Back to collection
        </Link>
      </div>
    </main>
  );
}
