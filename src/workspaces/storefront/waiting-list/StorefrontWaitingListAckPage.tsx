import Link from "next/link";
import { formatShortBusinessDate } from "@/lib/dates";
import {
  WAITING_LIST_ACK_CONTACT,
  WAITING_LIST_ACK_TITLE,
  WAITING_LIST_REQUEST_NOT_ORDER,
} from "@/engines/waiting-list/phone";
import { cancelGuestWaitingListAction } from "@/workspaces/storefront/waiting-list/actions";
import { getGuestWaitingListAck } from "@/workspaces/storefront/waiting-list/queries";

type StorefrontWaitingListAckPageProps = {
  requestId?: string;
};

export async function StorefrontWaitingListAckPage({
  requestId,
}: StorefrontWaitingListAckPageProps) {
  const ack = requestId ? await getGuestWaitingListAck(requestId) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-ink text-3xl tracking-tight">
          {WAITING_LIST_ACK_TITLE}
        </h1>
        <p className="text-skyline mt-4 text-base leading-relaxed">
          {WAITING_LIST_REQUEST_NOT_ORDER}
          <br />
          {WAITING_LIST_ACK_CONTACT}
        </p>
      </div>

      {ack ? (
        <section className="border-fog mt-8 rounded-xl border bg-white px-5 py-4 text-left">
          <p className="text-skyline text-[11px] font-semibold tracking-[0.14em] uppercase">
            Waiting-list request
          </p>
          <ul className="mt-3 space-y-2">
            {ack.items.map((item) => (
              <li className="text-ink text-sm" key={item.id}>
                <span className="font-medium">{item.cakeName}</span>
                <span className="text-skyline">
                  {" "}
                  · {item.sizeLabel} × {item.quantity}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink mt-4 text-sm">
            Collection date · {formatShortBusinessDate(ack.pickupDate)}
          </p>
          {ack.items.some(
            (item) =>
              item.status === "active" ||
              item.status === "partially_accepted" ||
              item.status === "contacted",
          ) ? (
            <form action={cancelGuestWaitingListAction} className="mt-4">
              <input name="request_id" type="hidden" value={ack.id} />
              <input name="phone" type="hidden" value={ack.guestPhone} />
              <button
                className="text-skyline text-sm underline"
                type="submit"
              >
                Cancel this request
              </button>
            </form>
          ) : (
            <p className="text-skyline mt-4 text-sm">This request is closed.</p>
          )}
        </section>
      ) : null}

      <div className="mt-10 text-center">
        <Link className="text-signal text-sm font-medium underline" href="/order">
          Back to Order
        </Link>
      </div>
    </main>
  );
}
