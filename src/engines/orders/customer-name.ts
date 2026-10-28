/** Guest checkout display name: no titles, at least two name parts. */

export const CUSTOMER_NAME_TITLE_ERROR =
  "Please enter your name without a title.";

export const CUSTOMER_NAME_SURNAME_ERROR =
  "Please enter your name and surname with a space between them.";

export const CUSTOMER_NAME_HELP = "English / preferred name and surname.";

export const CUSTOMER_NAME_SPACE_HINT = "Please leave a space between names.";

const UNICODE_LETTER = /\p{L}/u;

/**
 * Formats a person name for a newly submitted order only.
 * Whitespace and punctuation are preserved exactly; only Unicode letters are
 * case-adjusted. Each whitespace-separated word starts with an uppercase
 * letter, followed by lowercase letters.
 */
export function formatNewOrderPersonName(name: string): string {
  let startOfWord = true;

  return Array.from(name, (character) => {
    if (/\s/u.test(character)) {
      startOfWord = true;
      return character;
    }
    if (!UNICODE_LETTER.test(character)) return character;

    if (startOfWord) {
      startOfWord = false;
      return character.toUpperCase();
    }
    return character.toLowerCase();
  }).join("");
}

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
