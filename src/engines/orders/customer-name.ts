/** Guest checkout display name: no titles, at least two name parts. */

export const CUSTOMER_NAME_TITLE_ERROR =
  "Please enter your name without a title.";

export const CUSTOMER_NAME_SURNAME_ERROR =
  "Please enter your name and surname.";

const CUSTOMER_NAME_TITLES = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mdm",
  "madam",
  "dr",
  "prof",
  "professor",
  "sir",
  "datuk",
  "dato",
  "datin",
]);

function normalizeNameToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/^[.,/'’]+|[.,/'’]+$/g, "")
    .replace(/\./g, "");
}

function isMeaningfulNamePart(token: string): boolean {
  return /\p{L}/u.test(token);
}

/**
 * Returns a customer-facing error, or null when the name is usable.
 * Empty input is left to the existing required-field message.
 */
export function customerNameValidationError(name: string): string | null {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  for (const token of tokens) {
    if (CUSTOMER_NAME_TITLES.has(normalizeNameToken(token))) {
      return CUSTOMER_NAME_TITLE_ERROR;
    }
  }

  const parts = tokens.filter(isMeaningfulNamePart);
  if (parts.length < 2) {
    return CUSTOMER_NAME_SURNAME_ERROR;
  }
  return null;
}
