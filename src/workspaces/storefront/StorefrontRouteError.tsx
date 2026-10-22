"use client";

import Link from "next/link";

type StorefrontRouteErrorProps = {
  title: string;
  unstable_retry: () => void;
};

export function StorefrontRouteError({
  title,
  unstable_retry,
}: StorefrontRouteErrorProps) {
  function retry() {
    const url = new URL(window.location.href);
    if (url.searchParams.has("__catalogue_failure")) {
      url.searchParams.delete("__catalogue_failure");
      window.location.assign(url.toString());
      return;
    }
    unstable_retry();
  }

  return (
    <main
      aria-live="polite"
      className="bg-paper mx-auto flex min-h-[55vh] max-w-3xl flex-col justify-center px-5 py-12 sm:px-8"
      role="alert"
    >
      <p className="text-skyline text-xs font-medium tracking-[0.18em] uppercase">
        Whitebird
      </p>
      <h1 className="font-display text-ink mt-3 text-3xl tracking-tight">
        {title} is temporarily unavailable
      </h1>
      <p className="text-skyline mt-3 max-w-xl leading-relaxed">
        We couldn’t load this page just now. Your order details have not been
        changed. Please try again.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="bg-ink text-mist hover:bg-skyline min-h-11 rounded-md px-5 text-sm font-medium"
          onClick={retry}
          type="button"
        >
          Try again
        </button>
        <Link
          className="border-ink text-ink hover:bg-fog inline-flex min-h-11 items-center rounded-md border px-5 text-sm font-medium"
          href="/"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
