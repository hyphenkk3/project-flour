/**
 * Staff login usernames follow staff_profiles.username:
 * citext unique, format ^[a-zA-Z0-9._-]{3,32}$
 *
 * Login lookup trims surrounding whitespace and relies on citext
 * for case-insensitive matching. Keep the same rules here.
 */

export const STAFF_USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

export const STAFF_USERNAME_COPY = {
  helper: "This is the username you use to sign in to Whitebird.",
  success: "Username updated successfully.",
  unchanged: "No changes to save.",
  taken: "That username is already in use.",
  empty: "Please enter a username.",
  invalid: "Use 3–32 letters, numbers, periods, underscores, or hyphens.",
  failed: "That username couldn't be updated. Please try again.",
} as const;

export function normalizeStaffUsername(value: string): string {
  return value.trim();
}

export function staffUsernamesMatch(left: string, right: string): boolean {
  return (
    normalizeStaffUsername(left).toLowerCase() ===
    normalizeStaffUsername(right).toLowerCase()
  );
}

export function validateStaffUsername(value: string): string | null {
  const username = normalizeStaffUsername(value);
  if (!username) return STAFF_USERNAME_COPY.empty;
  if (!STAFF_USERNAME_PATTERN.test(username)) {
    return STAFF_USERNAME_COPY.invalid;
  }
  return null;
}

export function isUsernameUniqueViolation(error: {
  code?: string;
  message?: string;
}): boolean {
  const message = error.message ?? "";
  return (
    error.code === "23505" ||
    /duplicate key/i.test(message) ||
    /staff_profiles_username/i.test(message)
  );
}

export function isUsernameFormatViolation(error: {
  code?: string;
  message?: string;
}): boolean {
  const message = error.message ?? "";
  return (
    error.code === "23514" || /staff_profiles_username_format/i.test(message)
  );
}
