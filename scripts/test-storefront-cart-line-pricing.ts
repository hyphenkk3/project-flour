/**
 * Regression coverage for pickup-date cart line pricing.
 * Run: JITI_TSCONFIG_PATHS=true ./node_modules/.bin/jiti scripts/test-storefront-cart-line-pricing.ts
 *
 * Static/local only. Does not mutate carts or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  draftItemSizeChoices,
  draftLineDisplayUnitPrice,
} from "@/workspaces/storefront/cart/cart-order-summary";
import { chargedDraftItemUnitPrice } from "@/engines/orders/cake-size-price-ack";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import { customerPreorderCommercialTotal } from "@/engines/orders/customer-preorder-options";
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
  price: 135,
  preorderDays: 2,
};
const item: PreorderDraftItem = {
  cakeId: "dubai-kunafa",
  sizeId: savedSizeChoice.id,
  quantity: 1,
  cakeName: "Dubai Chocolate Kunafa (Slightly Sweeter)",
  sizeLabel: savedSizeChoice.size,
  unitPrice: 80,
  preorderDays: 2,
  sizeChoices: [savedSizeChoice, otherSizeChoice],
};
const pickupDatePrices = new Map([[savedSizeChoice.id, 80]]);

// Reproduce the actual browser split: the saved sizeChoices snapshot is RM78,
// while the selected cart line amount is RM80. The active price map can be
// absent when the current cake/size could not be loaded for the sidebar.
const displayedChoicesWithoutMap = draftItemSizeChoices(item, null, new Map());
const selectedChoiceWithoutMap = displayedChoicesWithoutMap.find(
  (choice) => choice.id === item.sizeId,
);
assert.ok(selectedChoiceWithoutMap);
assert.equal(
  `${selectedChoiceWithoutMap.size} · ${formatRm(selectedChoiceWithoutMap.price)}`,
  '4" · RM80',
  "the selected cart option follows the same RM80 fallback as its line amount, not its RM78 size snapshot",
);
assert.equal(draftLineDisplayUnitPrice(item, new Map()), 80);

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
const changedPickupDatePrices = new Map([[savedSizeChoice.id, 82]]);
const displayedLineAfterDateChange = draftItemSizeChoices(
  item,
  null,
  changedPickupDatePrices,
).find((choice) => choice.id === item.sizeId);
assert.ok(displayedLineAfterDateChange);
assert.equal(displayedLineAfterDateChange.price, 82);
assert.equal(
  draftLineDisplayUnitPrice(item, changedPickupDatePrices),
  82,
  "a changed pickup date updates both the selected size label and its line amount",
);

const displayDraft = {
  ...emptyPreorderDraft(),
  pickupDate: "2026-10-06",
  items: [
    {
      ...item,
      unitPrice: draftLineDisplayUnitPrice(item, pickupDatePrices),
    },
  ],
};
assert.equal(draftTotal(displayDraft), 80);
assert.equal(item.unitPrice, 80, "the saved selected-line amount remains unchanged");
assert.equal(
  savedSizeChoice.price,
  78,
  "the saved size snapshot remains unchanged",
);

const checkoutSizePricesByDate = new Map([
  [
    "2026-09-30",
    new Map([
      [savedSizeChoice.id, 78],
      [otherSizeChoice.id, 135],
    ]),
  ],
  [
    "2026-10-01",
    new Map([
      [savedSizeChoice.id, 80],
      [otherSizeChoice.id, 140],
    ]),
  ],
]);
const checkoutItem6: PreorderDraftItem = {
  ...item,
  sizeId: otherSizeChoice.id,
  sizeLabel: otherSizeChoice.size,
  unitPrice: otherSizeChoice.price,
  applicableUnitPrice: 140,
};
for (const [date, expectedPrices] of checkoutSizePricesByDate) {
  const checkoutItem4 = {
    ...item,
    applicableUnitPrice: expectedPrices.get(savedSizeChoice.id),
  };
  const checkoutItems = [
    checkoutItem4,
    {
      ...checkoutItem6,
      applicableUnitPrice: expectedPrices.get(otherSizeChoice.id),
    },
  ];
  const selector4 = draftItemSizeChoices(
    checkoutItem4,
    null,
    expectedPrices,
  ).find((choice) => choice.id === savedSizeChoice.id);
  const selector6 = draftItemSizeChoices(
    checkoutItems[1],
    null,
    expectedPrices,
  ).find((choice) => choice.id === otherSizeChoice.id);
  assert.equal(
    `${selector4?.size} — ${formatRm(selector4?.price ?? 0)}`,
    date === "2026-10-01" ? '4" — RM80' : '4" — RM78',
  );
  assert.equal(
    `${selector6?.size} — ${formatRm(selector6?.price ?? 0)}`,
    date === "2026-10-01" ? '6" — RM140' : '6" — RM135',
  );
  assert.equal(
    chargedDraftItemUnitPrice(checkoutItems[0]),
    expectedPrices.get(savedSizeChoice.id),
  );
  assert.equal(
    chargedDraftItemUnitPrice(checkoutItems[1]),
    expectedPrices.get(otherSizeChoice.id),
  );
  assert.equal(
    customerPreorderCommercialTotal({
      items: checkoutItems.map((checkoutItem) => ({
        unitPrice: chargedDraftItemUnitPrice(checkoutItem),
        quantity: checkoutItem.quantity,
      })),
      options: [],
      selectedCodes: [],
    }),
    expectedPrices.get(savedSizeChoice.id)! +
      expectedPrices.get(otherSizeChoice.id)!,
  );
}

const cartShell = readSrc("src/workspaces/storefront/cart/StorefrontCartShell.tsx");
assert.match(
  cartShell,
  /draftItemSizeChoices\(item,\s*cake,\s*pricesBySizeId\)/,
  "the cart size label uses the same resolved per-size map as the cart total",
);
assert.match(
  cartShell,
  /draftLineDisplayUnitPrice\(item,\s*pricesBySizeId\)\s*\*\s*item\.quantity/,
  "the cart line amount uses the shared selected-line price",
);
assert.match(
  cartShell,
  /draftLineDisplayUnitPrice\(item,\s*pricesBySizeId\)/,
  "the cart total and line amount use the shared selected-line price",
);
assert.match(
  cartShell,
  /\{choice\.size\} · \{formatRm\(choice\.price\)\}/,
  "the rendered size selector displays the helper-resolved choice price",
);

const checkoutSummary = readSrc(
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx",
);
assert.match(
  checkoutSummary,
  /draftItemSizeChoices\(\s*item,\s*cake,\s*effectivePricesBySizeId,?\s*\)/,
);
assert.match(
  checkoutSummary,
  /checkoutChoicePricesReady\s*\?\s*formatRm\(size\.price\)\s*:\s*"Checking price…"/,
);
assert.match(
  checkoutSummary,
  /pricesBySizeId\[size\.id\]\s*\?\?\s*size\.price/,
);
assert.match(
  checkoutSummary,
  /checkoutStartingPriceLabel\(\s*cake,\s*checkoutPricesBySizeId,\s*checkoutChoicePricesReady,?\s*\)/,
);
assert.match(
  checkoutSummary,
  /chargedDraftItemUnitPrice\(item\)\s*\*\s*item\.quantity/,
);
const checkoutForm = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(
  checkoutForm,
  /resolveCheckoutCakeSizePrices\(pickupDate, sizeIds\)/,
);
assert.match(checkoutForm, /checkoutPricesBySizeId=\{checkoutPricesBySizeId\}/);
assert.match(
  checkoutForm,
  /checkoutChoicePricesReady\s*&&\s*fields\.pickupDate[\s\S]*resolvedCheckoutSizePrices\?\.prices/,
);

console.log("PASS storefront checkout and cart line pricing");
