import { normalizeMalaysiaWhatsAppPhone } from "@/engines/orders/whatsapp";

/**
 * Official customer WhatsApp for the storefront.
 */
export const STOREFRONT_WHATSAPP_PHONE = "+60128730060";

/** Display name for the Find Us block. */
export const STOREFRONT_LOCATION_NAME = "Whitebird";

/** Short wayfinding note under the location name. */
export const STOREFRONT_LOCATION_LANDMARK =
  "Access via Hyphen, above Orange Convenience Store";

/**
 * Official street address lines.
 */
export const STOREFRONT_ADDRESS_LINES: readonly string[] = [
  "Lot 36, 2nd floor, Block D, Damai Plaza, PH1",
  "Luyang Commercial Centre, 88300 Kota Kinabalu, Sabah",
];

/**
 * Official Google Maps / directions URL.
 * `hl=en` requests English UI without changing the destination.
 */
export const STOREFRONT_MAPS_URL =
  "https://maps.app.goo.gl/q2R4E6PiSKZTDgBZ8?hl=en";

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
    question: "What happens if I need to change my collection date?",
    answer:
      "Before you submit, you can choose a different collection date in checkout. The date still needs to meet each cake’s preorder lead time, and some dates may be unavailable.",
  },
  {
    question: "Can I change my order?",
    answer:
      "You can review your cakes, sizes, quantities, and collection date in Your Order before you submit.\n\nAfter submission, you can contact us via WhatsApp to check whether changes can still be made. Changes are not allowed within the minimum preorder period of 2–3 days, depending on the cake.",
  },
  {
    question: "How is payment handled?",
    answer:
      "After you submit, your order is received with payment pending. Whitebird will contact you via WhatsApp about payment.",
  },
  {
    question: "Is there an additional fee for delivery?",
    answer:
      "Yes. A RM5 processing fee applies to all delivery orders. The delivery fee itself is separate and will be calculated based on your delivery location. We will confirm the applicable delivery fee before the order is finalized.",
  },
  {
    question: "What is available for dine-in?",
    answer:
      "You can enjoy Whitebird cakes and desserts when dining in, together with food and beverages available from Hyphen.",
  },
  {
    question: "What is available for dine-in at night?",
    answer:
      "Whitebird is open until 10:00 PM on Fridays, Saturdays and Sundays. After 5:00 PM, only a light menu is available, including waffles, cakes and beverages. There is no regular dinner or meal menu during these hours.",
  },
  {
    question: "What should I know about dine-in reservations?",
    answer:
      "Please note:\n- Only light food is available after 5:00 PM on weekends.\n- Specific table requests may not be fulfilled.\n- Your table will be automatically cancelled if you do not arrive within 10 minutes of your reservation time.",
  },
  {
    question: "What is the relationship between Hyphen and Whitebird?",
    answer:
      "Hyphen and Whitebird are partner brands operating together at the same location, with a shared menu. Hyphen focuses on food and beverages, while Whitebird focuses on cakes and desserts.",
  },
  {
    question: "What are your operating and kitchen hours?",
    answer:
      "📅 Operating Hours\n\n☕ Hyphen\n🕐 9:00 AM – 5:30 PM\n📌 Closed on Wednesdays\n\n🕊️ Whitebird\n🕐 10:00 AM – 5:30 PM — Monday, Tuesday & Thursday\n🕐 10:00 AM – 10:00 PM — Friday, Saturday & Sunday\n📌 Closed on Wednesdays\n\n⸻\n\n🍳 Kitchen Hours\n• 9:30 AM – 4:30 PM — Weekdays\n• 9:30 AM – 5:00 PM — Weekends\n• Light menu available after 5:00 PM on weekends\n• Cakes available from 10:30 AM onwards\n\n📌 If Wednesday falls on a public holiday, both outlets will be open as usual.\n\n📌 Operating hours and off days may change for public holidays or special occasions. Please check our Instagram for the latest updates before visiting.",
  },
  {
    question: "Do you offer Fresh Picks?",
    answer:
      "Yes. Fresh Picks are special cakes released by Bakery for today or tomorrow, in limited quantities. When none are available, Fresh Picks will show as unavailable.",
  },
  {
    question: "How will I be contacted after submitting an order?",
    answer:
      "Whitebird will contact you via WhatsApp. Please use a number you can be reached on; it is required when you submit.",
  },
];
