const fieldClass =
  "w-full rounded-lg border border-fog bg-white px-3 py-3 text-base text-ink outline-none focus:border-signal min-h-12";

const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-ink";

const helpClass = "text-skyline text-xs font-normal";

const errorClass =
  "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800";

export const customerFormStyles = {
  fieldClass,
  labelClass,
  helpClass,
  errorClass,
};

export function preferredContactLabel(value: string) {
  switch (value) {
    case "phone":
      return "Phone";
    case "whatsapp":
      return "WhatsApp";
    case "email":
      return "Email";
    default:
      return value;
  }
}

/**
 * Client-side directory search across name, phone (full/partial/last four),
 * WhatsApp username, and email.
 */
export function matchesCustomerQuery(
  customer: {
    fullName: string;
    phoneNumber: string | null;
    phoneNormalized: string | null;
    whatsappUsername: string | null;
    email: string | null;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  if (customer.fullName.toLowerCase().includes(q)) {
    return true;
  }

  if (customer.whatsappUsername?.toLowerCase().includes(q)) {
    return true;
  }

  if (
    customer.whatsappUsername &&
    `@${customer.whatsappUsername}`.includes(q)
  ) {
    return true;
  }

  if (customer.email?.toLowerCase().includes(q)) {
    return true;
  }

  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length > 0) {
    const normalized = customer.phoneNormalized ?? "";
    const displayDigits = (customer.phoneNumber ?? "").replace(/\D/g, "");

    if (normalized.includes(qDigits) || displayDigits.includes(qDigits)) {
      return true;
    }

    if (
      qDigits.length === 4 &&
      (normalized.endsWith(qDigits) || displayDigits.endsWith(qDigits))
    ) {
      return true;
    }
  }

  if (customer.phoneNumber?.toLowerCase().includes(q)) {
    return true;
  }

  return false;
}
