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
assert.match(
  sheetSrc,
  /key=\{open \? `open:\$\{cake\.id\}:\$\{initialSizeId \?\? ""\}` : "closed"\}/,
);
assert.doesNotMatch(sheetSrc, /key=\{`\$\{cake\.id\}/);
assert.doesNotMatch(sheetSrc, /\{open \? \(/);
assert.doesNotMatch(sheetSrc, /setSizeId\(defaultSizeId\)/);
assert.doesNotMatch(sheetSrc, /setQuantity\(1\)/);

assert.match(sheetSrc, /if \(!open\) return null/);
assert.match(sheetSrc, /from "@\/workspaces\/storefront\/StorefrontOverlay"/);
assert.match(sheetSrc, /<StorefrontOverlay/);
assert.match(sheetSrc, /labelledBy=\{titleId\}/);
assert.match(sheetSrc, /panelClassName=/);
assert.match(
  sheetSrc,
  /flex max-h-\[100dvh\] min-h-0 w-full flex-col overflow-hidden/,
);
assert.match(sheetSrc, /md:max-h-\[calc\(100dvh-5rem\)\]/);
assert.match(
  sheetSrc,
  /flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto/,
);
assert.doesNotMatch(sheetSrc, /from "react-dom"/);
assert.doesNotMatch(sheetSrc, /fixed inset-x-0 bottom-0 z-\[60\]/);
assert.doesNotMatch(sheetSrc, /pointer-events-none fixed inset-0 z-50/);
assert.doesNotMatch(sheetSrc, /fixed inset-0 z-50 animate-storefront-fade/);
assert.doesNotMatch(sheetSrc, /createPortal\(/);
assert.doesNotMatch(sheetSrc, /role="dialog"/);
assert.doesNotMatch(sheetSrc, /dismissFromBackdrop/);
assert.doesNotMatch(sheetSrc, /allowDismissRef/);
assert.doesNotMatch(sheetSrc, /aria-hidden[\s\S]{0,160}onClick/);
assert.doesNotMatch(sheetSrc, /document\.body\.style\.overflow/);
assert.doesNotMatch(sheetSrc, /showModal/);
assert.doesNotMatch(sheetSrc, /<dialog/);

const overlaySrc = readSrc("src/workspaces/storefront/StorefrontOverlay.tsx");
const cartSrc = readSrc("src/workspaces/storefront/cart/StorefrontCartShell.tsx");
assert.match(overlaySrc, /The dialog element is the sheet itself/);
assert.match(overlaySrc, /createPortal\(/);
assert.match(overlaySrc, /document\.body/);
assert.match(
  overlaySrc,
  /bg-ink\/40 animate-storefront-fade pointer-events-none fixed inset-0 z-50/,
);
assert.match(overlaySrc, /fixed inset-x-0 bottom-0 z-\[60\]/);
assert.doesNotMatch(overlaySrc, /fixed inset-0 z-\[60\] flex/);
assert.doesNotMatch(overlaySrc, /touch-manipulation/);
assert.match(overlaySrc, /role="dialog"/);
assert.doesNotMatch(overlaySrc, /onClick/);
assert.match(cartSrc, /animate-storefront-fade fixed inset-0 z-50/);
assert.match(cartSrc, /fixed inset-0 z-\[60\]/);

assert.match(sheetSrc, /aria-label="Close"/);
assert.match(sheetSrc, /onClick=\{onClose\}/);
assert.match(
  sheetSrc,
  /aria-label="Close"[\s\S]*cursor-pointer[\s\S]*type="button"/,
);
assert.match(
  sheetSrc,
  /cursor-pointer items-center justify-center rounded-md px-5[\s\S]*type="submit"/,
);
assert.match(sheetSrc, /mergeDraftItem/);
assert.match(sheetSrc, /setSizeId/);
assert.match(sheetSrc, /setQuantity/);
assert.match(sheetSrc, /\{cake\.name\}/);
assert.match(sheetSrc, /name="add-to-order-size"/);
assert.match(sheetSrc, /type="radio"/);
assert.doesNotMatch(sheetSrc, /aria-pressed=\{selectedSize\}/);
assert.match(sheetSrc, /Decrease quantity/);
assert.match(sheetSrc, /Increase quantity/);
assert.match(draftSrc, /whitebird-preorder-draft-v1/);

console.log(
  "PASS storefront add-to-order sheet lifecycle (Browse + Detail; not an iPhone Safari runtime proof)",
);
