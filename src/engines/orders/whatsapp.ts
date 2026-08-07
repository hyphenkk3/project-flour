/**
 * Normalize a customer-facing Malaysian phone for WhatsApp deep links.
 * Does not mutate the stored display value — returns digits for wa.me only.
 */
export function normalizeMalaysiaWhatsAppPhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  }

  digits = digits.replace(/\D/g, "");

  if (!digits) return null;

  if (digits.startsWith("0")) {
    digits = `60${digits.slice(1)}`;
  } else if (digits.startsWith("8") && digits.length >= 9 && digits.length <= 11) {
    // Local mobile without leading 0 (uncommon) — treat as MY if short
    digits = `60${digits}`;
  } else if (!digits.startsWith("60") && digits.length <= 10) {
    digits = `60${digits}`;
  }

  if (!/^60\d{8,11}$/.test(digits)) {
    return null;
  }

  return digits;
}

export function buildWhatsAppDeepLink(
  phoneRaw: string,
  message: string,
): string | null {
  const phone = normalizeMalaysiaWhatsAppPhone(phoneRaw);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
