export const STAFF_PASSWORD_COPY = {
  success: "Password updated successfully.",
  mismatch: "New password and confirmation do not match.",
  blank: "Please fill in all password fields.",
  sameAsCurrent: "Choose a different password from your current password.",
  currentIncorrect: "Current password is incorrect.",
  weak: "That password doesn't meet Whitebird's security requirements. Please choose a stronger password.",
  reauth: "Please sign in again, then change your password.",
  failed: "That password couldn't be updated. Please try again.",
} as const;

export function validatePasswordChangeInput(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): string | null {
  if (
    input.currentPassword.length === 0 ||
    input.newPassword.length === 0 ||
    input.confirmPassword.length === 0
  ) {
    return STAFF_PASSWORD_COPY.blank;
  }

  if (input.newPassword !== input.confirmPassword) {
    return STAFF_PASSWORD_COPY.mismatch;
  }

  if (input.currentPassword === input.newPassword) {
    return STAFF_PASSWORD_COPY.sameAsCurrent;
  }

  return null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
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

function extractName(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return readString("name" in error ? error.name : "");
}

/**
 * Map Auth password-update failures to staff-facing copy.
 * Never interpolates the submitted password into the returned message.
 */
export function mapPasswordUpdateError(error: unknown): string {
  const code = extractCode(error);
  const name = extractName(error);
  const message = extractMessage(error).toLowerCase();

  if (
    code === "weak_password" ||
    name === "AuthWeakPasswordError" ||
    message.includes("weak_password") ||
    message.includes("weak password") ||
    message.includes("password should be at least") ||
    message.includes("password is known to be weak")
  ) {
    return STAFF_PASSWORD_COPY.weak;
  }

  if (code === "same_password" || message.includes("different from the old")) {
    return STAFF_PASSWORD_COPY.sameAsCurrent;
  }

  if (
    code === "invalid_credentials" ||
    message.includes("current password") ||
    message.includes("invalid login credentials") ||
    message.includes("incorrect password")
  ) {
    return STAFF_PASSWORD_COPY.currentIncorrect;
  }

  if (
    code === "reauthentication_needed" ||
    code === "reauth_nonce_missing" ||
    code === "reauthentication_not_valid" ||
    message.includes("reauthenticate") ||
    message.includes("reauthentication") ||
    message.includes("nonce")
  ) {
    return STAFF_PASSWORD_COPY.reauth;
  }

  return STAFF_PASSWORD_COPY.failed;
}
