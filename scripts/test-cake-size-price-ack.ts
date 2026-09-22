/**
 * Phase 2A customer quote vs pickup-date cake-size price acknowledgement.
 * Run: npx tsx scripts/test-cake-size-price-ack.ts
 *
 * Static checks always run. Does not mutate catalogues or production.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyApplicableUnitPrices,
  buildCakePriceAckPayload,
  CAKE_PRICE_ACK_REQUIRED_MESSAGE,
  CAKE_PRICE_ACK_STALE_MESSAGE,
  cakePriceAckRequired,
  cakePriceAckSatisfied,
  cakePriceAckSnapshot,
  cakePriceChangeLines,
  chargedDraftItemUnitPrice,
  quotedDraftItemUnitPrice,
} from "@/engines/orders/cake-size-price-ack";
import { customerPreorderCommercialTotal } from "@/engines/orders/customer-preorder-options";
import { filterDraftItemsToOfferedCakes } from "@/workspaces/storefront/checkout/preorder-draft";
import { buildCheckoutConfirmSnapshot } from "@/workspaces/storefront/checkout/CheckoutConfirmPrompt";
import { emptyPreorderFields } from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const formSrc = readSrc("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
const draftSrc = readSrc("src/workspaces/storefront/checkout/preorder-draft.ts");
const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
const summarySrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx",
);
const ackSrc = readSrc("src/engines/orders/cake-size-price-ack.ts");
const migrationSrc = readSrc(
  "supabase/migrations/20260922140000_guest_preorder_price_ack.sql",
);
const extraSql = readSrc(
  "supabase/migrations/20260917140000_extra_walk_in_hold.sql",
);
const freshPicksSql = readSrc(
  "supabase/migrations/20260916120000_fresh_picks_fulfilment_preparation.sql",
);
const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const extraCheckoutSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const addToOrderSrc = readSrc(
  "src/workspaces/storefront/cart/AddToOrderSheet.tsx",
);

assert.match(ackSrc, /quotedDraftItemUnitPrice/);
assert.match(ackSrc, /chargedDraftItemUnitPrice/);
assert.match(ackSrc, /cakePriceAckSnapshot/);
assert.match(formSrc, /resolveCheckoutCakeSizePrices/);
assert.match(formSrc, /Price updated for your selected pickup date/);
assert.match(
  formSrc,
  /I understand and accept the updated prices for my selected pickup date/,
);
assert.match(formSrc, /price_ack_json/);
assert.match(formSrc, /ackRequired && !pricesAcknowledged/);
assert.match(formSrc, /applicableUnitPrice: undefined/);
assert.match(formSrc, /unitPrice: size.price/);
assert.match(formSrc, /unitPrice: liveSize.price/);
const offerRefreshSrc = formSrc.slice(
  formSrc.indexOf("void loadCheckoutPickupOffer"),
  formSrc.indexOf("setResolvedOfferDate"),
);
assert.doesNotMatch(offerRefreshSrc, /unitPrice: size\.price/);
assert.doesNotMatch(formSrc, /window\.alert/);
assert.match(draftSrc, /Keeps the quoted/);
assert.match(actionsSrc, /p_price_ack/);
assert.match(actionsSrc, /library_cake_size_price_on/);
assert.match(actionsSrc, /CAKE_PRICE_ACK_STALE_MESSAGE/);
assert.match(summarySrc, /chargedDraftItemUnitPrice/);
assert.match(migrationSrc, /p_price_ack jsonb default null/);
assert.match(migrationSrc, /v_applicable := public.library_cake_size_price_on/);
assert.match(
  migrationSrc,
  /The prices for your selected pickup date have changed/,
);
assert.doesNotMatch(
  migrationSrc.slice(
    migrationSrc.indexOf("insert into public.order_items"),
    migrationSrc.indexOf("item_count := item_count + 1"),
  ),
  /size_row\.price/,
);
assert.doesNotMatch(extraSql, /p_price_ack/);
assert.doesNotMatch(freshPicksSql, /p_price_ack/);
assert.doesNotMatch(extraActionsSrc, /p_price_ack/);
assert.doesNotMatch(extraFormSrc, /cake-size-price-ack/);
assert.doesNotMatch(extraCheckoutSrc, /cake-size-price-ack/);
assert.doesNotMatch(addToOrderSrc, /applicableUnitPrice/);

const chocolate = {
  cakeId: "choc",
  sizeId: "size-6",
  cakeName: "Chocolate",
  sizeLabel: '6"',
  quantity: 2,
  unitPrice: 120,
};

const matcha = {
  cakeId: "matcha",
  sizeId: "size-m",
  cakeName: "Matcha",
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 150,
  applicableUnitPrice: 150,
};

const earl = {
  cakeId: "earl",
  sizeId: "size-e",
  cakeName: "Earl Grey",
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 140,
  applicableUnitPrice: 145,
};

// TEST A — same price: no notice, no acknowledgement, submit allowed.
const samePrice = { ...chocolate, applicableUnitPrice: 120 };
assert.equal(quotedDraftItemUnitPrice(samePrice), 120);
assert.equal(chargedDraftItemUnitPrice(samePrice), 120);
assert.equal(cakePriceAckRequired([samePrice]), false);
assert.deepEqual(cakePriceChangeLines([samePrice]), []);
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-09-25",
    items: [samePrice],
    acknowledgedSnapshot: "",
  }),
  true,
);
assert.equal(
  customerPreorderCommercialTotal({
    items: [
      {
        unitPrice: chargedDraftItemUnitPrice(samePrice),
        quantity: samePrice.quantity,
      },
    ],
    options: [],
    selectedCodes: [],
  }),
  240,
);

// TEST B — price increase: notice, total uses applicable, ack required.
const increased = { ...chocolate, applicableUnitPrice: 130 };
assert.equal(cakePriceAckRequired([increased]), true);
assert.deepEqual(cakePriceChangeLines([increased]), [
  {
    sizeId: "size-6",
    cakeName: "Chocolate",
    sizeLabel: '6"',
    quantity: 2,
    quotedUnitPrice: 120,
    applicableUnitPrice: 130,
  },
]);
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-10-01",
    items: [increased],
    acknowledgedSnapshot: "",
  }),
  false,
);
const octoberSnapshot = cakePriceAckSnapshot({
  pickupDate: "2026-10-01",
  items: [increased],
});
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-10-01",
    items: [increased],
    acknowledgedSnapshot: octoberSnapshot,
  }),
  true,
);
assert.equal(
  customerPreorderCommercialTotal({
    items: [
      {
        unitPrice: chargedDraftItemUnitPrice(increased),
        quantity: increased.quantity,
      },
    ],
    options: [],
    selectedCodes: [],
  }),
  260,
);
assert.match(CAKE_PRICE_ACK_REQUIRED_MESSAGE, /updated prices/);

// TEST C — price decrease still requires acknowledgement.
const decreased = { ...chocolate, applicableUnitPrice: 110, quantity: 1 };
assert.equal(cakePriceAckRequired([decreased]), true);
assert.equal(cakePriceChangeLines([decreased])[0]?.applicableUnitPrice, 110);
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-10-01",
    items: [decreased],
    acknowledgedSnapshot: "",
  }),
  false,
);
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-10-01",
    items: [decreased],
    acknowledgedSnapshot: cakePriceAckSnapshot({
      pickupDate: "2026-10-01",
      items: [decreased],
    }),
  }),
  true,
);

// TEST D — multiple lines: only changed cakes appear; one snapshot.
const mixed = [
  { ...chocolate, quantity: 1, applicableUnitPrice: 130 },
  matcha,
  earl,
];
const changed = cakePriceChangeLines(mixed);
assert.equal(changed.length, 2);
assert.deepEqual(
  changed.map((line) => line.cakeName),
  ["Chocolate", "Earl Grey"],
);
assert.equal(cakePriceAckRequired(mixed), true);
const mixedSnapshot = cakePriceAckSnapshot({
  pickupDate: "2026-10-01",
  items: mixed,
});
assert.match(mixedSnapshot, /size-6/);
assert.match(mixedSnapshot, /size-e/);
assert.doesNotMatch(mixedSnapshot, /size-m/);
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-10-01",
    items: mixed,
    acknowledgedSnapshot: mixedSnapshot,
  }),
  true,
);

// TEST E — October ack does not survive a September date that matches quote.
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-09-25",
    items: [samePrice],
    acknowledgedSnapshot: octoberSnapshot,
  }),
  true,
);
assert.equal(cakePriceAckRequired([samePrice]), false);

// TEST F — October ack is invalid for November's different price.
const november = { ...chocolate, quantity: 1, applicableUnitPrice: 135 };
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-11-01",
    items: [november],
    acknowledgedSnapshot: octoberSnapshot,
  }),
  false,
);
assert.equal(cakePriceChangeLines([november])[0]?.applicableUnitPrice, 135);

// TEST G — size change uses the new size quote, not the old 6" quote.
const size4Quote = {
  cakeId: "choc",
  sizeId: "size-4",
  cakeName: "Chocolate",
  sizeLabel: '4"',
  quantity: 1,
  unitPrice: 90,
  applicableUnitPrice: 90,
};
assert.equal(quotedDraftItemUnitPrice(size4Quote), 90);
assert.equal(cakePriceAckRequired([size4Quote]), false);
const size4Scheduled = { ...size4Quote, applicableUnitPrice: 95 };
assert.equal(quotedDraftItemUnitPrice(size4Scheduled), 90);
assert.equal(chargedDraftItemUnitPrice(size4Scheduled), 95);
assert.equal(cakePriceAckRequired([size4Scheduled]), true);

// TEST L — pre-Phase-2 draft with only unitPrice still quotes correctly.
const legacyDraft = {
  cakeId: "choc",
  sizeId: "size-6",
  cakeName: "Chocolate",
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 120,
};
assert.equal(quotedDraftItemUnitPrice(legacyDraft), 120);
assert.equal(chargedDraftItemUnitPrice(legacyDraft), 120);
const filtered = filterDraftItemsToOfferedCakes(
  [legacyDraft],
  [
    {
      id: "choc",
      name: "Chocolate",
      sizes: [{ id: "size-6", size: '6"', price: 999, preorderDays: 2 }],
    },
  ],
);
assert.equal(filtered.items[0]?.unitPrice, 120);
assert.equal(filtered.dropped, false);

const withAlias = quotedDraftItemUnitPrice({
  sizeId: "size-6",
  unitPrice: 999,
  quotedUnitPrice: 120,
});
assert.equal(withAlias, 120);

const priced = applyApplicableUnitPrices([legacyDraft], {
  "size-6": 130,
});
assert.equal(priced[0]?.unitPrice, 120);
assert.equal(priced[0]?.applicableUnitPrice, 130);

const payload = buildCakePriceAckPayload({
  pickupDate: "2026-10-01",
  items: priced,
});
assert.equal(payload.pickup_date, "2026-10-01");
assert.equal(payload.lines[0]?.quoted_unit_price, 120);
assert.equal(payload.lines[0]?.acknowledged_unit_price, 130);

const confirm = buildCheckoutConfirmSnapshot({
  items: priced,
  total: 130,
  pickupDateLabel: "1 Oct 2026",
  fields: emptyPreorderFields(),
  paidAddonOptions: [],
});
assert.equal(confirm.lines[0]?.linePrice, 130);
assert.equal(CAKE_PRICE_ACK_STALE_MESSAGE.includes("changed"), true);

console.log("PASS cake size price acknowledgement (static)");
