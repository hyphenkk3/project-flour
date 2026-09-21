import {
  defaultAssistedDineInDraft,
  type AssistedDineInDraft,
} from "@/engines/orders/assisted-fulfilment";
import {
  defaultDeliveryCreateDraft,
  type DeliveryCreateDraft,
} from "@/engines/orders/fulfilment";

export type StaffPreorderFormItem = {
  cakeId: string;
  cakeSizeId: string;
  quantity: number;
};

export function parseStaffPreorderItemsFromForm(
  formData: FormData,
): StaffPreorderFormItem[] {
  const raw = String(formData.get("items_json") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      cakeId?: string;
      cakeSizeId?: string;
      quantity?: number;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        cakeId: String(item.cakeId ?? "").trim(),
        cakeSizeId: String(item.cakeSizeId ?? "").trim(),
        quantity: Number(item.quantity ?? 0),
      }))
      .filter(
        (item) =>
          item.cakeId &&
          item.cakeSizeId &&
          Number.isInteger(item.quantity) &&
          item.quantity >= 1,
      );
  } catch {
    return [];
  }
}

export function parseDineInDraftFromForm(
  formData: FormData,
): AssistedDineInDraft {
  const named: AssistedDineInDraft = {
    reservationTime: String(formData.get("reservation_time") ?? "").trim(),
    venue: String(formData.get("dine_in_venue") ?? "").trim(),
    adultCount: String(formData.get("adult_count") ?? "").trim(),
    kidCount: String(formData.get("kid_count") ?? "").trim(),
    toddlerCount: String(formData.get("toddler_count") ?? "").trim(),
    guestCount: String(formData.get("guest_count") ?? "").trim(),
    reservationNote: String(formData.get("reservation_note") ?? "").trim(),
  };
  const raw = String(formData.get("dine_in_json") ?? "").trim();
  if (!raw) {
    return named.reservationTime ||
      named.venue ||
      named.adultCount ||
      named.guestCount
      ? named
      : defaultAssistedDineInDraft();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AssistedDineInDraft>;
    return {
      reservationTime:
        named.reservationTime || String(parsed.reservationTime ?? "").trim(),
      venue: named.venue || String(parsed.venue ?? "").trim(),
      adultCount: named.adultCount || String(parsed.adultCount ?? "").trim(),
      kidCount: named.kidCount || String(parsed.kidCount ?? "").trim(),
      toddlerCount:
        named.toddlerCount || String(parsed.toddlerCount ?? "").trim(),
      guestCount: named.guestCount || String(parsed.guestCount ?? "").trim(),
      reservationNote:
        named.reservationNote || String(parsed.reservationNote ?? "").trim(),
    };
  } catch {
    return named;
  }
}

export function parseDeliveryDraftFromForm(
  formData: FormData,
): DeliveryCreateDraft {
  const raw = String(formData.get("delivery_json") ?? "").trim();
  if (!raw) return defaultDeliveryCreateDraft();
  try {
    const parsed = JSON.parse(raw) as Partial<DeliveryCreateDraft>;
    return {
      recipientName: String(parsed.recipientName ?? ""),
      recipientPhone: String(parsed.recipientPhone ?? ""),
      addressLine1: String(parsed.addressLine1 ?? ""),
      addressLine2: String(parsed.addressLine2 ?? ""),
      postcode: String(parsed.postcode ?? ""),
      city: String(parsed.city ?? ""),
      state: String(parsed.state ?? ""),
      recipientNotifyPreference:
        parsed.recipientNotifyPreference === "inform_recipient" ||
        parsed.recipientNotifyPreference === "do_not_inform_recipient"
          ? parsed.recipientNotifyPreference
          : null,
      sameAsCustomer: Boolean(parsed.sameAsCustomer),
    };
  } catch {
    return defaultDeliveryCreateDraft();
  }
}
