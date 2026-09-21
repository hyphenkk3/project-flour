/**
 * Mobile Add-to-Order feedback and View Order cart bar (static).
 * Run: npx tsx scripts/test-storefront-mobile-add-to-order-feedback.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const sheetSrc = readSrc("src/workspaces/storefront/cart/AddToOrderSheet.tsx");
const cartSrc = readSrc(
  "src/workspaces/storefront/cart/StorefrontCartShell.tsx",
);
const draftSrc = readSrc(
  "src/workspaces/storefront/checkout/preorder-draft.ts",
);
const panelSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPurchasePanel.tsx",
);

assert.match(sheetSrc, /addingRef\.current/);
assert.match(sheetSrc, /if \(!selected \|\| addingRef\.current\) return;/);
assert.match(sheetSrc, /addingRef\.current = true;/);
assert.match(sheetSrc, /setAdding\(true\)/);
assert.match(sheetSrc, /disabled=\{\!selected \|\| adding\}/);
assert.match(sheetSrc, /\{adding \? "Added ✓" : "Add"\}/);
assert.match(sheetSrc, /Added to your order/);
assert.match(sheetSrc, /mergeDraftItem/);
assert.match(sheetSrc, /quantity,/);
assert.doesNotMatch(sheetSrc, /quantity:\s*1,/);

assert.match(
  cartSrc,
  /bg-ink text-mist fixed right-0 bottom-0 left-0 z-40 flex min-h-12 flex-col/,
);
assert.match(cartSrc, /View Order →/);
assert.match(cartSrc, /Your Order/);
assert.match(
  cartSrc,
  /block w-full py-1 text-center text-sm font-semibold tracking-tight/,
);
assert.match(
  cartSrc,
  /paddingBottom: "max\(0\.5rem, env\(safe-area-inset-bottom\)\)"/,
);
assert.match(
  cartSrc,
  /h-\[calc\(4\.25rem\+env\(safe-area-inset-bottom,0px\)\)\] md:hidden/,
);
assert.match(cartSrc, /setOpen\(true\)/);
assert.doesNotMatch(cartSrc, /bg-paper\/95/);

assert.match(draftSrc, /quantity: existing\.quantity \+ item\.quantity/);
assert.match(panelSrc, /already in your order for this size/);
assert.match(
  panelSrc,
  /h-\[calc\(4\.25rem\+env\(safe-area-inset-bottom,0px\)\)\] md:hidden/,
);

assert.doesNotMatch(sheetSrc, /dine_in|DineInVenuePartyFields/);
assert.doesNotMatch(cartSrc, /dine_in|DineInVenuePartyFields/);

console.log("PASS storefront mobile add-to-order feedback");
