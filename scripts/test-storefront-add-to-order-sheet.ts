/**
 * Add to Order sheet lifecycle (static).
 * Run: npx tsx scripts/test-storefront-add-to-order-sheet.ts
 *
 * Covers Browse (cake card) and Cake Detail entry points.
 * Does NOT run in iPhone Safari and cannot prove real-device behaviour.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const sheetSrc = readSrc("src/workspaces/storefront/cart/AddToOrderSheet.tsx");
const cardSrc = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
const detailPanelSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPurchasePanel.tsx",
);
const detailViewSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetailView.tsx",
);
const catalogueSrc = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
const draftSrc = readSrc("src/workspaces/storefront/checkout/preorder-draft.ts");

assert.match(catalogueSrc, /StorefrontCakeCard/);
assert.match(cardSrc, /<AddToOrderButton/);
assert.match(cardSrc, /cake=\{cake\}/);
assert.match(detailViewSrc, /CakeDetailPurchasePanel/);
assert.match(detailPanelSrc, /<AddToOrderButton/);
assert.match(detailPanelSrc, /initialSizeId=\{selectedSizeId\}/);
assert.match(detailPanelSrc, /h-20 md:hidden/);

assert.match(sheetSrc, /export function AddToOrderButton/);
assert.match(sheetSrc, /export function AddToOrderSheet/);
assert.match(sheetSrc, /onClick=\{\(\) => setOpen\(true\)\}/);
assert.match(sheetSrc, /open=\{open\}/);
assert.doesNotMatch(sheetSrc, /key=\{`\$\{cake\.id\}/);
assert.doesNotMatch(sheetSrc, /\{open \? \(/);

assert.match(sheetSrc, /if \(!open\) return null/);
assert.match(sheetSrc, /createPortal\(/);
assert.match(sheetSrc, /document\.body/);
assert.doesNotMatch(sheetSrc, /setHost/);
assert.doesNotMatch(sheetSrc, /!host/);
assert.match(sheetSrc, /fixed inset-0 z-50/);
assert.match(sheetSrc, /absolute inset-x-0 bottom-0 z-\[60\]/);
assert.match(sheetSrc, /role="dialog"/);
assert.match(sheetSrc, /aria-hidden className="bg-ink\/40 absolute inset-0"/);
assert.doesNotMatch(sheetSrc, /dismissFromBackdrop/);
assert.doesNotMatch(sheetSrc, /allowDismissRef/);
assert.doesNotMatch(sheetSrc, /aria-hidden[\s\S]{0,120}onClick/);
assert.doesNotMatch(sheetSrc, /document\.body\.style\.overflow/);
assert.doesNotMatch(sheetSrc, /showModal/);
assert.doesNotMatch(sheetSrc, /<dialog/);

assert.match(sheetSrc, /aria-label="Close"/);
assert.match(sheetSrc, /onClick=\{onClose\}/);
assert.match(sheetSrc, /mergeDraftItem/);
assert.match(sheetSrc, /setSizeId/);
assert.match(sheetSrc, /setQuantity/);
assert.match(sheetSrc, /\{cake\.name\}/);
assert.match(sheetSrc, /name="add-to-order-size"/);
assert.match(sheetSrc, /Decrease quantity/);
assert.match(sheetSrc, /Increase quantity/);
assert.match(draftSrc, /whitebird-preorder-draft-v1/);

console.log(
  "PASS storefront add-to-order sheet lifecycle (Browse + Detail; not an iPhone Safari runtime proof)",
);
