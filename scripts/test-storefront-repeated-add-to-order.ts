/**
 * Repeated Add-to-Order: cake+size identity and final-quantity edits.
 * Run: npx tsx scripts/test-storefront-repeated-add-to-order.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  draftLineQuantity,
  emptyPreorderDraft,
  mergeDraftItem,
  readPreorderDraft,
  setDraftLineQuantity,
  writePreorderDraft,
  type PreorderDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function line(
  cakeId: string,
  sizeId: string,
  quantity: number,
  extras: Partial<PreorderDraftItem> = {},
): PreorderDraftItem {
  return {
    cakeId,
    sizeId,
    quantity,
    cakeName: cakeId,
    sizeLabel: sizeId,
    unitPrice: 78,
    preorderDays: 2,
    ...extras,
  };
}

function withDraftStorage(run: () => void): void {
  const data = new Map<string, string>();
  const previous = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
          data.set(key, value);
        },
        removeItem: (key: string) => {
          data.delete(key);
        },
      },
      dispatchEvent: () => true,
    },
  });
  try {
    run();
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previous,
      });
    }
  }
}

const chocolate = "chocolate";
const six = "6-inch";
const four = "4-inch";

withDraftStorage(() => {
  let draft = emptyPreorderDraft();
  assert.equal(draftLineQuantity(draft, chocolate, six), 0);
  assert.equal(draftLineQuantity(null, chocolate, six), 0);

  draft = mergeDraftItem(draft, line(chocolate, six, 1));
  writePreorderDraft(draft);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, six), 1);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, four), 0);
  assert.equal(readPreorderDraft()?.items.length, 1);

  draft = mergeDraftItem(emptyPreorderDraft(), line(chocolate, four, 2));
  writePreorderDraft(draft);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, four), 2);
  assert.equal(readPreorderDraft()?.items[0]?.quantity, 2);

  draft = emptyPreorderDraft();
  draft = mergeDraftItem(draft, line(chocolate, six, 1));
  draft = mergeDraftItem(draft, line(chocolate, four, 1));
  writePreorderDraft(draft);
  assert.equal(readPreorderDraft()?.items.length, 2);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, six), 1);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, four), 1);

  setDraftLineQuantity(chocolate, six, 2);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, six), 2);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, four), 1);

  setDraftLineQuantity(chocolate, six, 3);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, six), 3);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, four), 1);

  setDraftLineQuantity(chocolate, six, 2);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, six), 2);
  assert.notEqual(draftLineQuantity(readPreorderDraft(), chocolate, six), 5);

  setDraftLineQuantity(chocolate, six, 2);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, six), 2);
  assert.equal(draftLineQuantity(readPreorderDraft(), chocolate, four), 1);
});

const sheetSrc = readSrc("src/workspaces/storefront/cart/AddToOrderSheet.tsx");
const panelSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPurchasePanel.tsx",
);
const draftSrc = readSrc(
  "src/workspaces/storefront/checkout/preorder-draft.ts",
);
const cartSrc = readSrc(
  "src/workspaces/storefront/cart/StorefrontCartShell.tsx",
);
const cardSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeCard.tsx",
);

assert.match(draftSrc, /export function draftLineQuantity/);
assert.match(draftSrc, /item\.cakeId === cakeId && item\.sizeId === sizeId/);
assert.match(draftSrc, /quantity: existing\.quantity \+ item\.quantity/);

assert.match(sheetSrc, /draftLineQuantity/);
assert.match(sheetSrc, /setDraftLineQuantity/);
assert.match(sheetSrc, /mergeDraftItem/);
assert.match(sheetSrc, /addingRef\.current/);
assert.match(sheetSrc, /Added ✓/);
assert.match(sheetSrc, /Update Order/);
assert.match(sheetSrc, /Already in your order/);
assert.match(sheetSrc, /View \/ Edit Order/);
assert.match(sheetSrc, /\+ Add Another/);
assert.match(sheetSrc, /openStorefrontOrder/);
assert.match(sheetSrc, /onAdded\("updated"\)/);
assert.match(sheetSrc, /onAdded\("added"\)/);
assert.match(sheetSrc, /existingQuantity > 0/);
assert.match(sheetSrc, /onClick=\{\(\) => setOpen\(true\)\}/);

assert.match(panelSrc, /draftLineQuantity\(draft, cake\.id, selectedSizeId\)/);
assert.match(panelSrc, /existingQuantity=\{existingQuantity\}/);
assert.match(panelSrc, /existingSizeLabel=\{selectedSize\?\.size\}/);
assert.doesNotMatch(panelSrc, /existingQuantityForSize/);

assert.match(cardSrc, /<AddToOrderButton/);
assert.doesNotMatch(cardSrc, /existingQuantity=/);

assert.match(cartSrc, /View Order →/);
assert.match(cartSrc, /setDraftLineQuantity/);
assert.match(cartSrc, /removeDraftLine/);
assert.doesNotMatch(sheetSrc, /dine_in|DineInVenuePartyFields/);
assert.doesNotMatch(panelSrc, /dine_in|DineInVenuePartyFields/);

console.log("PASS storefront repeated add-to-order cake+size identity");
