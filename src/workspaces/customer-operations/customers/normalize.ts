import type { PreferredContact } from "@/types/customer";

/** Digits-only phone for storage, uniqueness, and search. */
export function normalizePhone(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/** Trimmed display phone; empty becomes null. */
export function displayPhone(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * WhatsApp username without leading @, lowercased.
 * Empty becomes null.
 */
export function normalizeWhatsApp(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  let text = value.trim();
  if (text.startsWith("@")) {
    text = text.slice(1).trim();
  }

  text = text.toLowerCase();
  return text.length > 0 ? text : null;
}

/** Lowercased trimmed email; empty becomes null. */
export function normalizeEmail(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function phoneLastFour(
  phoneNumber: string | null | undefined,
  phoneNormalized?: string | null,
): string | null {
  const digits = phoneNormalized ?? normalizePhone(phoneNumber);
  if (!digits || digits.length < 4) {
    return null;
  }

  return digits.slice(-4);
}

export function customerIdentityLabel(
  fullName: string,
  phoneNumber: string | null | undefined,
  phoneNormalized?: string | null,
): string {
  const lastFour = phoneLastFour(phoneNumber, phoneNormalized);
  if (!lastFour) {
    return fullName;
  }

  return `${fullName} (${lastFour})`;
}

export function customerInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return `${first}${last}`.toUpperCase();
}

export function formatCustomerDate(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(iso));
}

/**
 * Preferred WhatsApp is valid when a phone number or WhatsApp username exists.
 * Staff may contact the customer on WhatsApp via either identifier.
 */
export function preferredContactIsAvailable(
  preferred: PreferredContact,
  contacts: {
    phoneNumber: string | null;
    whatsappUsername: string | null;
    email: string | null;
  },
): boolean {
  switch (preferred) {
    case "phone":
      return contacts.phoneNumber !== null;
    case "whatsapp":
      return (
        contacts.phoneNumber !== null || contacts.whatsappUsername !== null
      );
    case "email":
      return contacts.email !== null;
    default:
      return false;
  }
}

export function preferredContactErrorMessage(
  preferred: PreferredContact,
  contacts: {
    phoneNumber: string | null;
    whatsappUsername: string | null;
    email: string | null;
  },
): string | null {
  if (preferredContactIsAvailable(preferred, contacts)) {
    return null;
  }

  switch (preferred) {
    case "phone":
      return "Preferred contact is Phone, but no phone number was provided.";
    case "whatsapp":
      return "Preferred contact is WhatsApp, but no phone number or WhatsApp username was provided.";
    case "email":
      return "Preferred contact is Email, but no email was provided.";
    default:
      return "Preferred contact must match a contact method you provided.";
  }
}

export function hasAnyContactMethod(contacts: {
  phoneNumber: string | null;
  whatsappUsername: string | null;
  email: string | null;
}): boolean {
  return (
    contacts.phoneNumber !== null ||
    contacts.whatsappUsername !== null ||
    contacts.email !== null
  );
}

/** Display WhatsApp with a single leading @. */
export function formatWhatsAppDisplay(username: string | null): string | null {
  if (!username) {
    return null;
  }

  return username.startsWith("@") ? username : `@${username}`;
}
