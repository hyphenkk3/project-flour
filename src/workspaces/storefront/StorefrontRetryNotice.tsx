"use client";

import { useRouter } from "next/navigation";

type StorefrontRetryNoticeProps = {
  title: string;
  message: string;
};

export function StorefrontRetryNotice({
  title,
  message,
}: StorefrontRetryNoticeProps) {
  const router = useRouter();

  return (
    <div
      aria-live="polite"
      className="border-skyline/20 bg-mist mt-5 rounded-[10px] border p-4"
      role="alert"
    >
      <p className="text-ink font-medium">{title}</p>
      <p className="text-skyline mt-1 text-sm leading-relaxed">{message}</p>
      <button
        className="text-skyline hover:text-ink mt-3 min-h-10 font-medium underline underline-offset-4"
        onClick={() => router.refresh()}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
