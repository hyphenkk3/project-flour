"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Report unavailable</h1>
      <p className="mt-2 text-slate-600">
        The report could not be loaded. No records were changed.
      </p>
      <button className="mt-4 rounded-lg border px-4 py-2" onClick={reset}>
        Retry
      </button>
    </main>
  );
}
