/**
 * Route-level checkout shell. Static JSX only — no data, cookies, or images.
 * Mirrors StorefrontCheckoutPage / GuestCheckoutForm layout so the page
 * does not jump when the dynamic render arrives.
 */
export function StorefrontCheckoutLoading() {
  return (
    <main
      aria-busy="true"
      className="bg-paper mx-auto min-h-screen max-w-5xl px-5 py-10 sm:px-6"
    >
      <p className="sr-only" role="status">
        Opening order
      </p>
      <p className="text-skyline text-sm font-medium">← Whitebird</p>
      <p className="text-skyline mt-8 max-w-xl text-[0.95rem] leading-relaxed">
        Opening order
      </p>
      <div className="mt-10 flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_20.5rem] lg:items-start lg:gap-x-16 lg:gap-y-0">
        <div className="order-2 flex min-w-0 flex-col gap-12 lg:order-1">
          <section className="space-y-5">
            <h2 className="font-display text-ink text-2xl tracking-tight sm:text-[1.75rem]">
              Collection Date
            </h2>
            <div
              aria-hidden
              className="bg-fog h-10 w-48 rounded-sm sm:h-12"
            />
            <div aria-hidden className="bg-fog mt-3 h-4 w-64 rounded-sm" />
            <div
              aria-hidden
              className="border-fog bg-fog/40 mt-3 h-12 w-full max-w-sm border"
            />
          </section>

          <section className="space-y-5">
            <h2 className="font-display text-ink text-2xl tracking-tight sm:text-[1.75rem]">
              Fulfilment
            </h2>
            <div aria-hidden className="bg-fog h-4 w-full max-w-xl rounded-sm" />
            <div className="flex flex-wrap gap-2">
              <div
                aria-hidden
                className="border-fog bg-fog/40 min-h-12 w-24 border"
              />
              <div
                aria-hidden
                className="border-fog bg-fog/40 min-h-12 w-24 border"
              />
              <div
                aria-hidden
                className="border-fog bg-fog/40 min-h-12 w-24 border"
              />
            </div>
          </section>

          <section className="space-y-5">
            <h2 className="font-display text-ink text-2xl tracking-tight sm:text-[1.75rem]">
              Customer Details
            </h2>
            <div
              aria-hidden
              className="border-fog bg-fog/40 h-12 w-full max-w-lg border"
            />
            <div
              aria-hidden
              className="border-fog bg-fog/40 h-12 w-full max-w-lg border"
            />
          </section>

          <div
            aria-hidden
            className="bg-fog h-12 w-full rounded-md sm:w-40"
          />
        </div>

        <aside className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-8">
          <p className="text-signal text-[11px] font-medium tracking-[0.22em] uppercase">
            Whitebird
          </p>
          <h1 className="font-display text-ink mt-2 text-3xl tracking-tight">
            Your Order
          </h1>
          <div className="mt-6 space-y-4">
            <div aria-hidden className="bg-fog h-4 w-40 rounded-sm" />
            <div
              aria-hidden
              className="border-fog divide-fog divide-y border-t"
            >
              <div className="py-4">
                <div aria-hidden className="bg-fog h-4 w-32 rounded-sm" />
                <div
                  aria-hidden
                  className="bg-fog mt-3 h-12 w-full rounded-lg"
                />
              </div>
              <div className="py-4">
                <div aria-hidden className="bg-fog h-4 w-28 rounded-sm" />
                <div
                  aria-hidden
                  className="bg-fog mt-3 h-12 w-full rounded-lg"
                />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
