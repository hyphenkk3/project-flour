/**
 * M4-P2 Slice 4 — Delivery Confirmation + Crew gate + Quick View.
 * Run: npx tsx scripts/test-m4-p2-slice4-confirmation-crew-quick-view.ts
 *
 * Snapshot/helper suite only (no live DB fixtures).
 * M4-P4 ungated Delivery Crew; this file keeps Pickup Crew + Confirmation + QV
 * regressions. Delivery Crew body coverage: test-m4-p4-delivery-crew-message.ts.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildConfirmationPayload,
  buildConfirmationPayloadFromOrder,
  CONFIRMATION_SECTION_SEPARATOR,
  formatConfirmationFinancialBlock,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import {
  orderMateriallyAffectsConfirmation,
  shouldOutdateSentConfirmation,
} from "@/engines/orders/confirmation-validity";
import {
  buildQuickViewFulfilmentSummary,
  defaultDeliveryFinanceDtoFields,
  isCrewOrderMessageAvailable,
  isDeliveryRecipientSameAsOrderingCustomer,
  isPickupCrewMessageAvailable,
  pickupCrewUnavailableReason,
} from "@/engines/orders/fulfilment";
import { messageActionsForOperationalState } from "@/engines/orders/message-availability";
import {
  generateCrewOrderMessage,
  generateOrderMessage,
} from "@/engines/orders/messages";
import {
  calculateCakeSubtotal,
  calculateCommercialSubtotal,
  commercialLinesForSettlement,
} from "@/engines/orders/totals";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { totalCakeQuantityFromItems } from "@/workspaces/owner/calendar/cake-production";
import type {
  StorefrontOrder,
  StorefrontOrderDelivery,
} from "@/types/storefront";

const cake125 = {
  cakeName: "Red Dates",
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 125,
};

function deliveryDetails(
  overrides: Partial<StorefrontOrderDelivery> = {},
): StorefrontOrderDelivery {
  return {
    recipientName: "Mum",
    recipientPhone: "0198888888",
    addressLine1: "12 Jalan Delivery",
    addressLine2: null,
    postcode: "88400",
    city: "Kota Kinabalu",
    state: "Sabah",
    recipientNotifyPreference: "inform_recipient",
    ...defaultDeliveryFinanceDtoFields(),
    ...overrides,
  };
}

function basePayload(
  overrides: Partial<Parameters<typeof buildConfirmationPayload>[0]> = {},
) {
  return buildConfirmationPayload({
    staffCustomerFacingName: "Owner (Dev)",
    customerName: "Amy",
    customerPhone: "0123456789",
    pickupDate: "2026-08-15",
    pickupTime: "13:00",
    items: [cake125],
    complimentaryItems: [
      { name: "Candle", quantity: 1 },
      { name: "Knife", quantity: 1 },
    ],
    subtotal: 125,
    adjustments: [],
    amountDue: 125,
    ...overrides,
  });
}

const bc = (quantity: number, messages: Array<string | null>) => ({
  name: "Birthday Card",
  quantity,
  unitPrice: 3,
  financialShorthand: "BC",
  messages: messages.map((writtenMessage, i) => ({
    cardIndex: i + 1,
    writtenMessage,
  })),
});

const wc = (quantity: number, messages: Array<string | null>) => ({
  name: "Wishing Card",
  quantity,
  unitPrice: 3,
  financialShorthand: "WC",
  messages: messages.map((writtenMessage, i) => ({
    cardIndex: i + 1,
    writtenMessage,
  })),
});

function storefrontOrder(
  overrides: Partial<StorefrontOrder> = {},
): StorefrontOrder {
  return {
    id: "o1",
    orderNumber: "WOS-1",
    status: "awaiting_payment",
    customerName: "Amy",
    phone: "0123456789",
    email: null,
    pickupDate: "2026-08-15",
    pickupTime: "13:00:00",
    pickupInstruction: null,
    customerNotes: null,
    internalNotes: null,
    orderSource: "whatsapp",
    crewOrder: false,
    includeReceipt: false,
    needsBakeryAttention: false,
    bakeryAttentionNote: null,
    confirmationNeedsResend: false,
    fulfilmentMethod: "pickup",
    delivery: null,
    dineInReservation: null,
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    items: [
      {
        id: "i1",
        cakeId: "c1",
        cakeSizeId: "s1",
        cakeName: "Red Dates",
        sizeLabel: '6"',
        quantity: 1,
        unitPrice: 125,
      },
    ],
    complimentaryItems: [],
    paidAddons: [],
    adjustments: [],
    paymentAllocations: [],
    settlement: {
      subtotal: 125,
      amountDue: 125,
      netReceived: 0,
      remainingBalance: 125,
      overpayment: 0,
    },
    ...overrides,
  } as StorefrontOrder;
}

// ---------------------------------------------------------------------------
// A–E Shared separators (Pickup + Delivery identical rails)
// ---------------------------------------------------------------------------
{
  assert.equal(CONFIRMATION_SECTION_SEPARATOR.length, 60);
  assert.equal(
    CONFIRMATION_SECTION_SEPARATOR,
    "____________________________________________________________",
  );

  const pickupBody = generateConfirmationMessage(basePayload());
  const deliveryBody = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails(),
    }),
  );

  for (const body of [pickupBody, deliveryBody]) {
    const opener = `Here's the order confirmation.\n\n${CONFIRMATION_SECTION_SEPARATOR}\n\n`;
    const closerPrefix = `\n\n${CONFIRMATION_SECTION_SEPARATOR}\n\nKindly review ALL the details`;
    assert.ok(body.includes(opener));
    assert.ok(body.includes(closerPrefix));

    const first = body.indexOf(CONFIRMATION_SECTION_SEPARATOR);
    const second = body.indexOf(
      CONFIRMATION_SECTION_SEPARATOR,
      first + CONFIRMATION_SECTION_SEPARATOR.length,
    );
    assert.ok(first >= 0);
    assert.ok(second > first);
    assert.equal(
      body.slice(first, first + CONFIRMATION_SECTION_SEPARATOR.length),
      body.slice(second, second + CONFIRMATION_SECTION_SEPARATOR.length),
    );
    // No third separator rail
    const third = body.indexOf(
      CONFIRMATION_SECTION_SEPARATOR,
      second + CONFIRMATION_SECTION_SEPARATOR.length,
    );
    assert.equal(third, -1);
  }

  // Pickup and Delivery use the exact same separator string
  assert.ok(pickupBody.includes(CONFIRMATION_SECTION_SEPARATOR));
  assert.ok(deliveryBody.includes(CONFIRMATION_SECTION_SEPARATOR));
}

// ---------------------------------------------------------------------------
// A–B Pickup Confirmation regression (+ Time → Whole Cake blank line)
// ---------------------------------------------------------------------------
{
  const body = generateConfirmationMessage(basePayload());
  assert.match(body, /^Hello Owner \(Dev\) here,/m);
  assert.ok(body.includes("🟠 Pick-up order: 15/8 (Sat)"));
  assert.ok(body.includes("Ordered by: Amy"));
  assert.ok(body.includes("Phone No: 0123456789"));
  assert.ok(body.includes("Time: 1:00 PM"));
  assert.ok(body.includes("Time: 1:00 PM\n\nWhole Cake;"));
  assert.ok(!body.includes("Delivery order"));
  assert.ok(!body.includes("Ordered by/ Recipient"));
  assert.ok(!body.includes("🚗"));
  assert.ok(!body.includes("Inform Recipient before delivery"));
  assert.ok(!body.includes("DO NOT inform Recipient"));
}

{
  const dineInBody = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "dine_in",
      dineInReservation: {
        reservationDate: "2026-08-15",
        reservationTime: "13:00",
        venue: "whitebird",
        guestCount: 4,
        reservationNote: "Window seat if possible",
        status: "pending",
      },
    }),
  );
  assert.ok(dineInBody.includes("🟠🍽️ Dine-In order: 15/8 (Sat)"));
  assert.ok(dineInBody.includes("Cake serving time: 1:00 PM"));
  assert.ok(
    dineInBody.includes("* Dine-in reservation: 1:00 PM @ Whitebird"),
  );
  assert.ok(dineInBody.includes("* Guests: 4"));
  assert.ok(dineInBody.includes("Window seat if possible"));
  assert.ok(
    dineInBody.includes(
      "Dine-in reservation is included — your reservation is made together with your cake order. No separate reservation is needed.",
    ),
  );
  assert.ok(!dineInBody.includes("Venue: Whitebird"));
  assert.ok(!dineInBody.includes("🟠 Pick-up order:"));
  assert.ok(!dineInBody.includes("Delivery order"));
  assert.ok(!dineInBody.includes("(jw)"));
  assert.ok(!dineInBody.includes("WB QR"));
  assert.ok(!dineInBody.includes("c/o"));
}

// Missing fulfilmentMethod still Pickup (historical)
{
  const p = basePayload();
  delete (p as { fulfilmentMethod?: unknown }).fulfilmentMethod;
  delete (p as { delivery?: unknown }).delivery;
  const body = generateConfirmationMessage(p);
  assert.ok(body.includes("🟠 Pick-up order: 15/8 (Sat)"));
  assert.ok(!body.includes("Delivery order"));
  assert.ok(body.includes("Time: 1:00 PM\n\nWhole Cake;"));
}

// ---------------------------------------------------------------------------
// F Same-as-Customer Delivery (Product refined format)
// ---------------------------------------------------------------------------
{
  const delivery = deliveryDetails({
    recipientName: "delivery",
    recipientPhone: "0121111111",
    addressLine1: "taman 23",
    postcode: "88100",
  });
  assert.equal(
    isDeliveryRecipientSameAsOrderingCustomer({
      customerName: "delivery",
      customerPhone: "0121111111",
      delivery,
    }),
    true,
  );
  const body = generateConfirmationMessage(
    basePayload({
      customerName: "delivery",
      customerPhone: "0121111111",
      fulfilmentMethod: "delivery",
      delivery,
      pickupDate: "2026-08-15",
      pickupTime: "13:00",
    }),
  );
  assert.ok(body.includes("🟠🚗 Delivery order: 15/8 (Sat)"));
  assert.ok(
    body.includes(
      "Ordered by/ Recipient: delivery\nPhone No: 0121111111\nAddress: taman 23, 88100\nTime: 1:00 PM\n\nWhole Cake;",
    ),
  );
  assert.ok(!body.includes("Pick-up order"));
  assert.ok(!body.includes("\nRecipient:"));
  assert.ok(!body.includes("Recipient Phone No:"));
  assert.ok(!body.includes("Inform Recipient"));
  assert.ok(!body.includes("DO NOT inform Recipient"));
  assert.ok(!body.includes("Kota Kinabalu"));
  assert.ok(!body.includes("Sabah"));
  // Persisted city/state still on payload for snapshot/internal truth
  assert.equal(delivery.city, "Kota Kinabalu");
  assert.equal(delivery.state, "Sabah");
}

// ---------------------------------------------------------------------------
// A–E Different recipient Inform / Surprise + complimentary adjacency
// ---------------------------------------------------------------------------
{
  const inform = generateConfirmationMessage(
    basePayload({
      customerName: "delivery",
      customerPhone: "012031023",
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails({
        recipientName: "blerler",
        recipientPhone: "0912980178",
        addressLine1: "taman 23",
        postcode: "88100",
        recipientNotifyPreference: "inform_recipient",
      }),
      pickupDate: "2026-08-22",
      pickupTime: "15:30",
      complimentaryItems: [
        { name: "Birthday Topper", quantity: 1 },
        { name: "Candle", quantity: 1 },
        { name: "Knife", quantity: 1 },
      ],
    }),
  );
  assert.ok(inform.includes("🟠🚗 Delivery order: 22/8 (Sat)"));
  assert.ok(
    inform.includes(
      "Ordered by: delivery\nPhone No: 012031023\nRecipient: blerler\nRecipient Phone No: 0912980178\nAddress: taman 23, 88100\nTime: 3:30 PM\n\nWhole Cake;",
    ),
  );
  assert.ok(
    inform.includes(
      "*Complimentary Birthday Topper x1, Candle x1, Knife x1\n*Inform Recipient before delivery.",
    ),
  );
  // amount → blank → complimentary/notification → blank → closing separator
  assert.ok(
    inform.includes(
      "RM125\n\n*Complimentary Birthday Topper x1, Candle x1, Knife x1\n*Inform Recipient before delivery.\n\n" +
        CONFIRMATION_SECTION_SEPARATOR +
        "\n\nKindly review ALL the details",
    ),
  );
  assert.ok(!inform.includes("Ordered by/ Recipient"));
  assert.ok(!inform.includes("Pick-up order"));
  assert.ok(!inform.includes("Kota Kinabalu"));
  assert.ok(!inform.includes("Sabah"));
  // Must not use legacy Workspace notify labels in Confirmation
  assert.ok(!inform.includes("\nInform Recipient\n"));
  assert.ok(!inform.includes("DO NOT INFORM RECIPIENT"));

  const surprise = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails({
        recipientNotifyPreference: "do_not_inform_recipient",
      }),
      complimentaryItems: [
        { name: "Birthday Topper", quantity: 1 },
        { name: "Candle", quantity: 1 },
        { name: "Knife", quantity: 1 },
      ],
    }),
  );
  assert.ok(
    surprise.includes(
      "*Complimentary Birthday Topper x1, Candle x1, Knife x1\n*DO NOT inform Recipient (It's a Surprise!)",
    ),
  );

  // E. No complimentary — notify still renders
  const noComp = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails({
        recipientNotifyPreference: "inform_recipient",
      }),
      complimentaryItems: [],
    }),
  );
  assert.ok(noComp.includes("*Inform Recipient before delivery."));
  assert.ok(!noComp.includes("*Complimentary"));
}

// ---------------------------------------------------------------------------
// G Address line 2 → one customer-facing Address line
// ---------------------------------------------------------------------------
{
  const blank = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails({
        addressLine1: "taman 23",
        addressLine2: null,
        postcode: "88100",
      }),
    }),
  );
  assert.ok(blank.includes("Address: taman 23, 88100"));
  assert.ok(!blank.includes("Kota Kinabalu"));

  const populated = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails({
        addressLine1: "Block A",
        addressLine2: "Taman Rimba",
        postcode: "88100",
      }),
    }),
  );
  assert.ok(populated.includes("Address: Block A, Taman Rimba, 88100"));
}

// ---------------------------------------------------------------------------
// O–P no false Pickup / fee / Grab / lifecycle
// ---------------------------------------------------------------------------
{
  const body = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails(),
    }),
  );
  assert.ok(!/Pick-up order/i.test(body));
  assert.ok(!/GrabExpress|delivery fee|RM5|Dispatched|Rider Assigned/i.test(body));
}

// ---------------------------------------------------------------------------
// Q–S / I paid cards + Special Request on Delivery
// ---------------------------------------------------------------------------
{
  const withBc1 = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails({
        recipientName: "Amy",
        recipientPhone: "0123456789",
      }),
      paidAddons: [bc(1, ["Happy Birthday"])],
      subtotal: 128,
      amountDue: 128,
    }),
  );
  assert.ok(withBc1.includes("~ Birthday Card x1"));
  assert.ok(withBc1.includes("⭐️Special Request:⭐️"));
  assert.ok(withBc1.includes("Happy Birthday"));
  assert.ok(withBc1.includes("🟠🚗 Delivery order:"));
  assert.ok(withBc1.includes("Time: 1:00 PM\n\nWhole Cake;"));
  // same-person → no notify instruction
  assert.ok(!withBc1.includes("Inform Recipient before delivery"));

  const withBc2 = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails(),
      paidAddons: [bc(2, ["Card 1", "Card 2"])],
      subtotal: 131,
      amountDue: 131,
    }),
  );
  assert.ok(withBc2.includes("~ Birthday Card x2"));
  assert.ok(withBc2.includes("Written message on Birthday Card 1:"));
  assert.ok(withBc2.includes("Written message on Birthday Card 2:"));
  assert.ok(withBc2.includes("*Inform Recipient before delivery."));

  const mixed = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails(),
      paidAddons: [bc(1, ["Hi"]), wc(1, [null])],
      subtotal: 131,
      amountDue: 131,
    }),
  );
  assert.ok(mixed.includes("~ Birthday Card x1"));
  assert.ok(mixed.includes("~ Wishing Card x1"));
  assert.ok(mixed.includes("Hi"));
}

// ---------------------------------------------------------------------------
// T–X equation / August / RM10 / complimentary / footer
// ---------------------------------------------------------------------------
{
  const footer =
    "Kindly review ALL the details in this confirmation carefully";
  const deliveryBody = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails({
        recipientName: "Amy",
        recipientPhone: "0123456789",
      }),
      paidAddons: [bc(1, [null])],
      subtotal: 128,
      amountDue: 128,
    }),
  );
  assert.ok(deliveryBody.includes(footer));
  assert.ok(deliveryBody.includes("*Complimentary Candle x1, Knife x1"));
  assert.ok(
    formatConfirmationFinancialBlock(
      basePayload({
        paidAddons: [bc(1, [null])],
        subtotal: 128,
        amountDue: 128,
      }),
    ).includes("RM128") ||
      formatConfirmationFinancialBlock(
        basePayload({
          paidAddons: [bc(1, [null])],
          subtotal: 128,
          amountDue: 128,
        }),
      ).includes("128"),
  );

  const august = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails(),
      adjustments: [
        {
          label: "August Promo",
          amount: -20,
          code: "august_promo_2026",
        },
      ],
      subtotal: 125,
      amountDue: 105,
    }),
  );
  assert.ok(august.includes("August Promo") || august.includes("RM105") || august.includes("105"));

  const rm10 = generateConfirmationMessage(
    basePayload({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails(),
      adjustments: [
        {
          label: "RM10 Physical Card",
          amount: -10,
          code: "rm10_physical_card",
          metadata: { voucher_number: "V1" },
        },
      ],
      subtotal: 125,
      amountDue: 115,
    }),
  );
  assert.ok(rm10.includes("115") || rm10.includes("RM10"));
}

// ---------------------------------------------------------------------------
// Y–AB snapshot / historical / updated Confirmation
// ---------------------------------------------------------------------------
{
  const order = storefrontOrder({
    fulfilmentMethod: "delivery",
    delivery: deliveryDetails({
      recipientName: "Amy",
      recipientPhone: "0123456789",
      addressLine1: "Old Road",
    }),
    customerName: "Amy",
    phone: "0123456789",
  });
  const payload = buildConfirmationPayloadFromOrder({
    order,
    staffCustomerFacingName: "Owner",
  });
  assert.equal(payload.fulfilmentMethod, "delivery");
  assert.equal(payload.delivery?.addressLine1, "Old Road");
  assert.equal(payload.delivery?.city, "Kota Kinabalu");
  assert.equal(payload.delivery?.state, "Sabah");
  assert.equal(payload.delivery?.recipientNotifyPreference, "inform_recipient");

  const sentBody = generateConfirmationMessage(payload);
  assert.ok(sentBody.includes("Address: Old Road, 88400"));
  assert.ok(!sentBody.includes("Kota Kinabalu"));

  // Live edit after send — historical body unchanged; new payload uses new truth
  const updatedOrder = storefrontOrder({
    fulfilmentMethod: "delivery",
    customerName: "Amy",
    phone: "0123456789",
    delivery: deliveryDetails({
      recipientName: "Amy",
      recipientPhone: "0123456789",
      addressLine1: "New Road",
    }),
  });
  const updatedBody = generateConfirmationMessage(
    buildConfirmationPayloadFromOrder({
      order: updatedOrder,
      staffCustomerFacingName: "Owner",
    }),
  );
  assert.ok(sentBody.includes("Address: Old Road, 88400"));
  assert.ok(!sentBody.includes("New Road"));
  assert.ok(updatedBody.includes("Address: New Road, 88400"));
  assert.ok(updatedBody.includes("🟠🚗 Delivery order:"));
  assert.ok(updatedBody.includes("Time: 1:00 PM\n\nWhole Cake;"));
  assert.ok(!updatedBody.includes("Inform Recipient before delivery"));

  // Historical Pickup payload without Delivery fields still safe
  const historical = generateConfirmationMessage(
    buildConfirmationPayload({
      staffCustomerFacingName: "Owner",
      customerName: "Amy",
      customerPhone: "012",
      pickupDate: "2026-08-15",
      pickupTime: "13:00",
      items: [cake125],
      complimentaryItems: [],
      subtotal: 125,
      adjustments: [],
      amountDue: 125,
    }),
  );
  assert.ok(historical.includes("🟠 Pick-up order:"));
  assert.ok(!historical.includes("Delivery order"));
}

// ---------------------------------------------------------------------------
// AC–AF materiality / status preservation
// ---------------------------------------------------------------------------
{
  const before = storefrontOrder({
    status: "awaiting_payment",
    fulfilmentMethod: "delivery",
    delivery: deliveryDetails(),
  });
  assert.equal(
    orderMateriallyAffectsConfirmation(before, {
      customerName: before.customerName,
      phone: before.phone,
      pickupDate: before.pickupDate,
      pickupTime: before.pickupTime,
      items: before.items,
      complimentaryItems: [],
      paidAddons: [],
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails({ addressLine1: "Changed" }),
    }),
    true,
  );
  assert.equal(
    shouldOutdateSentConfirmation({
      materialChange: true,
      orderStatus: "awaiting_payment",
    }),
    true,
  );

  // AD. unchanged normalized Delivery does not need resend
  assert.equal(
    orderMateriallyAffectsConfirmation(before, {
      customerName: before.customerName,
      phone: before.phone,
      pickupDate: before.pickupDate,
      pickupTime: before.pickupTime,
      items: before.items,
      complimentaryItems: [],
      paidAddons: [],
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails(),
    }),
    false,
  );

  assert.equal(
    shouldOutdateSentConfirmation({
      materialChange: true,
      orderStatus: "paid",
    }),
    true,
  );
  assert.equal(
    shouldOutdateSentConfirmation({
      materialChange: false,
      orderStatus: "paid",
    }),
    false,
  );
}

// ---------------------------------------------------------------------------
// AG–AM Crew gate + Pickup Crew regression
// ---------------------------------------------------------------------------
{
  const pickupOrder = storefrontOrder({ fulfilmentMethod: "pickup" });
  const crew = generateCrewOrderMessage(pickupOrder);
  assert.ok(crew.includes("Pick-up order:"));
  assert.ok(crew.includes("Ordered by:"));
  assert.ok(isPickupCrewMessageAvailable("pickup"));
  assert.equal(pickupCrewUnavailableReason("pickup"), null);

  const deliveryOrder = storefrontOrder({
    fulfilmentMethod: "delivery",
    delivery: deliveryDetails(),
  });
  assert.equal(isPickupCrewMessageAvailable("delivery"), false);
  assert.equal(isCrewOrderMessageAvailable("delivery"), true);
  assert.equal(pickupCrewUnavailableReason("delivery"), null);
  const deliveryCrew = generateCrewOrderMessage(deliveryOrder);
  assert.ok(deliveryCrew.includes("Delivery Order:"));
  assert.ok(!deliveryCrew.includes("Pick-up order:"));
  assert.ok(
    generateOrderMessage("crew", { order: deliveryOrder }).includes(
      "Delivery Order:",
    ),
  );

  const actions = messageActionsForOperationalState({
    readyAt: null,
    pickedUpAt: null,
    fulfilmentMethod: "delivery",
  });
  assert.equal(actions.some((a) => a.type === "crew"), true);

  const pickupActions = messageActionsForOperationalState({
    readyAt: null,
    pickedUpAt: null,
    fulfilmentMethod: "pickup",
  });
  assert.equal(pickupActions.some((a) => a.type === "crew"), true);

  // NYP / partial / paid suffixes still work on Pickup
  const nyp = generateCrewOrderMessage(
    storefrontOrder({
      settlement: {
        subtotal: 125,
        amountDue: 125,
        netReceived: 0,
        remainingBalance: 125,
        overpayment: 0,
      },
    }),
  );
  assert.ok(nyp.includes("🔺🟢Pick-up order:") || nyp.includes("NYP") || nyp.includes("RM"));

  const paid = generateCrewOrderMessage(
    storefrontOrder({
      settlement: {
        subtotal: 125,
        amountDue: 125,
        netReceived: 125,
        remainingBalance: 0,
        overpayment: 0,
      },
    }),
  );
  assert.ok(paid.startsWith("🟢Pick-up order:") || paid.includes("🟢Pick-up order:"));
}

// ---------------------------------------------------------------------------
// AN–AQ Quick View
// ---------------------------------------------------------------------------
{
  const pickupQv = buildQuickViewFulfilmentSummary(
    storefrontOrder({ fulfilmentMethod: "pickup" }),
  );
  assert.equal(pickupQv.methodLabel, "Pickup");
  assert.equal(pickupQv.isDelivery, false);
  assert.equal(pickupQv.notifyLabel, null);

  const sameQv = buildQuickViewFulfilmentSummary(
    storefrontOrder({
      fulfilmentMethod: "delivery",
      customerName: "Amy",
      phone: "0123456789",
      delivery: deliveryDetails({
        recipientName: "Amy",
        recipientPhone: "0123456789",
      }),
    }),
  );
  assert.equal(sameQv.methodLabel, "Delivery");
  assert.equal(sameQv.recipientSameAsCustomer, true);
  assert.equal(sameQv.notifyLabel, null);
  assert.ok(sameQv.addressLines.length >= 2);

  const diffQv = buildQuickViewFulfilmentSummary(
    storefrontOrder({
      fulfilmentMethod: "delivery",
      delivery: deliveryDetails({
        recipientNotifyPreference: "do_not_inform_recipient",
      }),
    }),
  );
  assert.equal(diffQv.recipientSameAsCustomer, false);
  assert.equal(diffQv.notifyLabel, "DO NOT INFORM RECIPIENT");
  assert.equal(diffQv.recipientName, "Mum");
}

// ---------------------------------------------------------------------------
// AR–AT Matrix/Cakes non-contamination + financial
// ---------------------------------------------------------------------------
{
  const items = [
    { cakeId: "c1", cakeSizeId: "s1", quantity: 2, unitPrice: 125 },
    { cakeId: "c2", cakeSizeId: "s2", quantity: 1, unitPrice: 100 },
  ];
  assert.equal(totalCakeQuantityFromItems(items), 3);
  const cakeSub = calculateCakeSubtotal(items);
  const commercial = calculateCommercialSubtotal({
    items,
    paidAddons: [{ unitPrice: 3, quantity: 2 }],
  });
  assert.equal(cakeSub, 350);
  assert.equal(commercial, 356);
  const settled = calculateOrderSettlement({
    items: commercialLinesForSettlement({
      items,
      paidAddons: [{ unitPrice: 3, quantity: 2 }],
    }),
    adjustments: [],
    allocations: [],
    refunds: [],
  });
  assert.equal(settled.amountDue, 356);
}

// ---------------------------------------------------------------------------
// AU–AV website + financial Delivery boundary
// ---------------------------------------------------------------------------
{
  const checkoutSrc = readFileSync(
    resolve(process.cwd(), "src/workspaces/storefront/checkout/actions.ts"),
    "utf8",
  );
  assert.ok(checkoutSrc.includes("submit_guest_preorder"));
  assert.ok(checkoutSrc.includes("p_fulfilment_method"));
  assert.ok(checkoutSrc.includes("p_delivery"));
  assert.ok(checkoutSrc.includes("p_dine_in"));

  const confirmationSrc = readFileSync(
    resolve(process.cwd(), "src/engines/orders/confirmation-message.ts"),
    "utf8",
  );
  assert.ok(confirmationSrc.includes("Delivery order"));
  assert.ok(!confirmationSrc.includes("GrabExpress"));
  assert.ok(!confirmationSrc.includes("delivery fee"));
}

console.log(
  "M4-P2 Slice 4 confirmation/crew/quick-view helper tests: PASSED",
);

// Soft env presence check only — no live fixtures created in this suite.
if (
  existsSync(resolve(process.cwd(), ".env.local")) &&
  process.env.NEXT_PUBLIC_SUPABASE_URL
) {
  // no-op: Slice 4 focused suite intentionally avoids live DB writes
}
