import type { CalendarEntry } from "@/workspaces/owner/calendar/types";
import {
  CALENDAR_FULFILMENT_DELIVERY_BG_CLASS,
  calendarFulfilmentBackgroundClass,
} from "@/workspaces/owner/calendar/calendar-fulfilment-presentation";
import { guestOrderStatusTextClass } from "@/workspaces/owner/orders/labels";

export function CalendarGuide() {
  return (
    <aside
      aria-label="Calendar guide"
      className="border-line/70 text-skyline rounded-lg border px-4 py-3 text-xs leading-relaxed"
    >
      <p className="text-ink mb-2 text-[11px] font-semibold tracking-wide uppercase">
        Guide
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
        <div className="space-y-1">
          <p className="text-ink/80 font-medium">Status colour (customer name)</p>
          <ul className="space-y-0.5">
            <li>
              <span className={guestOrderStatusTextClass("submitted")}>
                Submitted
              </span>
            </li>
            <li>
              <span className={guestOrderStatusTextClass("pending_confirmation")}>
                Waiting Customer Confirmation
              </span>
            </li>
            <li>
              <span className={guestOrderStatusTextClass("awaiting_payment")}>
                Awaiting Payment
              </span>
            </li>
            <li>
              <span className={guestOrderStatusTextClass("paid")}>Paid</span>
            </li>
          </ul>
        </div>
        <div className="space-y-1">
          <p className="text-ink/80 font-medium">Fulfilment background</p>
          <ul className="space-y-0.5">
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className={[
                  CALENDAR_FULFILMENT_DELIVERY_BG_CLASS,
                  "border-line/40 inline-block h-3 w-5 shrink-0 rounded-sm border",
                ].join(" ")}
              />
              <span>Delivery</span>
            </li>
            <li>
              <span className="text-ink/70">Pickup</span>
              {" = default (no fill)"}
            </li>
          </ul>
        </div>
        <div className="space-y-1">
          <p className="text-ink/80 font-medium">Notation</p>
          <ul className="space-y-0.5">
            <li>
              <span className="text-ink/80 font-medium">Pickup:</span>
              {" "}
              <span className="text-ink">●</span>
              {" = Ready · "}
              <span className="text-ink">✓</span>
              {" = Picked Up"}
            </li>
            <li>
              <span className="text-ink/80 font-medium">Delivery:</span>
              {" "}
              <span className="text-ink">●</span>
              {" = Ready · "}
              <span className="text-ink">○</span>
              {" = Out for Delivery · "}
              <span className="text-ink">✓</span>
              {" = Delivered"}
            </li>
            <li>
              <span className="text-ink font-bold">Bold</span>
              {" = Needs attention"}
            </li>
            <li>
              <span className="text-ink line-through">Strikethrough</span>
              {" = RM10 Discount Card redeemed"}
            </li>
          </ul>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Status colour = order/payment state. Soft background = fulfilment method.
        Same status colours as Operations. Tap a line to open Quick View.
      </p>
    </aside>
  );
}

/** Status / attention / RM10 signals apply to the customer identity only. */
export function calendarCustomerSignalClass(entry: CalendarEntry): string {
  const parts = [guestOrderStatusTextClass(entry.status)];
  if (entry.needsBakeryAttention) {
    parts.push("font-bold");
  }
  if (entry.hasEffectiveRm10) {
    parts.push("line-through");
  }
  return parts.join(" ");
}

/** Status signals + fulfilment background for Calendar identity lines. */
export function calendarCustomerLineClass(entry: CalendarEntry): string {
  return [
    calendarCustomerSignalClass(entry),
    calendarFulfilmentBackgroundClass(entry.fulfilmentMethod),
  ]
    .filter(Boolean)
    .join(" ");
}
