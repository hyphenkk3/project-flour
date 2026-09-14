/**
 * Route-level storefront shell. Static JSX only — no data, cookies, or images.
 */
export function StorefrontRouteLoading({
  title,
}: {
  title: string;
}) {
  return (
    <main
      aria-busy="true"
      className="bg-paper mx-auto min-h-screen max-w-5xl px-5 py-4 sm:px-6 sm:py-10"
    >
      <p className="sr-only" role="status">
        {title}
      </p>
      <p className="text-skyline text-sm font-medium">← Whitebird</p>
      <div aria-hidden className="bg-fog mt-8 h-8 w-48 rounded-sm" />
      <div aria-hidden className="bg-fog mt-3 h-4 w-full max-w-xl rounded-sm" />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-fog aspect-[4/3] rounded-[10px]" />
        <div className="bg-fog aspect-[4/3] rounded-[10px]" />
        <div className="bg-fog aspect-[4/3] rounded-[10px]" />
      </div>
    </main>
  );
}
