/**
 * Customer-facing storefront FAQ sequence.
 * Run: npx tsx scripts/test-storefront-faq.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STOREFRONT_FAQ_ITEMS,
  STOREFRONT_INSTAGRAM_URL,
  storefrontInstagramHref,
} from "@/workspaces/storefront/home/storefront-contact";

const questions = STOREFRONT_FAQ_ITEMS.map((item) => item.question);
assert.deepEqual(questions, [
  "How many days in advance should I order?",
  "How does collection work?",
  "What happens if I need to change my collection date?",
  "Can I change my order?",
  "How is payment handled?",
  "Is there an additional fee for delivery?",
  "What is available for dine-in?",
  "What is available for dine-in at night?",
  "What should I know about dine-in reservations?",
  "What is the relationship between Hyphen and Whitebird?",
  "What are your operating and kitchen hours?",
  "Do you offer Fresh Picks?",
  "How will I be contacted after submitting an order?",
]);
assert.equal(STOREFRONT_FAQ_ITEMS.length, 13);

const byQuestion = Object.fromEntries(
  STOREFRONT_FAQ_ITEMS.map((item) => [item.question, item.answer]),
);

assert.equal(
  byQuestion["How many days in advance should I order?"],
  "Cakes are made to order. Each cake shows its preorder requirement — often 2–3 days, and sometimes different by size. Your collection date needs to meet that lead time.",
);
assert.equal(
  byQuestion["How does collection work?"],
  "When you place a preorder, you choose how to receive it — Pickup, Dine-in, or Delivery — for dates when that option is available. You then choose a collection date and time.",
);
assert.equal(
  byQuestion["What happens if I need to change my collection date?"],
  "Before you submit, you can choose a different collection date in checkout. The date still needs to meet each cake’s preorder lead time, and some dates may be unavailable.",
);
assert.equal(
  byQuestion["Can I change my order?"],
  "You can review your cakes, sizes, quantities, and collection date in Your Order before you submit.\n\nAfter submission, you can contact us via WhatsApp to check whether changes can still be made. Changes are not allowed within the minimum preorder period of 2–3 days, depending on the cake.",
);
assert.equal(
  byQuestion["How is payment handled?"],
  "After you submit, your order is received with payment pending. Whitebird will contact you via WhatsApp about payment.",
);
assert.equal(
  byQuestion["Is there an additional fee for delivery?"],
  "Yes. A RM5 processing fee applies to all delivery orders. The delivery fee itself is separate and will be calculated based on your delivery location. We will confirm the applicable delivery fee before the order is finalized.",
);
assert.equal(
  byQuestion["What is available for dine-in?"],
  "You can enjoy Whitebird cakes and desserts when dining in, together with food and beverages available from Hyphen.",
);
assert.equal(
  byQuestion["What is available for dine-in at night?"],
  "Whitebird is open until 10:00 PM on Fridays, Saturdays and Sundays. After 5:00 PM, only a light menu is available, including waffles, cakes and beverages. There is no regular dinner or meal menu during these hours.",
);
assert.equal(
  byQuestion["What should I know about dine-in reservations?"],
  "- Only light food is available after 5:00 PM on weekends.\n- Specific table requests may not be fulfilled.\n- Your table will be automatically cancelled if you do not arrive within 10 minutes of your reservation time.",
);
assert.doesNotMatch(
  byQuestion["What should I know about dine-in reservations?"] ?? "",
  /Please note:/,
);
assert.equal(
  byQuestion["What is the relationship between Hyphen and Whitebird?"],
  "Hyphen and Whitebird are partner brands operating together at the same location, with a shared menu. Hyphen focuses on food and beverages, while Whitebird focuses on cakes and desserts.",
);
assert.equal(
  byQuestion["What are your operating and kitchen hours?"],
  "📅 Operating Hours\n\n☕ Hyphen\n🕐 9:00 AM – 5:30 PM\n📌 Closed on Wednesdays\n\n🕊️ Whitebird\n🕐 10:00 AM – 5:30 PM — Monday, Tuesday & Thursday\n🕐 10:00 AM – 10:00 PM — Friday, Saturday & Sunday\n📌 Closed on Wednesdays\n\n⸻\n\n🍳 Kitchen Hours\n• 9:30 AM – 4:30 PM — Weekdays\n• 9:30 AM – 5:00 PM — Weekends\n• Light menu available after 5:00 PM on weekends\n• Cakes available from 10:30 AM onwards\n\n📌 If Wednesday falls on a public holiday, both outlets will be open as usual.\n\n📌 Operating hours and off days may change for public holidays or special occasions. Please check our Instagram for the latest updates before visiting.",
);
assert.equal(
  byQuestion["Do you offer Fresh Picks?"],
  "Yes. Fresh Picks are special cakes released by Bakery for today or tomorrow, in limited quantities. When none are available, Fresh Picks will show as unavailable.",
);
assert.equal(
  byQuestion["How will I be contacted after submitting an order?"],
  "Whitebird will contact you via WhatsApp. Please use a number you can be reached on; it is required when you submit.",
);

const answers = STOREFRONT_FAQ_ITEMS.map((item) => item.answer).join("\n");
assert.doesNotMatch(answers, /The following conditions apply to all dine-in reservations/);
assert.doesNotMatch(answers, /WHITEBIRD NIGHT DESSERT MENU/);
assert.doesNotMatch(answers, /instagram\.com/i);
assert.match(answers, /Please check our Instagram for the latest updates before visiting/);

const faqPage = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/home/StorefrontFaqPage.tsx"),
  "utf8",
);
assert.match(faqPage, /STOREFRONT_FAQ_ITEMS/);
assert.match(faqPage, /whitespace-pre-line/);
assert.match(faqPage, /text-skyline mt-2 max-w-xl text-sm leading-relaxed whitespace-pre-line/);
assert.doesNotMatch(faqPage, /text-status-danger/);
assert.doesNotMatch(faqPage, /accordion/i);
assert.doesNotMatch(faqPage, /Please note:/);

assert.equal(
  STOREFRONT_INSTAGRAM_URL,
  "https://www.instagram.com/whitebird.in.kk/",
);
assert.equal(storefrontInstagramHref(), STOREFRONT_INSTAGRAM_URL);

const footer = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/home/HomeVisitFooter.tsx"),
  "utf8",
);
const instagramBlock = footer.indexOf("Instagram");
const whatsappBlock = footer.indexOf("WhatsApp Us");
assert.ok(instagramBlock >= 0);
assert.ok(whatsappBlock > instagramBlock);
assert.match(footer, /storefrontInstagramHref/);
assert.match(footer, /Follow us on Instagram/);
assert.match(footer, /Chat with us on WhatsApp/);
assert.match(footer, /aria-label="Follow us on Instagram"/);
assert.match(footer, /rel="noopener noreferrer"/);
assert.match(footer, /target="_blank"/);
assert.match(footer, /InstagramMark/);
assert.match(footer, /WhatsAppMark/);

console.log("test-storefront-faq: ok");
