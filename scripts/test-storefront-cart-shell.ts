/**
 * Phase 1 premium cart / order panel (static).
 * Run: npx tsx scripts/test-storefront-cart-shell.ts
 *
 * Does not mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  continueOrderingHref,
  draftEarliestCollectionYmd,
  draftLinePreorderLabel,
  draftStrongestPreorder,
  formatCartCollectionDate,
} from "@/workspaces/storefront/cart/cart-order-summary";
import { formatPreorderRequirement } from "@/workspaces/storefront/catalog/pricing";
import {
  PREORDER_DRAFT_KEY,
  emptyPreorderDraft,
  mergeDraftItem,
  preorderCheckoutHref,
  readPreorderDraft,
  removeDraftLine,
  setDraftLineQuantity,
  writePreorderDraft,
  type PreorderDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function item(
  id: string,
  days: number,
  extras: Partial<PreorderDraftItem> = {},
): PreorderDraftItem {
  return {
    cakeId: id,
    sizeId: `${id}-size`,
    quantity: 1,
    cakeName: id,
    sizeLabel: '6"',
    unitPrice: 120,
    preorderDays: days,
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

assert.equal(PREORDER_DRAFT_KEY, "whitebird-preorder-draft-v1");
assert.equal(emptyPreorderDraft().pickupDate, "");

const twoDay = item("two", 2);
const threeDay = item("three", 3);
const fourDay = item("four", 4);

assert.equal(draftLinePreorderLabel(twoDay), "2 days preorder");
assert.equal(draftLinePreorderLabel(threeDay), "3 days preorder");
assert.equal(draftLinePreorderLabel(twoDay), formatPreorderRequirement(2));
assert.equal(draftStrongestPreorder([twoDay]).days, 2);
assert.equal(draftStrongestPreorder([twoDay]).tone, "standard");
assert.equal(draftStrongestPreorder([twoDay]).varies, false);
assert.equal(draftStrongestPreorder([threeDay]).days, 3);
assert.equal(draftStrongestPreorder([threeDay]).label, "3 days preorder");
assert.equal(draftStrongestPreorder([threeDay]).tone, "longer");
assert.equal(draftStrongestPreorder([fourDay]).tone, "longer");
assert.equal(draftStrongestPreorder([twoDay, threeDay]).days, 3);
assert.equal(draftStrongestPreorder([twoDay, threeDay]).varies, true);
assert.equal(
  draftStrongestPreorder([twoDay, threeDay]).label,
  formatPreorderRequirement(3),
);

const at = new Date("2026-09-05T02:00:00.000Z");
const earliestTwo = draftEarliestCollectionYmd([twoDay], at);
const earliestThree = draftEarliestCollectionYmd([threeDay], at);
const earliestMixed = draftEarliestCollectionYmd([twoDay, threeDay], at);
assert.ok(earliestTwo && earliestThree && earliestMixed);
assert.equal(earliestThree > earliestTwo, true);
assert.equal(earliestMixed, earliestThree);
assert.equal(formatCartCollectionDate("2026-09-10"), "10 Sep");
assert.equal(formatCartCollectionDate(""), null);
assert.equal(formatCartCollectionDate("soon"), null);

assert.equal(continueOrderingHref("/browse"), "/browse");
assert.equal(continueOrderingHref("/order"), "/order");
assert.equal(
  continueOrderingHref("/order/collection/september"),
  "/order/collection/september",
);
assert.equal(continueOrderingHref("/cakes/abc"), "/browse");
assert.equal(continueOrderingHref("/"), "/browse");
assert.equal(continueOrderingHref("/extra"), "/browse");

assert.equal(preorderCheckoutHref(emptyPreorderDraft()), "/order/checkout");
assert.equal(
  preorderCheckoutHref({
    ...emptyPreorderDraft(),
    pickupScopeFrom: "2026-09-01",
    pickupScopeTo: "2026-09-30",
    pickupDate: "2026-09-12",
  }),
  "/order/checkout?from=2026-09-01&to=2026-09-30&pickup=2026-09-12",
);

const withDate = mergeDraftItem(
  { ...emptyPreorderDraft(), pickupDate: "2026-09-20" },
  twoDay,
);
assert.equal(withDate.pickupDate, "2026-09-20");
assert.equal(
  mergeDraftItem(withDate, { ...twoDay, quantity: 2 }).pickupDate,
  "2026-09-20",
);

withDraftStorage(() => {
  writePreorderDraft({
    ...emptyPreorderDraft(),
    pickupDate: "2026-09-20",
    items: [{ ...twoDay, imageUrl: "https://example.com/cake.jpg" }],
  });
  const stored = readPreorderDraft();
  assert.equal(stored?.pickupDate, "2026-09-20");
  assert.equal(stored?.items[0]?.imageUrl, "https://example.com/cake.jpg");
  const afterQty = setDraftLineQuantity(twoDay.cakeId, twoDay.sizeId, 3);
  assert.equal(afterQty.pickupDate, "2026-09-20");
  assert.equal(afterQty.items[0]?.quantity, 3);
  assert.equal(afterQty.items[0]?.imageUrl, "https://example.com/cake.jpg");
  const reread = readPreorderDraft();
  assert.equal(reread?.pickupDate, "2026-09-20");
  const afterRemove = removeDraftLine(twoDay.cakeId, twoDay.sizeId);
  assert.equal(afterRemove.pickupDate, "2026-09-20");
  assert.equal(afterRemove.items.length, 0);
  assert.equal(readPreorderDraft()?.pickupDate, "2026-09-20");
});

const cartSrc = readSrc("src/workspaces/storefront/cart/StorefrontCartShell.tsx");
const summarySrc = readSrc(
  "src/workspaces/storefront/cart/cart-order-summary.ts",
);
assert.match(cartSrc, /md:fixed md:inset-y-0 md:right-0/);
assert.match(cartSrc, /createPortal/);
assert.match(cartSrc, /document\.body/);
assert.match(cartSrc, /marginRight/);
assert.doesNotMatch(cartSrc, /paddingRight/);
assert.match(cartSrc, /md:hidden/);
assert.match(cartSrc, /h-dvh/);
assert.doesNotMatch(cartSrc, /85dvh/);
assert.match(cartSrc, /View My Order/);
assert.match(cartSrc, /Continue Ordering/);
assert.match(cartSrc, /continueOrderingHref/);
assert.match(cartSrc, /preorderCheckoutHref/);
assert.match(cartSrc, /View Order →/);
assert.match(cartSrc, /Collection date/);
assert.match(cartSrc, /Earliest collection/);
assert.match(cartSrc, /draftStrongestPreorder/);
assert.match(cartSrc, /setDraftLineQuantity/);
assert.match(cartSrc, /setDraftLineSize/);
assert.match(cartSrc, /removeDraftLine/);
assert.match(cartSrc, /draftItemShowsSizeEditor/);
assert.match(cartSrc, /Change Collection Date/);
assert.match(cartSrc, /Keep Editing/);
assert.match(cartSrc, /checkoutBlocked/);
assert.match(summarySrc, /formatPreorderRequirement/);
assert.match(summarySrc, /cartEarliestCollectionDate/);
assert.match(summarySrc, /evaluateCollectionDate/);
assert.match(summarySrc, /return "\/browse"/);
assert.doesNotMatch(cartSrc, /Continue to preorder/);
assert.doesNotMatch(cartSrc, /Submit Preorder/);
assert.doesNotMatch(cartSrc, /Proceed to Payment/);
assert.doesNotMatch(cartSrc, /Review Order/);
assert.doesNotMatch(cartSrc, /submitGuestPreorderAction/);
assert.doesNotMatch(cartSrc, /pickupDate:/);
assert.doesNotMatch(cartSrc, /writePreorderDraft/);

const draftSrc = readSrc("src/workspaces/storefront/checkout/preorder-draft.ts");
assert.match(draftSrc, /whitebird-preorder-draft-v1/);
const sizeFn = draftSrc.slice(
  draftSrc.indexOf("/** Size/price/preorder/image only."),
  draftSrc.indexOf("/** Quantity only."),
);
const qtyFn = draftSrc.slice(
  draftSrc.indexOf("/** Quantity only."),
  draftSrc.indexOf("/** Remove one cake+size line."),
);
const removeFn = draftSrc.slice(
  draftSrc.indexOf("/** Remove one cake+size line."),
  draftSrc.indexOf("export function draftHasItems"),
);
assert.match(sizeFn, /Does not change collection date/);
assert.match(qtyFn, /Does not change collection date/);
assert.match(removeFn, /Does not change collection date/);
assert.doesNotMatch(sizeFn, /pickupDate:/);
assert.doesNotMatch(qtyFn, /pickupDate:/);
assert.doesNotMatch(removeFn, /pickupDate:/);

const addSrc = readSrc("src/workspaces/storefront/cart/AddToOrderSheet.tsx");
assert.match(addSrc, /imageUrl/);
assert.doesNotMatch(addSrc, /engines\/preorder/);
assert.doesNotMatch(addSrc, /Continue to preorder/);

const extraPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
const extraOrderSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
assert.doesNotMatch(extraPageSrc, /StorefrontCartShell/);
assert.doesNotMatch(extraPageSrc, /PreorderInProgressBar/);
assert.doesNotMatch(extraOrderSrc, /StorefrontCartShell/);
assert.doesNotMatch(extraOrderSrc, /PreorderInProgressBar/);
assert.doesNotMatch(readSrc("src/app/extra/page.tsx"), /PreorderInProgressBar/);
assert.doesNotMatch(
  readSrc("src/app/extra/[id]/page.tsx"),
  /PreorderInProgressBar/,
);

const orderAppDir = resolve(process.cwd(), "src/app/order");
const orderFiles = existsSync(orderAppDir)
  ? readdirSync(orderAppDir, { recursive: true }).map(String)
  : [];
assert.equal(
  orderFiles.some((name) => name.toLowerCase().includes("review")),
  false,
  "no Review Order route",
);
assert.equal(existsSync(resolve(process.cwd(), "src/app/order/review")), false);

assert.match(cartSrc, /z-\[60\]/);
assert.match(cartSrc, /bg-ink\/40/);
assert.match(cartSrc, /role="dialog"/);
assert.match(cartSrc, /aria-modal="true"/);
assert.match(cartSrc, /Close order/);
assert.doesNotMatch(cartSrc, /showModal/);
assert.doesNotMatch(cartSrc, /<dialog/);

console.log("PASS storefront cart shell");
