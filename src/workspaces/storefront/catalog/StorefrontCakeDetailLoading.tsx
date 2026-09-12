/**
 * Route-level cake-detail shell. Static JSX only — no data, cookies, or images.
 * Mirrors StorefrontCakeDetail / StorefrontCakeDetailView layout so the page
 * does not jump when the dynamic render arrives.
 */
export function StorefrontCakeDetailLoading() {
  return (
    <main
      aria-busy="true"
      className="bg-paper mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-10"
    >
      <p className="sr-only" role="status">
        Opening cake
      </p>
      <p className="text-skyline text-sm font-medium">← Whitebird</p>
      <p className="text-skyline text-sm font-medium">Opening cake</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-10">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-[10px]">
            <div
              aria-hidden
              className="bg-fog aspect-square w-full rounded-[10px]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:gap-6">
          <div>
            <div aria-hidden className="bg-fog h-3 w-20 rounded-sm" />
            <div
              aria-hidden
              className="bg-fog mt-3 h-8 w-3/4 rounded-sm sm:h-10"
            />
            <div aria-hidden className="bg-fog mt-3 h-4 w-full rounded-sm" />
            <div aria-hidden className="bg-fog mt-2 h-4 w-5/6 rounded-sm" />
          </div>

          <section className="border-fog border-t pt-5">
            <div aria-hidden className="bg-fog h-3 w-28 rounded-sm" />
            <ul className="mt-3 grid gap-2">
              <li
                aria-hidden
                className="border-fog bg-fog/40 min-h-12 w-full border"
              />
              <li
                aria-hidden
                className="border-fog bg-fog/40 min-h-12 w-full border"
              />
            </ul>
          </section>

          <div
            aria-hidden
            className="bg-fog h-11 w-full rounded-md"
          />
          <div aria-hidden className="h-20 md:hidden" />
        </div>
      </div>
    </main>
  );
}
