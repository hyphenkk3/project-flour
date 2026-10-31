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
