/**
 * Route-level Order Received shell. Static JSX only — no data, cookies,
 * photos, or totals. Shown after a successful submit navigation while the
 * authoritative receipt streams in. Does not appear if submit fails.
 */
import {
  ORDER_DETAILS_CARD_CONTACT,
  ORDER_DETAILS_CARD_PAYMENT,
  ORDER_DETAILS_NOTICE_BODY,
  ORDER_DETAILS_NOTICE_MARK,
  ORDER_DETAILS_NOTICE_TITLE,
} from "@/workspaces/storefront/checkout/order-details-card";

export function StorefrontSuccessRecapSkeleton() {
  return (
    <div aria-hidden className="border-fog mt-8 border-t pt-8">
      <div className="bg-fog h-3 w-24 rounded-sm" />
      <div className="mt-3 flex items-start gap-3">
        <div className="bg-fog/40 h-16 w-16 shrink-0 rounded-[10px] sm:h-[4.5rem] sm:w-[4.5rem]" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="bg-fog h-4 w-40 rounded-sm" />
          <div className="bg-fog h-4 w-28 rounded-sm" />
        </div>
      </div>
      <div className="border-fog mt-4 space-y-3 border-t pt-3">
        <div className="bg-fog h-4 w-full rounded-sm" />
        <div className="bg-fog h-4 w-5/6 rounded-sm" />
        <div className="bg-fog h-4 w-2/3 rounded-sm" />
        <div className="bg-fog mt-2 h-7 w-24 rounded-sm" />
      </div>
    </div>
  );
}

export function StorefrontSuccessLoading() {
  const noticeMarkAt = ORDER_DETAILS_NOTICE_BODY.indexOf(
    ORDER_DETAILS_NOTICE_MARK,
  );

  return (
    <main
      aria-busy="true"
      className="bg-paper mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16 sm:px-6"
    >
      <p className="sr-only" role="status">
        Loading your order details
      </p>
      <div className="text-center">
        <p className="text-signal text-[11px] font-medium tracking-[0.22em] uppercase">
          Whitebird
        </p>
        <h1 className="font-display text-ink mt-3 text-3xl tracking-tight sm:text-4xl">
          Order Received
        </h1>
        <p className="text-skyline mt-4 text-base leading-relaxed">
          {ORDER_DETAILS_CARD_PAYMENT}
          <br />
          {ORDER_DETAILS_CARD_CONTACT}
        </p>
      </div>

      <aside
        aria-label={ORDER_DETAILS_NOTICE_TITLE}
        className="border-fog mt-8 rounded-xl border bg-white px-4 py-3.5 text-left sm:px-5 sm:py-4"
      >
        <p className="text-signal text-[11px] font-semibold tracking-[0.16em] uppercase">
          {ORDER_DETAILS_NOTICE_TITLE}
        </p>
        <p className="text-skyline mt-2 text-sm leading-relaxed sm:text-[15px]">
          {noticeMarkAt >= 0 ? (
            <>
              {ORDER_DETAILS_NOTICE_BODY.slice(0, noticeMarkAt)}
              <span className="text-ink font-semibold">
                {ORDER_DETAILS_NOTICE_MARK}
              </span>
              {ORDER_DETAILS_NOTICE_BODY.slice(
                noticeMarkAt + ORDER_DETAILS_NOTICE_MARK.length,
              )}
            </>
          ) : (
            ORDER_DETAILS_NOTICE_BODY
          )}
        </p>
      </aside>

      <StorefrontSuccessRecapSkeleton />
    </main>
  );
}
