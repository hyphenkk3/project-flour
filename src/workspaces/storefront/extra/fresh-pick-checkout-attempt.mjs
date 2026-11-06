export const FRESH_PICK_CHECKOUT_ATTEMPT_KEY =
  "whitebird-fresh-pick-checkout-attempt-v1";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOVERY_DIGEST_PATTERN = /^[0-9a-f]{64}$/i;

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomUuid(cryptoObject) {
  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  if (typeof cryptoObject?.getRandomValues !== "function") return null;
  const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function parseFreshPickCheckoutAttempt(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      !value ||
      typeof value !== "object" ||
      !UUID_PATTERN.test(value.requestId ?? "") ||
      !RECOVERY_DIGEST_PATTERN.test(value.recoveryDigest ?? "")
    ) {
      return null;
    }
    return {
      requestId: value.requestId.toLowerCase(),
      recoveryDigest: value.recoveryDigest.toLowerCase(),
    };
  } catch {
    return null;
  }
}

/** A stable opaque request key and recovery capability for this browser tab. */
export function getOrCreateFreshPickCheckoutAttempt(
  storage,
  cryptoObject,
) {
  try {
    const targetStorage = storage ?? globalThis.sessionStorage;
    const targetCrypto = cryptoObject ?? globalThis.crypto;
    if (!targetStorage || typeof targetCrypto?.getRandomValues !== "function") return null;
    const existing = parseFreshPickCheckoutAttempt(
      targetStorage.getItem(FRESH_PICK_CHECKOUT_ATTEMPT_KEY),
    );
    if (existing) return existing;

    const requestId = randomUuid(targetCrypto);
    if (!requestId) return null;
    const recoveryBytes = targetCrypto.getRandomValues(new Uint8Array(32));
    const attempt = {
      requestId,
      recoveryDigest: bytesToHex(recoveryBytes),
    };
    targetStorage.setItem(FRESH_PICK_CHECKOUT_ATTEMPT_KEY, JSON.stringify(attempt));
    return attempt;
  } catch {
    return null;
  }
}

export function clearFreshPickCheckoutAttempt(storage) {
  try {
    (storage ?? globalThis.sessionStorage)?.removeItem(
      FRESH_PICK_CHECKOUT_ATTEMPT_KEY,
    );
  } catch {
    // The committed order remains protected by the database idempotency record.
  }
}

/** Stable submission fingerprint input; exclude transient perf and capability fields. */
export function freshPickSubmissionPayload(formData) {
  const fields = [];
  for (const [name, value] of formData.entries()) {
    if (
      name === "checkout_request_id" ||
      name === "checkout_recovery_digest" ||
      name === "perf_correlation_id" ||
      name.startsWith("$ACTION_") ||
      typeof value !== "string"
    ) {
      continue;
    }
    fields.push([name, value]);
  }
  fields.sort((left, right) => left[0].localeCompare(right[0]));
  return { version: 1, fields };
}
