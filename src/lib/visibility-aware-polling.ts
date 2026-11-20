export type VisibilityDocumentTarget = {
  visibilityState?: string;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (
    type: "visibilitychange",
    listener: () => void,
  ) => void;
};

export type VisibilityTimerTarget = {
  setInterval: (callback: () => void, intervalMs: number) => number;
  clearInterval: (intervalId: number) => void;
  setTimeout: (callback: () => void, delayMs: number) => number;
  clearTimeout: (timeoutId: number) => void;
};

export type VisibilityPollingHandle = {
  dispose: () => void;
  noteRealtimeEvent: () => void;
  runRealtimeRefreshImmediately: (
    refresh: () => void,
    cancelPendingRefresh: () => void,
  ) => void;
};

type VisibilityPollingOptions = {
  intervalMs: number;
  poll: () => void;
  onVisible: () => void;
  documentTarget?: VisibilityDocumentTarget | null;
  timerTarget?: VisibilityTimerTarget | null;
  now?: () => number;
  realtimeCoalesceMs?: number;
};

/**
 * Keeps a fallback poll active only while its document is visible. Realtime
 * subscriptions remain independent. noteRealtimeEvent coalesces a fallback
 * poll with a Realtime event delivered at the same interval boundary, while
 * runRealtimeRefreshImmediately preserves event-driven refresh timing.
 */
export function startVisibilityAwarePolling({
  intervalMs,
  poll,
  onVisible,
  documentTarget = typeof document === "undefined" ? null : document,
  timerTarget = typeof window === "undefined" ? null : window,
  now = Date.now,
  realtimeCoalesceMs = 120,
}: VisibilityPollingOptions): VisibilityPollingHandle {
  if (!timerTarget) {
    return {
      dispose: () => {},
      noteRealtimeEvent: () => {},
      runRealtimeRefreshImmediately: (refresh) => refresh(),
    };
  }
  const timers = timerTarget;

  const supportsVisibility =
    documentTarget !== null &&
    typeof documentTarget.visibilityState === "string" &&
    typeof documentTarget.addEventListener === "function" &&
    typeof documentTarget.removeEventListener === "function";
  let disposed = false;
  let intervalId: number | null = null;
  let pollTimeoutId: number | null = null;
  let lastRealtimeAt = Number.NEGATIVE_INFINITY;
  let wasVisible =
    !supportsVisibility || documentTarget?.visibilityState === "visible";

  const isVisible = () =>
    !supportsVisibility || documentTarget?.visibilityState === "visible";

  function stopInterval() {
    if (intervalId !== null) {
      timers.clearInterval(intervalId);
      intervalId = null;
    }
    if (pollTimeoutId !== null) {
      timers.clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }
  }

  function pollIfVisible() {
    if (disposed || !isVisible()) return;
    if (now() - lastRealtimeAt < realtimeCoalesceMs) return;
    if (!supportsVisibility) {
      poll();
      return;
    }

    pollTimeoutId = timers.setTimeout(() => {
      pollTimeoutId = null;
      if (disposed || !isVisible()) return;
      if (now() - lastRealtimeAt < realtimeCoalesceMs) return;
      poll();
    }, realtimeCoalesceMs);
  }

  function startInterval() {
    if (disposed || intervalId !== null || !isVisible()) return;
    intervalId = timers.setInterval(pollIfVisible, intervalMs);
  }

  function onVisibilityChange() {
    if (!isVisible()) {
      wasVisible = false;
      stopInterval();
      return;
    }

    startInterval();
    if (!wasVisible) {
      wasVisible = true;
      onVisible();
    }
  }

  function runRealtimeRefreshImmediately(
    refresh: () => void,
    cancelPendingRefresh: () => void,
  ) {
    if (disposed) return;
    lastRealtimeAt = now();
    if (pollTimeoutId !== null) {
      timers.clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }
    cancelPendingRefresh();
    refresh();
  }

  if (supportsVisibility) {
    documentTarget.addEventListener("visibilitychange", onVisibilityChange);
  }
  startInterval();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      stopInterval();
      if (supportsVisibility) {
        documentTarget.removeEventListener(
          "visibilitychange",
          onVisibilityChange,
        );
      }
    },
    noteRealtimeEvent() {
      lastRealtimeAt = now();
    },
    runRealtimeRefreshImmediately,
  };
}
