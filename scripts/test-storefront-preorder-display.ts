/**
 * Phase 4.2.2 — catalogue preorder display (display only).
 * Run: npx tsx scripts/test-storefront-preorder-display.ts
 *
 * Static only. Does not mutate Library cakes or production data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StorefrontCake, StorefrontCakeSize } from "@/types/storefront";
import {
  PREORDER_VARIES_BY_SIZE_LABEL,
  cakeCardPreorderLabel,
  formatPreorderRequirement,
} from "@/workspaces/storefront/catalog/pricing";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function size(
  id: string,
  days: number,
  label = '6"',
): StorefrontCakeSize {
  return {
    id,
    cakeId: "cake-1",
    size: label,
    price: 120,
    sortOrder: 0,
    preorderDays: days,
  };
}

function cakeWithSizes(sizes: StorefrontCakeSize[]): Pick<StorefrontCake, "sizes"> {
  return { sizes };
}

assert.equal(formatPreorderRequirement(2), "2 days preorder");
assert.equal(formatPreorderRequirement(3), "3 days preorder");
assert.equal(formatPreorderRequirement(1), "1 day preorder");

assert.equal(
  cakeCardPreorderLabel(cakeWithSizes([size("a", 2), size("b", 2, '8"')])),
  "2 days preorder",
  "A. all sizes 2 days → 2-day preorder",
);
assert.equal(
  cakeCardPreorderLabel(cakeWithSizes([size("a", 3), size("b", 3, '8"')])),
  "3 days preorder",
  "B. all sizes 3 days → 3-day preorder",
);
assert.equal(
  cakeCardPreorderLabel(cakeWithSizes([size("a", 2), size("b", 3, '8"')])),
  PREORDER_VARIES_BY_SIZE_LABEL,
  "C. mixed sizes do not imply a universal requirement",
);
assert.notEqual(
  cakeCardPreorderLabel(cakeWithSizes([size("a", 2), size("b", 3, '8"')])),
  formatPreorderRequirement(2),
);
assert.notEqual(
  cakeCardPreorderLabel(cakeWithSizes([size("a", 2), size("b", 3, '8"')])),
  formatPreorderRequirement(3),
);
assert.equal(cakeCardPreorderLabel(cakeWithSizes([])), null);
assert.equal(
  cakeCardPreorderLabel(cakeWithSizes([size("only", 2)])),
  "2 days preorder",
);

const cardSrc = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
assert.match(cardSrc, /cakeCardPreorderLabel/);
assert.match(cardSrc, /uppercase/);
assert.doesNotMatch(cardSrc, /evaluateCollectionDate/);
assert.doesNotMatch(cardSrc, /earliestCollectionDateForDays/);
assert.doesNotMatch(cardSrc, /engines\/preorder/);

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
assert.match(collectionSrc, /StorefrontCakeCard/);
assert.doesNotMatch(collectionSrc, /formatPreorderRequirement/);
assert.doesNotMatch(collectionSrc, /cakeCardPreorderLabel/);

const sheetSrc = readSrc("src/workspaces/storefront/cart/AddToOrderSheet.tsx");
assert.match(sheetSrc, /formatPreorderRequirement\(size\.preorderDays\)/);
assert.doesNotMatch(sheetSrc, /evaluateCollectionDate/);
assert.doesNotMatch(sheetSrc, /cakeCardPreorderLabel/);

const panelSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPurchasePanel.tsx",
);
assert.match(panelSrc, /formatPreorderRequirement\(size\.preorderDays\)/);
assert.doesNotMatch(panelSrc, /evaluateCollectionDate/);

const pricingSrc = readSrc("src/workspaces/storefront/catalog/pricing.ts");
assert.match(pricingSrc, /Display-only/);
assert.doesNotMatch(pricingSrc, /evaluateCollectionDate/);
assert.doesNotMatch(pricingSrc, /engines\/preorder/);

console.log("PASS storefront preorder display");
