/**
 * Customer Delivery processing-fee acknowledgement (fixed RM5).
 * Run: npx tsx scripts/test-delivery-processing-fee-ack.ts
 *
 * Static checks only. Does not mutate catalogues, production, Fresh Picks, or EXTRA.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cakePriceAckRequired,
  cakePriceAckSatisfied,
  cakePriceAckSnapshot,
} from "@/engines/orders/cake-size-price-ack";
import { CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT } from "@/engines/orders/delivery-finance";
import {
  buildDeliveryProcessingFeeAckPayload,
  checkoutDeliveryChargesBreakdown,
  DELIVERY_FEE_PENDING_CONFIRM_LABEL,
  DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
  DELIVERY_PROCESSING_FEE_LINE_LABEL,
  deliveryProcessingFeeAckMatchesAuthority,
  deliveryProcessingFeeAckRequired,
  deliveryProcessingFeeAckSatisfied,
  deliveryProcessingFeeAckSnapshot,
  parseDeliveryProcessingFeeAckPayload,
  TOTAL_BEFORE_DELIVERY_FEE_LABEL,
} from "@/engines/orders/delivery-processing-fee-ack";
import { customerPreorderCommercialTotal } from "@/engines/orders/customer-preorder-options";
import { buildCheckoutConfirmSnapshot } from "@/workspaces/storefront/checkout/CheckoutConfirmPrompt";
import { emptyPreorderFields } from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
const promptSrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutConfirmPrompt.tsx",
);
const summarySrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx",
);
const migrationSrc = readSrc(
  "supabase/migrations/20260922180000_guest_preorder_delivery_processing_ack.sql",
);
const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const extraCheckoutSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const extraSql = readSrc(
  "supabase/migrations/20260917140000_extra_walk_in_hold.sql",
);
const freshPicksSql = readSrc(
  "supabase/migrations/20260916120000_fresh_picks_fulfilment_preparation.sql",
);
const priceAckSrc = readSrc("src/engines/orders/cake-size-price-ack.ts");
const financeSrc = readSrc("src/engines/orders/delivery-finance.ts");

assert.equal(CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT, 5);
assert.match(financeSrc, /CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT = 5/);
assert.match(migrationSrc, /current_delivery_processing_fee_default\(\)/);
assert.match(migrationSrc, /p_delivery_processing_fee_ack jsonb default null/);
assert.match(
  migrationSrc,
  /Please acknowledge the RM5 delivery processing fee before submitting your order/,
);
assert.match(
  migrationSrc.slice(0, migrationSrc.indexOf("insert into public.orders")),
  /v_method = 'delivery'/,
);
assert.match(actionsSrc, /p_delivery_processing_fee_ack/);
assert.match(actionsSrc, /DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE/);
assert.match(formSrc, /delivery_processing_fee_ack_json/);
assert.match(formSrc, /delivery_processing_fee_ack_accepted/);
assert.match(formSrc, /deliveryAckRequired && !deliveryProcessingFeeAcknowledged/);
assert.match(formSrc, /setDeliveryProcessingAckSnapshot/);
assert.doesNotMatch(formSrc, /router\.refresh/);
assert.doesNotMatch(
  formSrc.slice(
    formSrc.indexOf('name="delivery_processing_fee_ack_accepted"'),
    formSrc.indexOf('name="delivery_processing_fee_ack_accepted"') + 500,
  ),
  /loadCheckoutPickupOffer|formAction\(|router\.refresh/,
);
assert.match(formSrc, /DELIVERY_PROCESSING_FEE_SECTION_TITLE/);
assert.match(formSrc, /DELIVERY_PROCESSING_FEE_EXPLANATION/);
assert.match(formSrc, /DELIVERY_FEE_PENDING_EXPLANATION/);
assert.match(formSrc, /DELIVERY_PROCESSING_FEE_ACK_LABEL/);
assert.match(summarySrc, /DELIVERY_PROCESSING_FEE_LINE_LABEL/);
assert.match(summarySrc, /DELIVERY_FEE_PENDING_LABEL/);
assert.match(summarySrc, /TOTAL_BEFORE_DELIVERY_FEE_LABEL/);
assert.match(promptSrc, /DELIVERY_PROCESSING_FEE_LINE_LABEL/);
assert.match(promptSrc, /DELIVERY_FEE_PENDING_CONFIRM_LABEL/);
assert.match(promptSrc, /formatRm\(snapshot\.total\)/);
assert.doesNotMatch(extraActionsSrc, /p_delivery_processing_fee_ack/);
assert.doesNotMatch(extraFormSrc, /delivery-processing-fee-ack/);
assert.doesNotMatch(extraCheckoutSrc, /delivery-processing-fee-ack/);
assert.doesNotMatch(extraSql, /p_delivery_processing_fee_ack/);
assert.doesNotMatch(freshPicksSql, /p_delivery_processing_fee_ack/);
assert.doesNotMatch(
  priceAckSrc,
  /deliveryProcessingFeeAck|DELIVERY_PROCESSING_FEE_ACK/,
);

const chocolate = {
  cakeId: "choc",
  sizeId: "size-6",
  cakeName: "Chocolate",
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 120,
};

// TEST 1 — Pickup: no delivery acknowledgement required.
assert.equal(deliveryProcessingFeeAckRequired("pickup"), false);
assert.equal(
  deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: "pickup",
    acknowledgedSnapshot: "",
  }),
  true,
);
assert.deepEqual(
  deliveryProcessingFeeAckMatchesAuthority({
    payload: null,
    fulfilmentMethod: "pickup",
  }),
  { ok: true },
);
assert.equal(
  checkoutDeliveryChargesBreakdown({
    fulfilmentMethod: "pickup",
    itemsSubtotal: 120,
  }),
  null,
);

// TEST 2 — Dine-in: no delivery acknowledgement required.
assert.equal(deliveryProcessingFeeAckRequired("dine_in"), false);
assert.equal(
  deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: "dine_in",
    acknowledgedSnapshot: "",
  }),
  true,
);
assert.deepEqual(
  deliveryProcessingFeeAckMatchesAuthority({
    payload: null,
    fulfilmentMethod: "dine_in",
  }),
  { ok: true },
);

// TEST 3 — Delivery without acknowledgement: not satisfied / rejected.
assert.equal(deliveryProcessingFeeAckRequired("delivery"), true);
assert.equal(
  deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: "delivery",
    acknowledgedSnapshot: "",
  }),
  false,
);
assert.deepEqual(
  deliveryProcessingFeeAckMatchesAuthority({
    payload: null,
    fulfilmentMethod: "delivery",
  }),
  { ok: false, message: DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE },
);

// TEST 4 — Delivery with valid RM5 acknowledgement: allowed.
const validPayload = buildDeliveryProcessingFeeAckPayload();
assert.deepEqual(validPayload, {
  fulfilment_method: "delivery",
  processing_fee: 5,
});
assert.equal(
  deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: "delivery",
    acknowledgedSnapshot: deliveryProcessingFeeAckSnapshot(),
  }),
  true,
);
assert.deepEqual(
  deliveryProcessingFeeAckMatchesAuthority({
    payload: validPayload,
    fulfilmentMethod: "delivery",
  }),
  { ok: true },
);

// TEST 5 / 15 — Incorrect client fee amount cannot satisfy acknowledgement.
assert.deepEqual(
  deliveryProcessingFeeAckMatchesAuthority({
    payload: { fulfilment_method: "delivery", processing_fee: 0 },
    fulfilmentMethod: "delivery",
  }),
  { ok: false, message: DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE },
);
assert.deepEqual(
  deliveryProcessingFeeAckMatchesAuthority({
    payload: { fulfilment_method: "delivery", processing_fee: 12 },
    fulfilmentMethod: "delivery",
  }),
  { ok: false, message: DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE },
);
assert.equal(
  parseDeliveryProcessingFeeAckPayload({
    fulfilment_method: "delivery",
    processing_fee: 8,
  })?.processing_fee,
  8,
);
assert.deepEqual(
  deliveryProcessingFeeAckMatchesAuthority({
    payload: parseDeliveryProcessingFeeAckPayload({
      fulfilment_method: "delivery",
      processing_fee: 8,
    }),
    fulfilmentMethod: "delivery",
    authoritativeFee: CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
  }),
  { ok: false, message: DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE },
);

// TEST 6 — Delivery + cake price change: both acknowledgements required.
const changed = { ...chocolate, applicableUnitPrice: 130 };
assert.equal(cakePriceAckRequired([changed]), true);
assert.equal(deliveryProcessingFeeAckRequired("delivery"), true);
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-10-15",
    items: [changed],
    acknowledgedSnapshot: "",
  }),
  false,
);
assert.equal(
  deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: "delivery",
    acknowledgedSnapshot: "",
  }),
  false,
);
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-10-15",
    items: [changed],
    acknowledgedSnapshot: cakePriceAckSnapshot({
      pickupDate: "2026-10-15",
      items: [changed],
    }),
  }),
  true,
);
assert.equal(
  deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: "delivery",
    acknowledgedSnapshot: cakePriceAckSnapshot({
      pickupDate: "2026-10-15",
      items: [changed],
    }),
  }),
  false,
  "cake price snapshot must not satisfy delivery processing-fee acknowledgement",
);
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-10-15",
    items: [changed],
    acknowledgedSnapshot: deliveryProcessingFeeAckSnapshot(),
  }),
  false,
  "delivery snapshot must not satisfy cake price acknowledgement",
);

// TEST 7 — Delivery + no cake price change: only delivery acknowledgement.
const samePrice = { ...chocolate, applicableUnitPrice: 120 };
assert.equal(cakePriceAckRequired([samePrice]), false);
assert.equal(deliveryProcessingFeeAckRequired("delivery"), true);
assert.equal(
  cakePriceAckSatisfied({
    pickupDate: "2026-10-15",
    items: [samePrice],
    acknowledgedSnapshot: "",
  }),
  true,
);
assert.equal(
  deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: "delivery",
    acknowledgedSnapshot: "",
  }),
  false,
);

// TEST 8 — Cake price acknowledgement only + Pickup: delivery acknowledgement not required.
assert.equal(cakePriceAckRequired([changed]), true);
assert.equal(deliveryProcessingFeeAckRequired("pickup"), false);
assert.equal(
  deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: "pickup",
    acknowledgedSnapshot: "",
  }),
  true,
);

// TEST 9 — Delivery → Pickup: requirement disappears.
assert.equal(deliveryProcessingFeeAckRequired("delivery"), true);
assert.equal(deliveryProcessingFeeAckRequired("pickup"), false);

// TEST 10 — Pickup → Delivery: requirement appears.
assert.equal(deliveryProcessingFeeAckRequired("pickup"), false);
assert.equal(deliveryProcessingFeeAckRequired("delivery"), true);

// TEST 11 — Delivery → Pickup → Delivery: previous ack does not remain required
// as satisfied. Checkout clears snapshot when leaving Delivery.
assert.match(formSrc, /function changeFulfilment/);
assert.match(
  formSrc.slice(
    formSrc.indexOf("function changeFulfilment"),
    formSrc.indexOf("function changeDate"),
  ),
  /setDeliveryProcessingAckSnapshot\(""\)/,
);
assert.match(
  formSrc.slice(
    formSrc.indexOf("function changeDate"),
    formSrc.indexOf("const updateItem"),
  ),
  /if \(nextMethod !== currentMethod\) \{\s*setDeliveryProcessingAckSnapshot\(""\);/,
);
assert.equal(
  deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: "delivery",
    acknowledgedSnapshot: "",
  }),
  false,
);

// TEST 12 — Changing pickup date while remaining Delivery does not
// invalidate the RM5 acknowledgement (snapshot is not date-keyed).
assert.equal(deliveryProcessingFeeAckSnapshot(), "delivery|500");
assert.doesNotMatch(deliveryProcessingFeeAckSnapshot(), /2026-/);
assert.equal(
  deliveryProcessingFeeAckSatisfied({
    fulfilmentMethod: "delivery",
    acknowledgedSnapshot: deliveryProcessingFeeAckSnapshot(),
  }),
  true,
);
assert.notEqual(
  cakePriceAckSnapshot({ pickupDate: "2026-10-15", items: [changed] }),
  cakePriceAckSnapshot({ pickupDate: "2026-10-16", items: [changed] }),
);

// TEST 13 — Confirmation modal distinguishes RM5 processing fee from pending delivery fee.
const fields = emptyPreorderFields();
fields.customerName = "Delivery Ack Test";
fields.phone = "0123456789";
fields.pickupDate = "2026-10-15";
fields.pickupTime = "14:00";
fields.fulfilmentMethod = "delivery";
fields.addressLine1 = "1 Test Road";
fields.postcode = "88000";
fields.city = "Kota Kinabalu";
fields.state = "Sabah";
const itemsTotal = customerPreorderCommercialTotal({
  items: [chocolate],
  options: [],
  selectedCodes: [],
});
const deliverySnapshot = buildCheckoutConfirmSnapshot({
  items: [chocolate],
  total: itemsTotal,
  pickupDateLabel: "15 Oct 2026",
  fields,
  paidAddonOptions: [],
});
assert.equal(deliverySnapshot.fulfilmentLabel, "Delivery");
assert.equal(deliverySnapshot.total, 120);
assert.equal(deliverySnapshot.deliveryCharges?.processingFee, 5);
assert.equal(deliverySnapshot.deliveryCharges?.itemsSubtotal, 120);
assert.equal(deliverySnapshot.deliveryCharges?.totalBeforeDeliveryFee, 125);
assert.equal(DELIVERY_PROCESSING_FEE_LINE_LABEL, "Delivery processing fee");
assert.equal(DELIVERY_FEE_PENDING_CONFIRM_LABEL, "To be calculated/confirmed separately");
assert.equal(TOTAL_BEFORE_DELIVERY_FEE_LABEL, "Total before delivery fee");
assert.doesNotMatch(
  DELIVERY_PROCESSING_FEE_LINE_LABEL,
  /^Delivery fee$/i,
);
assert.notEqual(DELIVERY_PROCESSING_FEE_LINE_LABEL, "Delivery fee");
assert.match(DELIVERY_FEE_PENDING_CONFIRM_LABEL, /calculated|confirmed/i);

fields.fulfilmentMethod = "pickup";
const pickupSnapshot = buildCheckoutConfirmSnapshot({
  items: [chocolate],
  total: itemsTotal,
  pickupDateLabel: "15 Oct 2026",
  fields,
  paidAddonOptions: [],
});
assert.equal(pickupSnapshot.fulfilmentLabel, "Pickup");
assert.equal(pickupSnapshot.deliveryCharges, null);

fields.fulfilmentMethod = "dine_in";
const dineSnapshot = buildCheckoutConfirmSnapshot({
  items: [chocolate],
  total: itemsTotal,
  pickupDateLabel: "15 Oct 2026",
  fields,
  paidAddonOptions: [],
});
assert.equal(dineSnapshot.fulfilmentLabel, "Dine-in");
assert.equal(dineSnapshot.deliveryCharges, null);

// TEST 14 — Server bypass: SQL rejects Delivery before creating an order.
const validationSrc = migrationSrc.slice(
  migrationSrc.indexOf("if v_method = 'delivery' then"),
  migrationSrc.indexOf("insert into public.orders"),
);
assert.match(validationSrc, /p_delivery_processing_fee_ack is null/);
assert.match(validationSrc, /current_delivery_processing_fee_default\(\)/);
assert.match(validationSrc, /v_delivery_proc_ack_required/);
assert.doesNotMatch(
  DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
  /operator does not exist|column .* does not exist/i,
);

console.log("PASS delivery processing fee acknowledgement");
