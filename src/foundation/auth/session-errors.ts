/**
 * Auth verification can fail without the stored session being invalid.
 * Keep network/timeout failures distinct from a confirmed signed-out result.
 */
export class StaffSessionVerificationUnavailable extends Error {
  constructor() {
    super("Staff session verification is temporarily unavailable.");
    this.name = "StaffSessionVerificationUnavailable";
  }
}

export function isTransientSessionVerificationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    code?: unknown;
    cause?: unknown;
  };
  const status = Number(candidate.status);
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";

  if (
    name === "AuthRetryableFetchError" ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  ) {
    return true;
  }

  if (
    /abort|timeout|fetch failed|failed to fetch|network|connection reset|temporarily unavailable/i.test(
      message,
    )
  ) {
    return true;
  }

  return candidate.cause !== error
    ? isTransientSessionVerificationError(candidate.cause)
    : false;
}

export function classifySessionVerification(
  userPresent: boolean,
  error: unknown,
): "authenticated" | "signed_out" | "temporarily_unavailable" {
  if (userPresent) return "authenticated";
  if (!error) return "signed_out";
  return isTransientSessionVerificationError(error)
    ? "temporarily_unavailable"
    : "signed_out";
}
