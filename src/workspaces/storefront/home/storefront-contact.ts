import { normalizeMalaysiaWhatsAppPhone } from "@/engines/orders/whatsapp";

/**
 * Official customer WhatsApp for the storefront.
 * Leave empty until the bakery supplies the number — do not guess.
 */
export const STOREFRONT_WHATSAPP_PHONE = "";

/** Display name for the Find Us block. */
export const STOREFRONT_LOCATION_NAME = "Whitebird";

/**
 * Official street address lines.
 * Leave empty until the bakery supplies the location — do not guess.
 */
export const STOREFRONT_ADDRESS_LINES: readonly string[] = [];

/**
 * Official Google Maps / directions URL.
 * Leave empty until the bakery supplies it — do not guess.
 */
export const STOREFRONT_MAPS_URL = "";

export function storefrontWhatsAppHref(): string | null {
  const phone = normalizeMalaysiaWhatsAppPhone(STOREFRONT_WHATSAPP_PHONE);
  if (!phone) return null;
  return `https://wa.me/${phone}`;
}

export function storefrontMapsHref(): string | null {
  const url = STOREFRONT_MAPS_URL.trim();
  return url ? url : null;
}

export type StorefrontFaqItem = {
  question: string;
  answer: string;
};

/** Customer FAQ copy drawn only from established storefront behaviour. */
export const STOREFRONT_FAQ_ITEMS: readonly StorefrontFaqItem[] = [
  {
    question: "How many days in advance should I order?",
    answer:
      "Cakes are made to order. Each cake shows its preorder requirement — often 2–3 days, and sometimes different by size. Your collection date needs to meet that lead time.",
  },
  {
    question: "How does collection work?",
    answer:
      "When you place a preorder, you choose how to receive it — Pickup, Dine-in, or Delivery — for dates when that option is available. You then choose a collection date and time.",
  },
  {
    question: "How will I be contacted after submitting an order?",
    answer:
      "Whitebird will contact you via WhatsApp. Please use a number you can be reached on; it is required when you submit.",
  },
  {
    question: "How is payment handled?",
    answer:
      "After you submit, your order is received with payment pending. Whitebird will contact you via WhatsApp about payment.",
  },
  {
    question: "Can I change my order?",
    answer:
      "You can review cakes, sizes, quantities, and your collection date in Your Order before you submit.",
  },
  {
    question: "What happens if I need to change my collection date?",
    answer:
      "Before you submit, you can choose a different collection date in checkout. The date still needs to meet each cake’s preorder lead time, and some dates may be unavailable.",
  },
  {
    question: "Do you offer Fresh Picks?",
    answer:
      "Yes. Fresh Picks are special cakes released by Bakery for today or tomorrow, in limited quantities. When none are available, Fresh Picks will show as unavailable.",
  },
];
