export const PASSKEY_COPY = {
  cancelledSignIn: "Passkey sign-in was cancelled.",
  cancelledSetup: "Passkey setup was cancelled.",
  unsupported:
    "Passkey sign-in isn't available in this browser. Please use your username and password instead.",
  failedSignIn:
    "That passkey couldn't sign you in. Please try again or use your username and password.",
  failedSetup: "That passkey couldn't be added. Please try again.",
  failedList: "Your passkeys couldn't be loaded. Please try again.",
  failedDelete: "That passkey couldn't be removed. Please try again.",
  successSetup: "Passkey added successfully.",
  successDelete: "Passkey removed.",
} as const;

export type PasskeyFailureKind = "cancelled" | "unsupported" | "failed";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function extractName(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return readString("name" in error ? error.name : "");
}

function extractCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return readString("code" in error ? error.code : "");
}

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  return readString("message" in error ? error.message : "");
}

export function classifyPasskeyFailure(error: unknown): PasskeyFailureKind {
  const name = extractName(error);
  const code = extractCode(error);
  const message = extractMessage(error).toLowerCase();

  if (
    name === "AbortError" ||
    name === "NotAllowedError" ||
    code === "ERROR_CEREMONY_ABORTED" ||
    message.includes("abort") ||
    message.includes("cancel")
  ) {
    return "cancelled";
  }

  if (
    name === "NotSupportedError" ||
    code === "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT" ||
    message.includes("does not support webauthn") ||
    message.includes("not supported")
  ) {
    return "unsupported";
  }

  return "failed";
}

export function passkeySignInMessage(kind: PasskeyFailureKind): string {
  if (kind === "cancelled") return PASSKEY_COPY.cancelledSignIn;
  if (kind === "unsupported") return PASSKEY_COPY.unsupported;
  return PASSKEY_COPY.failedSignIn;
}

export function passkeySetupMessage(kind: PasskeyFailureKind): string {
  if (kind === "cancelled") return PASSKEY_COPY.cancelledSetup;
  if (kind === "unsupported") return PASSKEY_COPY.unsupported;
  return PASSKEY_COPY.failedSetup;
}

export function browserSupportsPasskeySignIn(
  globalObject: Pick<typeof globalThis, "window" | "navigator"> = globalThis,
): boolean {
  const publicKeyCredential = (
    globalObject as typeof globalThis & {
      PublicKeyCredential?: unknown;
    }
  ).PublicKeyCredential;
  const credentials = globalObject.navigator?.credentials;

  return (
    typeof publicKeyCredential === "function" &&
    typeof credentials?.get === "function" &&
    typeof credentials.create === "function"
  );
}

export function formatPasskeyAddedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Added";

  return `Added ${date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

export function logPasskeyError(context: string, error: unknown): void {
  if (process.env.NODE_ENV === "development") {
    console.error(`[passkey] ${context}`, error);
  }
}
