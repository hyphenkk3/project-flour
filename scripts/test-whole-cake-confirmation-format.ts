/**
 * Whole Cake customer confirmation format (pickup / delivery / dine-in).
 * Run: npx tsx scripts/test-whole-cake-confirmation-format.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CUSTOMER_DELIVERY_ORDER_MARKER,
  CUSTOMER_DINE_IN_ORDER_MARKER,
  CUSTOMER_ORDER_TYPE_COLOUR,
  CUSTOMER_PICKUP_ORDER_MARKER,
  DINE_IN_RESERVATION_INCLUDED_COPY,
  buildConfirmationPayload,
  formatCustomerConfirmationComplimentaryLine,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import { generateCrewOrderMessage } from "@/engines/orders/messages";
import type { StorefrontOrder, StorefrontOrderDelivery } from "@/types/storefront";

function payload(
  overrides: Partial<Parameters<typeof buildConfirmationPayload>[0]> = {},
) {
  return buildConfirmationPayload({
    staffCustomerFacingName: "Wee",
    customerName: "Sophie Ten",
    customerPhone: "0166513513",
    pickupDate: "2026-07-30",
    pickupTime: "15:00",
    items: [
      {
        cakeName: "Japanese Strawberry",
        sizeLabel: '4"',
        quantity: 1,
        unitPrice: 78,
      },
      {
        cakeName: "Pistachio Mango Crescendo",
        sizeLabel: '6"',
        quantity: 1,
        unitPrice: 135,
      },
    ],
    complimentaryItems: [
      { name: "Birthday Topper", quantity: 2 },
      { name: "Candle", quantity: 2 },
      { name: "Knife", quantity: 2 },
    ],
    subtotal: 213,
    adjustments: [],
    amountDue: 213,
    fulfilmentMethod: "pickup",
    ...overrides,
  });
}

function assertNoCustomerInternalShorthand(body: string) {
  assert.doesNotMatch(body, /\(jw\)/);
  assert.doesNotMatch(body, /WB QR/);
  assert.doesNotMatch(body, /\bc\/o\b/);
  assert.doesNotMatch(body, /\bNYP\b/);
}

{
  const body = generateConfirmationMessage(payload());
  assert.ok(body.includes(`${CUSTOMER_PICKUP_ORDER_MARKER} 30/7 (Thu)`));
  assert.ok(body.includes("Ordered by: Sophie Ten"));
  assert.ok(body.includes("Phone No: 0166513513"));
  assert.ok(body.includes("Time: 3:00 PM"));
  assert.ok(body.includes('~ Japanese Strawberry 4" x1'));
  assert.ok(body.includes('~ Pistachio Mango Crescendo 6" x1'));
  assert.ok(
    body.includes(
      "*Complimentary (Birthday Topper x1, Candle x1, Knife x1) × 2 sets",
    ),
  );
  assert.ok(body.includes(CUSTOMER_ORDER_TYPE_COLOUR));
  assert.ok(!body.includes("🟡"));
  assert.ok(!body.includes("🟣"));
  assert.ok(!body.includes("🔵"));
  assertNoCustomerInternalShorthand(body);
}

{
  const delivery = {
    recipientName: "Sophie Ten",
    recipientPhone: "0166513513",
    addressLine1: "123 Test Road",
    addressLine2: null,
    postcode: "88100",
    city: "Kota Kinabalu",
    state: "Sabah",
    recipientNotifyPreference: "inform_recipient",
  } as StorefrontOrderDelivery;
  const body = generateConfirmationMessage(
    payload({ fulfilmentMethod: "delivery", delivery }),
  );
  assert.ok(body.includes(`${CUSTOMER_DELIVERY_ORDER_MARKER} 30/7 (Thu)`));
  assert.ok(body.includes("123 Test Road"));
  assert.ok(body.includes("88100"));
  assert.ok(!body.includes("quoted_waived"));
  assert.ok(!body.includes("financeEnabled"));
  assertNoCustomerInternalShorthand(body);
}

{
  const body = generateConfirmationMessage(
    payload({
      fulfilmentMethod: "dine_in",
      dineInReservation: {
        reservationDate: "2026-07-30",
        reservationTime: "14:30",
        venue: "whitebird",
        guestCount: 4,
        reservationNote: null,
        status: "pending",
      },
    }),
  );
  assert.ok(body.includes(`${CUSTOMER_DINE_IN_ORDER_MARKER} 30/7 (Thu)`));
  assert.ok(body.includes("Cake serving time: 3:00 PM"));
  assert.ok(body.includes("* Dine-in reservation: 2:30 PM @ Whitebird"));
  assert.ok(body.includes("* Guests: 4"));
  assert.ok(body.includes(DINE_IN_RESERVATION_INCLUDED_COPY));
  assert.ok(!body.includes("pending"));
  assert.ok(!body.includes("Venue: Whitebird"));
  assertNoCustomerInternalShorthand(body);
}

assert.equal(
  formatCustomerConfirmationComplimentaryLine([
    { name: "Birthday Topper", quantity: 1 },
    { name: "Candle", quantity: 1 },
  ]),
  "*Complimentary Birthday Topper x1, Candle x1",
);
assert.equal(
  formatCustomerConfirmationComplimentaryLine([
    { name: "Birthday Topper", quantity: 2 },
    { name: "Candle", quantity: 2 },
    { name: "Knife", quantity: 2 },
  ]),
  "*Complimentary (Birthday Topper x1, Candle x1, Knife x1) × 2 sets",
);

{
  const crew = generateCrewOrderMessage({
    customerName: "Sophie Ten",
    phone: "0166513513",
    pickupDate: "2026-07-30",
    pickupTime: "15:00",
    pickupInstruction: null,
    fulfilmentMethod: "dine_in",
    orderSource: "jotform",
    crewOrder: false,
    includeReceipt: false,
    dineInReservation: {
      reservationDate: "2026-07-30",
      reservationTime: "14:30",
      venue: "hyphen",
      guestCount: 4,
      reservationNote: null,
      status: "pending",
    },
    items: [
      {
        cakeName: "Japanese Strawberry",
        sizeLabel: '4"',
        quantity: 1,
        unitPrice: 78,
      },
    ],
    complimentaryItems: [],
    paidAddons: [],
    adjustments: [],
    paymentAllocations: [],
    settlement: {
      subtotal: 78,
      amountDue: 78,
      netReceived: 78,
      remainingBalance: 0,
      overpayment: 0,
    },
  } as StorefrontOrder);
  assert.ok(crew.includes("🟢🍽️ Dine-In order: 30/7 (Thu)"));
  assert.ok(crew.includes("Ordered by: Sophie Ten (jw)"));
  assert.ok(crew.includes("Cake serving time: 3pm"));
  assert.ok(crew.includes("* Dine-in reservation: 2:30 PM @ Hyphen"));
  assert.ok(crew.includes("* Guests: 4"));
  assert.ok(crew.includes("* Reservation status: pending"));
}

const thankYouSrc = readFileSync(
  resolve("src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx"),
  "utf8",
);
assert.match(thankYouSrc, /Dine-in reservation time/);
assert.match(thankYouSrc, /receipt\.reservationTime/);
assert.match(thankYouSrc, /dineInVenueLabel/);
assert.match(thankYouSrc, /Guests/);

const workspaceSrc = readFileSync(
  resolve("src/workspaces/owner/orders/OrderWorkspaceForm.tsx"),
  "utf8",
);
assert.match(workspaceSrc, /Dine-in reservation time/);
assert.match(workspaceSrc, /reservationTime/);
assert.match(workspaceSrc, /guestCount/);

console.log("PASS whole-cake confirmation format");
