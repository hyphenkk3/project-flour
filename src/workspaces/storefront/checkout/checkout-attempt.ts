const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCheckoutRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function createCheckoutRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Secure checkout retry protection is unavailable.");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/** Build a stable payload for lookup without retaining customer data in the DB. */
export function checkoutSubmissionPayload(formData: FormData): Record<string, string[]> {
  const entries = Array.from(formData.entries()).filter(
    ([name]) =>
      !name.startsWith("$ACTION_") &&
      name !== "perf_correlation_id" &&
      name !== "checkout_request_id",
  );
  entries.sort(([left], [right]) => left.localeCompare(right));

  const payload: Record<string, string[]> = {};
  for (const [name, value] of entries) {
    const normalized =
      typeof value === "string"
        ? value
        : `${value.name}:${value.size}:${value.lastModified}`;
    (payload[name] ??= []).push(normalized);
  }
  return payload;
}
