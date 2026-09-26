import Link from "next/link";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import { formatBusinessCalendarDate } from "@/lib/dates";
import type { CatalogueRedemptionEvent } from "@/workspaces/library/vouchers/queries";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "redeemed", label: "Redeemed" },
  { id: "released", label: "Released" },
] as const;

export type CatalogueHistoryFilter = (typeof FILTERS)[number]["id"];

function formatHistoryWhen(iso: string): string {
  if (!iso) return "—";
  const date = formatBusinessCalendarDate(singaporeDateFromIso(iso));
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return `${date} ${time}`;
}

function releaseLabel(reason: string | null): string {
  if (reason === "order_cancelled") return "Order cancelled";
  return reason?.trim() || "Released";
}

export function CatalogueVoucherRedemptionHistory({
  events,
  filter,
  href,
}: {
  events: CatalogueRedemptionEvent[];
  filter: CatalogueHistoryFilter;
  href: string;
}) {
  return (
    <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-ink text-sm font-semibold">Redemption history</h2>
          <p className="text-skyline mt-1 text-sm">
            Newest first. Released redemptions stay visible.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Link
              className={
                item.id === filter
                  ? "bg-ink text-mist inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium"
                  : "border-fog text-ink inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-medium"
              }
              href={item.id === "all" ? href : `${href}?history=${item.id}`}
              key={item.id}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <p className="text-skyline text-sm">No redemption events yet.</p>
      ) : (
        <ul className="divide-fog divide-y">
          {events.map((event) => (
            <li
              className="grid gap-1 py-3 sm:grid-cols-[10rem_7rem_1fr_auto] sm:items-baseline sm:gap-4"
              key={`${event.redemptionId}-${event.event}-${event.occurredAt}`}
            >
              <p className="text-ink text-sm">{formatHistoryWhen(event.occurredAt)}</p>
              <p className="text-sm">
                {event.orderId ? (
                  <Link
                    className="text-ink font-medium underline-offset-2 hover:underline"
                    href={`/owner/orders/${event.orderId}`}
                  >
                    {event.orderNumber}
                  </Link>
                ) : (
                  event.orderNumber
                )}
              </p>
              <p className="text-skyline text-sm">
                {event.guestName}
                {event.event === "released"
                  ? ` · ${releaseLabel(event.releaseReason)}`
                  : ""}
              </p>
              <p className="text-ink text-sm sm:text-right">
                {event.event === "released" ? "Released" : "Redeemed"} · RM
                {event.discountAmount}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}