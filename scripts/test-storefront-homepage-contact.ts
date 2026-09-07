/**
 * Homepage contact / FAQ / Fresh Picks unavailable card (static).
 * Run: npx tsx scripts/test-storefront-homepage-contact.ts
 *
 * Does not mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homepageFreshPicksCountCopy } from "@/engines/extra/customer-fresh-picks";
import { normalizeMalaysiaWhatsAppPhone } from "@/engines/orders/whatsapp";
import {
  STOREFRONT_ADDRESS_LINES,
  STOREFRONT_FAQ_ITEMS,
  STOREFRONT_LOCATION_LANDMARK,
  STOREFRONT_MAPS_URL,
  STOREFRONT_WHATSAPP_PHONE,
  storefrontMapsHref,
  storefrontWhatsAppHref,
} from "@/workspaces/storefront/home/storefront-contact";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.equal(homepageFreshPicksCountCopy(0), "No Fresh Picks right now");

const cardSrc = readSrc("src/workspaces/storefront/home/HomeDestinationCard.tsx");
assert.match(cardSrc, /unavailable/);
assert.match(cardSrc, /aria-disabled/);
assert.match(cardSrc, /currently unavailable/);
assert.match(cardSrc, /cursor-default/);
assert.match(cardSrc, /role="group"/);
assert.match(cardSrc, /<Link className=\{cardClass\} href=\{href\}>/);
assert.match(cardSrc, /h-\[11\.25rem\]/);
assert.match(cardSrc, /h-\[14\.5rem\]/);
assert.match(cardSrc, /md:h-\[12rem\]/);
assert.match(cardSrc, /rounded-\[14px\]/);
assert.match(cardSrc, /md:rounded-\[10px\]/);
assert.match(cardSrc, /px-\[18px\] pt-\[18px\] pb-4/);
assert.match(cardSrc, /md:px-5 md:py-4/);
assert.match(cardSrc, /md:shadow-\[0_1px_8px_rgba\(28,25,22,0\.045\)\]/);
assert.doesNotMatch(cardSrc, /shadow-\[0_1px_8px_rgba\(28,25,22,0\.045\)\] sm:/);
assert.match(cardSrc, /min-h-11/);
assert.match(cardSrc, /text-\[13px\]/);
assert.match(cardSrc, /md:min-h-0 md:py-2 md:text-\[12px\]/);
assert.match(cardSrc, /max-md:min-h-2 max-md:flex-1 md:hidden/);

const freshCardSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontFreshPicksCard.tsx",
);
assert.match(freshCardSrc, /unavailable=\{empty\}/);
assert.match(freshCardSrc, /href="\/extra"/);
assert.match(freshCardSrc, /See Fresh Picks/);
assert.match(freshCardSrc, /limited-time pickup/);
assert.match(freshCardSrc, /homepageFreshPicksAvailabilityLines/);
assert.match(freshCardSrc, /homepageFreshPicksHorizon/);
assert.match(freshCardSrc, /homepageFreshPicksCountCopy/);
assert.match(freshCardSrc, /homepageFreshPicksDescription/);
assert.match(freshCardSrc, /mt-2 space-y-0\.5/);
assert.match(freshCardSrc, /tall/);

const homeSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.match(homeSrc, /listStorefrontAvailableExtra/);
assert.match(homeSrc, /StorefrontFreshPicksCard/);
assert.match(homeSrc, /HomeVisitFooter/);
assert.match(
  homeSrc,
  /HomeVisitFooter lead=\{<HomePopularCakes cakes=\{popular\} \/>\}/,
);

assert.doesNotMatch(homeSrc, /HomeFeaturedFreshPick/);
assert.doesNotMatch(homeSrc, /getStorefrontExtraById/);
assert.match(homeSrc, /HomePopularCakes/);

assert.match(homeSrc, /days=\{picks\.flatMap\(\(pick\) => pick\.days\)\}/);
assert.match(homeSrc, /href="\/faq"/);
assert.match(homeSrc, /HomeMobileNav/);
assert.match(
  homeSrc,
  /href="\/extra"[\s\S]*Fresh Picks[\s\S]*href="\/faq"[\s\S]*FAQ/,
);
assert.match(homeSrc, /grid gap-4 md:grid-cols-3 md:gap-3\.5/);
assert.match(homeSrc, /hidden[\s\S]*md:flex/);
assert.doesNotMatch(
  homeSrc,
  /md:hidden">\s*<Link[\s\S]*href="\/order"/,
);

const mobileNavSrc = readSrc("src/workspaces/storefront/home/HomeMobileNav.tsx");
assert.match(mobileNavSrc, /"\/order"/);
assert.match(mobileNavSrc, /Order/);
assert.match(mobileNavSrc, /"\/browse"/);
assert.match(mobileNavSrc, /Browse Cakes/);
assert.match(mobileNavSrc, /"\/extra"/);
assert.match(mobileNavSrc, /Fresh Picks/);
assert.match(mobileNavSrc, /"\/faq"/);
assert.match(mobileNavSrc, /FAQ/);
assert.match(mobileNavSrc, /min-h-11/);
assert.match(
  mobileNavSrc,
  /href: "\/order", label: "Order"[\s\S]*href: "\/browse", label: "Browse Cakes"[\s\S]*href: "\/extra", label: "Fresh Picks"[\s\S]*href: "\/faq", label: "FAQ"/,
);

const footerSrc = readSrc("src/workspaces/storefront/home/HomeVisitFooter.tsx");
assert.doesNotMatch(footerSrc, /href="\/faq"/);
assert.doesNotMatch(footerSrc, />FAQ</);
assert.match(footerSrc, /storefrontWhatsAppHref/);
assert.match(footerSrc, /storefrontMapsHref/);
assert.match(footerSrc, /Chat with us on WhatsApp|WhatsApp Us/);
assert.match(footerSrc, /Get Directions/);
assert.match(footerSrc, /Find Us/);
assert.match(footerSrc, /STOREFRONT_LOCATION_LANDMARK/);
assert.match(footerSrc, /md:grid-cols-2/);
assert.match(footerSrc, /items-start/);
assert.match(
  footerSrc,
  /lg:grid-cols-\[minmax\(0,0\.55fr\)_minmax\(0,0\.27fr\)_minmax\(0,0\.18fr\)\]/,
);
assert.match(footerSrc, /md:col-span-2 lg:col-span-1/);
assert.match(footerSrc, /border-t/);
assert.doesNotMatch(footerSrc, /md:grid-cols-3/);
assert.doesNotMatch(footerSrc, /lg:grid-cols-3/);
assert.doesNotMatch(footerSrc, /wa\.me\/\d+/);

assert.equal(STOREFRONT_WHATSAPP_PHONE, "+60128730060");
assert.equal(normalizeMalaysiaWhatsAppPhone(STOREFRONT_WHATSAPP_PHONE), "60128730060");
assert.equal(storefrontWhatsAppHref(), "https://wa.me/60128730060");
assert.equal(
  STOREFRONT_LOCATION_LANDMARK,
  "Access via Hyphen, above Orange Convenience Store",
);
assert.deepEqual(STOREFRONT_ADDRESS_LINES, [
  "Lot 36, 2nd floor, Block D, Damai Plaza, PH1",
  "Luyang Commercial Centre, 88300 Kota Kinabalu, Sabah",
]);
assert.equal(STOREFRONT_ADDRESS_LINES.length, 2);
assert.equal(
  STOREFRONT_MAPS_URL,
  "https://maps.app.goo.gl/q2R4E6PiSKZTDgBZ8?hl=en",
);
assert.equal(
  storefrontMapsHref(),
  "https://maps.app.goo.gl/q2R4E6PiSKZTDgBZ8?hl=en",
);
assert.match(STOREFRONT_MAPS_URL, /^https:\/\/maps\.app\.goo\.gl\/q2R4E6PiSKZTDgBZ8/);

const faqQuestions = STOREFRONT_FAQ_ITEMS.map((item) => item.question);
assert.ok(faqQuestions.includes("How many days in advance should I order?"));
assert.ok(faqQuestions.includes("How does collection work?"));
assert.ok(faqQuestions.includes("How will I be contacted after submitting an order?"));
assert.ok(faqQuestions.includes("How is payment handled?"));
assert.ok(faqQuestions.includes("Can I change my order?"));
assert.ok(faqQuestions.includes("What happens if I need to change my collection date?"));
assert.ok(faqQuestions.includes("Do you offer Fresh Picks?"));
assert.equal(
  faqQuestions.includes("Where are you located?"),
  false,
  "location FAQ omitted until an official address is supplied",
);

const faqAnswers = STOREFRONT_FAQ_ITEMS.map((item) => item.answer).join(" ");
assert.match(faqAnswers, /Whitebird will contact you via WhatsApp/);
assert.match(faqAnswers, /payment pending/i);
assert.match(faqAnswers, /before you submit/i);
assert.match(faqAnswers, /Fresh Picks/);
assert.doesNotMatch(faqAnswers, /123456789012/);
assert.doesNotMatch(faqAnswers, /Maybank/);
assert.doesNotMatch(faqAnswers, /capacity/i);
assert.doesNotMatch(faqAnswers, /waiting list/i);

const faqPageSrc = readSrc("src/workspaces/storefront/home/StorefrontFaqPage.tsx");
assert.match(faqPageSrc, /STOREFRONT_FAQ_ITEMS/);
assert.match(faqPageSrc, /StorefrontHomeLink/);
assert.doesNotMatch(faqPageSrc, /accordion/i);

const faqRouteSrc = readSrc("src/app/faq/page.tsx");
assert.match(faqRouteSrc, /StorefrontFaqPage/);

const middlewareSrc = readSrc("src/middleware.ts");
assert.match(middlewareSrc, /"\/faq"/);

console.log("PASS storefront homepage contact / FAQ / Fresh Picks unavailable");
