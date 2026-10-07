/** Canonical Whitebird customer contact number used for WhatsApp and calls. */
export const WHITEBIRD_CUSTOMER_PHONE = "+60128730060";

export function whitebirdCustomerPhoneLocal(): string {
  const digits = WHITEBIRD_CUSTOMER_PHONE.replace(/\D/g, "");
  return digits.startsWith("60") ? `0${digits.slice(2)}` : digits;
}
