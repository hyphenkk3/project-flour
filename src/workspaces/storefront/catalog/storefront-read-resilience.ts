export type StorefrontReadResult<T> =
  { ok: true; value: T } | { ok: false; error: unknown };

export async function settleStorefrontRead<T>(
  read: () => Promise<T>,
): Promise<StorefrontReadResult<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return { ok: false, error };
  }
}

export type LiveReadWithDisplayFallback<T> = {
  value: T | null;
  source: "live" | "display_fallback" | "unavailable";
};

/**
 * Uses cached display data only after the live, authoritative read fails.
 * The fallback mapper must remove prices and orderability before returning a
 * customer-facing value. A successful live `null` remains a real not-found.
 */
export async function resolveLiveReadWithDisplayFallback<TLive, TDisplay>(
  liveRead: Promise<TLive | null>,
  displayRead: Promise<TDisplay | null>,
  toDisplayFallback: (display: TDisplay) => TLive | null,
): Promise<LiveReadWithDisplayFallback<TLive>> {
  try {
    return { value: await liveRead, source: "live" };
  } catch {
    try {
      const display = await displayRead;
      const value = display == null ? null : toDisplayFallback(display);
      return {
        value,
        source: value == null ? "unavailable" : "display_fallback",
      };
    } catch {
      return { value: null, source: "unavailable" };
    }
  }
}

export type StorefrontReadFailureKind =
  "timeout" | "network" | "database" | "unknown";

export function classifyStorefrontReadFailure(
  error: unknown,
): StorefrontReadFailureKind {
  const candidate =
    error && typeof error === "object"
      ? (error as { code?: unknown; name?: unknown; message?: unknown })
      : null;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const message =
    typeof candidate?.message === "string"
      ? candidate.message
      : typeof error === "string"
        ? error
        : "";
  const detail = `${code} ${name} ${message}`.toLowerCase();

  if (
    code === "57014" ||
    /57014|statement timeout|timed? out|timeout|aborterror|aborted/.test(detail)
  ) {
    return "timeout";
  }
  if (
    /fetch failed|network|econn|enotfound|socket|connection reset/.test(detail)
  ) {
    return "network";
  }
  if (code || message) return "database";
  return "unknown";
}

export function storefrontReadFailureMessage(
  error: unknown,
  subject: string,
): string {
  switch (classifyStorefrontReadFailure(error)) {
    case "timeout":
      return `The latest ${subject} check timed out. We have not treated this as an empty result or confirmed availability. Please try again.`;
    case "network":
      return `We could not reach the service for the latest ${subject}. We have not treated this as an empty result or confirmed availability. Please try again.`;
    case "database":
      return `The database could not confirm the latest ${subject}. We have not treated this as an empty result or confirmed availability. Please try again.`;
    default:
      return `We could not confirm the latest ${subject}. No empty result or availability has been assumed. Please try again.`;
  }
}
