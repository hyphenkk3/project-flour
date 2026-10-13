/**
 * Normalize customer phone numbers for WhatsApp deep links.
 * Malaysian national numbers receive the MY country code; international
 * numbers keep their country code. The stored display value is never changed.
 */
export function normalizeMalaysiaWhatsAppPhone(raw: string): string | null {
  const normalized = raw.trim().replace(/[^\d+]/g, "");
  if (
    (normalized.includes("+") && !normalized.startsWith("+")) ||
    normalized.indexOf("+", 1) !== -1
  ) {
    return null;
  }
  let digits = normalized.replace(/\D/g, "");

  if (!digits) return null;

  if (digits.startsWith("0")) {
    digits = `60${digits.slice(1)}`;
  } else if (digits.startsWith("60")) {
    // Already in Malaysian international format.
  }

  if (digits.startsWith("60")) {
    return /^60\d{8,11}$/.test(digits) ? digits : null;
  }

  // wa.me accepts E.164 digits without the plus. A leading plus explicitly
  // marks an international number; bare country-prefixed numbers such as 65…
  // are also preserved instead of being mistaken for Malaysian local numbers.
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function buildWhatsAppDeepLink(
  phoneRaw: string,
  message: string,
): string | null {
  const phone = normalizeMalaysiaWhatsAppPhone(phoneRaw);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
