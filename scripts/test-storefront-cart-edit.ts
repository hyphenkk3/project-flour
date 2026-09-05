/**
 * Phase 2 in-cart size editing and collection-date integrity (static).
 * Run: npx tsx scripts/test-storefront-cart-edit.ts
 *
 * Does not mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cartInvalidCollectionDateCopy,
  draftEarliestCollectionYmd,
  draftItemShowsSizeEditor,
  draftItemSizeChoices,
  draftStrongestPreorder,
  evaluateDraftSelectedCollectionDate,
  isDraftCheckoutBlockedByCollectionDate,
} from "@/workspaces/storefront/cart/cart-order-summary";
import { formatPreorderRequirement } from "@/workspaces/storefront/catalog/pricing";
import {
  PREORDER_DRAFT_KEY,
  emptyPreorderDraft,
  readPreorderDraft,
  removeDraftLine,
  setDraftLineQuantity,
  setDraftLineSize,
  writePreorderDraft,
  type PreorderDraftItem,
  type PreorderDraftSizeChoice,
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

const twoInch: PreorderDraftSizeChoice = {
  id: "avo-6",
  size: '6"',
  price: 135,
  preorderDays: 2,
  imageUrl: "https://example.com/avo-6.jpg",
};
const threeInch: PreorderDraftSizeChoice = {
  id: "avo-8",
  size: '8"',
  price: 185,
  preorderDays: 3,
  imageUrl: "https://example.com/avo-8.jpg",
};

const avocado = item("avocado", 2, {
  sizeId: twoInch.id,
  sizeLabel: twoInch.size,
  unitPrice: twoInch.price,
  imageUrl: twoInch.imageUrl,
  sizeChoices: [twoInch, threeInch],
});
const single = item("single", 2, {
  sizeChoices: [
    {
      id: "single-size",
      size: '6"',
      price: 95,
      preorderDays: 2,
    },
  ],
});

assert.equal(draftItemShowsSizeEditor(avocado, null), true);
assert.equal(draftItemShowsSizeEditor(single, null), false);
assert.equal(draftItemSizeChoices(single, null).length, 1);
assert.equal(
  draftItemShowsSizeEditor(item("plain", 2), {
    id: "plain",
    name: "plain",
    description: null,
    categoryId: null,
    categoryName: null,
    categoryActive: true,
    categorySortOrder: 0,
    image: null,
    photos: [],
    sharingGuide: null,
    allergens: [],
    sizes: [
      {
        id: "a",
        cakeId: "plain",
        size: '4"',
        price: 75,
        sortOrder: 0,
        preorderDays: 2,
      },
      {
        id: "b",
        cakeId: "plain",
        size: '6"',
        price: 125,
        sortOrder: 1,
        preorderDays: 3,
      },
    ],
  }),
  true,
);

const at = new Date("2026-09-05T02:00:00.000Z");
const twoDay = item("two", 2);
const threeDay = item("three", 3);
const earliestTwo = draftEarliestCollectionYmd([twoDay], at);
const earliestThree = draftEarliestCollectionYmd([threeDay], at);
assert.ok(earliestTwo && earliestThree);
assert.equal(earliestThree > earliestTwo, true);

const validEval = evaluateDraftSelectedCollectionDate(
  { pickupDate: earliestTwo!, items: [twoDay] },
  at,
);
assert.equal(validEval?.valid, true);
assert.equal(
  isDraftCheckoutBlockedByCollectionDate(
    { pickupDate: earliestTwo!, items: [twoDay] },
    at,
  ),
  false,
);

const invalidEval = evaluateDraftSelectedCollectionDate(
  { pickupDate: earliestTwo!, items: [threeDay] },
  at,
);
assert.equal(invalidEval?.valid, false);
assert.equal(invalidEval?.reason.code, "before_preorder");
assert.equal(
  isDraftCheckoutBlockedByCollectionDate(
    { pickupDate: earliestTwo!, items: [threeDay] },
    at,
  ),
  true,
);
assert.equal(
  evaluateDraftSelectedCollectionDate(
    { pickupDate: earliestTwo!, items: [twoDay, threeDay] },
    at,
  )?.valid,
  false,
);

const mixed = draftStrongestPreorder([twoDay, threeDay]);
assert.equal(mixed.days, 3);
assert.equal(mixed.label, formatPreorderRequirement(3));
assert.equal(draftStrongestPreorder([twoDay]).days, 2);
assert.equal(
  draftEarliestCollectionYmd([twoDay, threeDay], at),
  earliestThree,
);

const copy = cartInvalidCollectionDateCopy(
  {
    pickupDate: earliestTwo!,
    items: [{ ...threeDay, cakeName: "Avocado", sizeLabel: '6"' }],
  },
  invalidEval!,
);
assert.equal(copy.title, "Your collection date needs updating");
assert.match(copy.explanation, /Avocado/);
assert.match(copy.explanation, /6"/);
assert.match(copy.explanation, /3 days preorder/);
assert.match(copy.explanation, /no longer available/);
assert.ok(copy.earliestLabel);

withDraftStorage(() => {
  writePreorderDraft({
    ...emptyPreorderDraft(),
    pickupDate: earliestTwo!,
    items: [avocado],
  });
  const afterQty = setDraftLineQuantity(avocado.cakeId, avocado.sizeId, 3);
  assert.equal(afterQty.pickupDate, earliestTwo);
  assert.equal(afterQty.items[0]?.quantity, 3);
  assert.equal(afterQty.items[0]?.unitPrice, 135);
  assert.equal(
    (afterQty.items[0]?.unitPrice ?? 0) * (afterQty.items[0]?.quantity ?? 0),
    405,
  );

  const afterSize = setDraftLineSize(avocado.cakeId, twoInch.id, threeInch);
  assert.equal(afterSize.pickupDate, earliestTwo);
  assert.equal(afterSize.items[0]?.sizeId, threeInch.id);
  assert.equal(afterSize.items[0]?.sizeLabel, '8"');
  assert.equal(afterSize.items[0]?.unitPrice, 185);
  assert.equal(afterSize.items[0]?.preorderDays, 3);
  assert.equal(afterSize.items[0]?.imageUrl, threeInch.imageUrl);
  assert.equal(afterSize.items[0]?.quantity, 3);
  assert.equal(
    isDraftCheckoutBlockedByCollectionDate(afterSize, at),
    true,
  );
  const storedInvalid = readPreorderDraft();
  assert.equal(storedInvalid?.pickupDate, earliestTwo);
  assert.equal(storedInvalid?.items[0]?.sizeId, threeInch.id);

  const restored = setDraftLineSize(avocado.cakeId, threeInch.id, twoInch);
  assert.equal(restored.pickupDate, earliestTwo);
  assert.equal(restored.items[0]?.preorderDays, 2);
  assert.equal(
    isDraftCheckoutBlockedByCollectionDate(restored, at),
    false,
  );

  writePreorderDraft({
    ...emptyPreorderDraft(),
    pickupDate: earliestTwo!,
    items: [
      { ...avocado, sizeId: twoInch.id, preorderDays: 2, unitPrice: 135 },
      {
        ...avocado,
        cakeId: "other",
        sizeId: "other-6",
        cakeName: "other",
        preorderDays: 3,
        unitPrice: 95,
      },
    ],
  });
  assert.equal(
    isDraftCheckoutBlockedByCollectionDate(readPreorderDraft()!, at),
    true,
  );
  const afterRemove = removeDraftLine("other", "other-6");
  assert.equal(afterRemove.pickupDate, earliestTwo);
  assert.equal(afterRemove.items.length, 1);
  assert.equal(
    isDraftCheckoutBlockedByCollectionDate(afterRemove, at),
    false,
  );
});

withDraftStorage(() => {
  writePreorderDraft({
    ...emptyPreorderDraft(),
    pickupDate: "2026-09-20",
    items: [
      { ...avocado, quantity: 1 },
      {
        ...avocado,
        sizeId: threeInch.id,
        sizeLabel: threeInch.size,
        unitPrice: threeInch.price,
        preorderDays: 3,
        imageUrl: threeInch.imageUrl,
        quantity: 2,
      },
    ],
  });
  const merged = setDraftLineSize(avocado.cakeId, threeInch.id, twoInch);
  assert.equal(merged.pickupDate, "2026-09-20");
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0]?.sizeId, twoInch.id);
  assert.equal(merged.items[0]?.quantity, 3);
});

const cartSrc = readSrc("src/workspaces/storefront/cart/StorefrontCartShell.tsx");
assert.match(cartSrc, /setDraftLineSize/);
assert.match(cartSrc, /draftItemShowsSizeEditor/);
assert.match(cartSrc, /Change Collection Date/);
assert.match(cartSrc, /Keep Editing/);
assert.match(cartSrc, /disabled/);
assert.match(cartSrc, /createPortal/);
assert.match(cartSrc, /md:fixed md:inset-y-0 md:right-0/);
assert.match(cartSrc, /h-dvh/);
assert.doesNotMatch(cartSrc, /GuestCheckoutForm/);
assert.doesNotMatch(cartSrc, /Review Order/);
assert.doesNotMatch(cartSrc, /submitGuestPreorderAction/);
assert.doesNotMatch(readSrc("src/workspaces/storefront/cart/AddToOrderSheet.tsx"), /engines\/preorder/);
assert.match(readSrc("src/workspaces/storefront/cart/AddToOrderSheet.tsx"), /sizeChoices/);

assert.doesNotMatch(
  readSrc("src/workspaces/storefront/home/StorefrontExtraPage.tsx"),
  /loadCartEditCakes/,
);
assert.doesNotMatch(
  readSrc("src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx"),
  /StorefrontCartShell/,
);

const orderFiles = existsSync(resolve(process.cwd(), "src/app/order"))
  ? readdirSync(resolve(process.cwd(), "src/app/order"), { recursive: true }).map(
      String,
    )
  : [];
assert.equal(
  orderFiles.some((name) => name.toLowerCase().includes("review")),
  false,
);

console.log("PASS storefront cart edit");
