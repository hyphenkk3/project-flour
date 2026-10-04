/**
 * Regression coverage for pickup-date cart line pricing.
 * Run: JITI_TSCONFIG_PATHS=true ./node_modules/.bin/jiti scripts/test-storefront-cart-line-pricing.ts
 *
 * Static/local only. Does not mutate carts or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { draftItemSizeChoices } from "@/workspaces/storefront/cart/cart-order-summary";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  draftTotal,
  emptyPreorderDraft,
  type PreorderDraftItem,
  type PreorderDraftSizeChoice,
} from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const savedSizeChoice: PreorderDraftSizeChoice = {
  id: "dubai-kunafa-4",
  size: '4"',
  price: 78,
  preorderDays: 2,
};
const otherSizeChoice: PreorderDraftSizeChoice = {
  id: "dubai-kunafa-6",
  size: '6"',
  price: 145,
  preorderDays: 2,
};
const item: PreorderDraftItem = {
  cakeId: "dubai-kunafa",
  sizeId: savedSizeChoice.id,
  quantity: 1,
  cakeName: "Dubai Chocolate Kunafa (Slightly Sweeter)",
  sizeLabel: savedSizeChoice.size,
  unitPrice: 78,
  preorderDays: 2,
  sizeChoices: [savedSizeChoice, otherSizeChoice],
};
const pickupDatePrices = new Map([[savedSizeChoice.id, 80]]);

// The line option can fall back to its saved RM78 choice; the cart's current
// pickup-date resolver must override that with RM80 for the same size ID.
const displayedChoices = draftItemSizeChoices(item, null, pickupDatePrices);
const displayedLine = displayedChoices.find(
  (choice) => choice.id === item.sizeId,
);
assert.ok(displayedLine);
assert.equal(displayedLine.price, 80);
assert.equal(
  `${displayedLine.size} · ${formatRm(displayedLine.price)}`,
  '4" · RM80',
);

const displayDraft = {
  ...emptyPreorderDraft(),
  pickupDate: "2026-10-06",
  items: [
    {
      ...item,
      unitPrice: pickupDatePrices.get(item.sizeId) ?? item.unitPrice,
    },
  ],
};
assert.equal(draftTotal(displayDraft), 80);
assert.equal(item.unitPrice, 78, "the saved quote remains unchanged");
assert.equal(
  savedSizeChoice.price,
  78,
  "the saved size snapshot remains unchanged",
);

const cartShell = readSrc("src/workspaces/storefront/cart/StorefrontCartShell.tsx");
assert.match(
  cartShell,
  /draftItemSizeChoices\(item,\s*cake,\s*pricesBySizeId\)/,
  "the cart size label uses the same resolved per-size map as the cart total",
);
assert.match(
  cartShell,
  /pricesBySizeId\.get\(item\.sizeId\)\s*\?\?\s*item\.unitPrice/,
  "the cart total uses the resolved pickup-date price",
);

console.log("PASS storefront cart line pricing");
