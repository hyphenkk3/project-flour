"use client";

import { useRouter } from "next/navigation";

export function BrowseVoucherRetryButton() {
  const router = useRouter();

  return (
    <button
      className="border-ink text-ink hover:bg-fog inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium"
      onClick={() => router.refresh()}
      type="button"
    >
      Try offers again
    </button>
  );
}
