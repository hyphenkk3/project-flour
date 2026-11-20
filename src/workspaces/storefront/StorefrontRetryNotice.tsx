"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  useTransition,
} from "react";

let refreshPending = false;
const refreshListeners = new Set<() => void>();

function subscribeToRefreshPending(listener: () => void): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

function getRefreshPendingSnapshot(): boolean {
  return refreshPending;
}

function publishRefreshPending(pending: boolean): void {
  refreshPending = pending;
  refreshListeners.forEach((listener) => listener());
}

type StorefrontRetryNoticeProps = {
  title: string;
  message: string;
};

export function StorefrontRetryNotice({
  title,
  message,
}: StorefrontRetryNoticeProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const sharedRefreshPending = useSyncExternalStore(
    subscribeToRefreshPending,
    getRefreshPendingSnapshot,
    () => false,
  );
  const startedRefresh = useRef(false);
  const retryPending = isPending || sharedRefreshPending;

  useEffect(() => {
    if (startedRefresh.current && !isPending) {
      startedRefresh.current = false;
      publishRefreshPending(false);
    }
  }, [isPending]);

  useEffect(
    () => () => {
      if (startedRefresh.current) {
        startedRefresh.current = false;
        publishRefreshPending(false);
      }
    },
    [],
  );

  function retry(): void {
    if (refreshPending) return;
    startedRefresh.current = true;
    publishRefreshPending(true);
    startTransition(() => router.refresh());
  }

  return (
    <div
      aria-live="polite"
      className="border-skyline/20 bg-mist mt-5 rounded-[10px] border p-4"
      role="alert"
    >
      <p className="text-ink font-medium">{title}</p>
      <p className="text-skyline mt-1 text-sm leading-relaxed">{message}</p>
      <button
        aria-disabled={retryPending}
        className="text-skyline hover:text-ink mt-3 min-h-10 font-medium underline underline-offset-4"
        disabled={retryPending}
        onClick={retry}
        type="button"
      >
        {retryPending ? "Trying again…" : "Try again"}
      </button>
    </div>
  );
}
