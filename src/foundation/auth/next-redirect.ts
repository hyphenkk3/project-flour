/**
 * Next.js `redirect()` throws a special error. Catching it in UI must not be
 * treated as an application failure.
 */
export function isNextRedirectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  if ("digest" in error && typeof error.digest === "string") {
    return error.digest.startsWith("NEXT_REDIRECT");
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return message === "NEXT_REDIRECT" || message.startsWith("NEXT_REDIRECT");
}
