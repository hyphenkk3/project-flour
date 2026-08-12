/**
 * M4-P5 — four-state Delivery lifecycle + customer messaging.
 * Run: npx tsx scripts/test-m4-p5-delivery-lifecycle.ts
 *
 * Snapshot/helper suite only. Live RPCs: test-m4-p5-delivery-lifecycle-live.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import {
  isCustomerReadyMessageAvailable,
  isDeliveryCustomerReadyMessageAvailable,
  messageActionsForOperationalState,
  messageRecipientLabel,
} from "@/engines/orders/message-availability";
import {
  CUSTOMER_OUT_FOR_DELIVERY_MESSAGE,
  CUSTOMER_THANK_YOU_MESSAGE,
  deliveryCustomerReadyVariant,
  formatCrewPickupTime,
  generateCustomerDeliveryReadyMessage,
  generateCustomerReadyMessage,
  generateCustomerThankYouMessage,
  generateOrderMessage,
  outForDeliveryMessageAudiences,
} from "@/engines/orders/messages";
import {
  deriveOperationalState,
  MARK_OUT_FOR_DELIVERY_LABEL,
  operationalCompleteActionLabel,
  operationalCompletedAtPrefix,
  operationalSectionTitle,
  operationalStateLabel,
  operationalUndoCompleteActionLabel,
  UNDO_OUT_FOR_DELIVERY_LABEL,
  withOperationalMarker,
} from "@/engines/orders/operational-state";
import { defaultDeliveryFinanceDtoFields } from "@/engines/orders/fulfilment";
import type { StorefrontOrder, StorefrontOrderDelivery } from "@/types/storefront";
import {
  formatPaymentDueRelative,
  formatTimelineDateTime,
  formatTimelineTime,
} from "@/workspaces/owner/orders/labels";

const FROZEN_THANK_YOU =
  "Thank you for the order and hope you enjoy ya ;)\n\n" +
  "If there’s anything please do not hesitate to let us know so we can improve and serve you better !\n\n" +
  "Thank you once again and have a nice day ahead!";

function pickupOrder(overrides: Partial<StorefrontOrder> = {}): StorefrontOrder {
  return {
    id: "o1",
    fulfilmentMethod: "pickup",
    delivery: null,
    customerName: "Amy",
    phone: "0123456789",
    pickupDate: "2026-08-16",
    pickupTime: "14:30",
    orderSource: "whatsapp",
    crewOrder: false,
    items: [],
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

function deliveryDetails(
  overrides: Partial<StorefrontOrderDelivery> = {},
): StorefrontOrderDelivery {
  return {
    recipientName: "Amy",
    recipientPhone: "0123456789",
    addressLine1: "tamen lpow",
    addressLine2: null,
    postcode: "88300",
    city: "Kota Kinabalu",
    state: "Sabah",
    recipientNotifyPreference: "inform_recipient",
    ...defaultDeliveryFinanceDtoFields(),
    ...overrides,
  };
}

function deliveryOrder(overrides: Partial<StorefrontOrder> = {}): StorefrontOrder {
  return pickupOrder({
    fulfilmentMethod: "delivery",
    pickupTime: "16:00:00",
    delivery: deliveryDetails(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Labels — Pickup unchanged, Delivery four-state
// ---------------------------------------------------------------------------
assert.equal(operationalSectionTitle("pickup"), "Collection");
assert.equal(operationalSectionTitle(null), "Collection");
assert.equal(operationalSectionTitle("drive_through"), "Collection");
assert.equal(operationalSectionTitle("delivery"), "Delivery");

assert.equal(operationalStateLabel("not_ready", "pickup"), "Not Ready");
assert.equal(operationalStateLabel("ready", "pickup"), "Ready");
assert.equal(operationalStateLabel("picked_up", "pickup"), "Picked Up");
assert.equal(operationalStateLabel("not_ready", "delivery"), "Not Ready");
assert.equal(operationalStateLabel("ready", "delivery"), "Ready");
assert.equal(operationalStateLabel("out_for_delivery", "delivery"), "Out for Delivery");
assert.equal(operationalStateLabel("delivered", "delivery"), "Delivered");
assert.equal(operationalStateLabel("picked_up", "delivery"), "Picked Up");

assert.equal(operationalCompleteActionLabel("pickup"), "Mark Picked Up");
assert.equal(operationalCompleteActionLabel("delivery"), "Mark Delivered");
assert.equal(operationalUndoCompleteActionLabel("pickup"), "Undo Picked Up");
assert.equal(operationalUndoCompleteActionLabel("delivery"), "Undo Delivered");
assert.equal(operationalCompletedAtPrefix("pickup"), "Picked up at");
assert.equal(operationalCompletedAtPrefix("delivery"), "Delivered at");
assert.equal(MARK_OUT_FOR_DELIVERY_LABEL, "Mark Out for Delivery");
assert.equal(UNDO_OUT_FOR_DELIVERY_LABEL, "Undo Out for Delivery");

assert.equal(deriveOperationalState({ readyAt: null, pickedUpAt: null }), "not_ready");
assert.equal(
  deriveOperationalState({ readyAt: "t", pickedUpAt: null }),
  "ready",
);
assert.equal(
  deriveOperationalState({ readyAt: "t", pickedUpAt: "u" }),
  "picked_up",
);
assert.ok(
  withOperationalMarker("Amy", { readyAt: "t", pickedUpAt: "u" }).startsWith("✓"),
);

assert.equal(
  deriveOperationalState({
    readyAt: "t",
    pickedUpAt: "stale",
    fulfilmentMethod: "delivery",
  }),
  "ready",
);
assert.equal(
  deriveOperationalState({
    readyAt: null,
    pickedUpAt: "stale",
    fulfilmentMethod: "delivery",
  }),
  "not_ready",
);
assert.equal(
  deriveOperationalState({
    readyAt: "t",
    pickedUpAt: null,
    outForDeliveryAt: "u",
    fulfilmentMethod: "delivery",
  }),
  "out_for_delivery",
);
assert.equal(
  deriveOperationalState({
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: "u",
    fulfilmentMethod: "delivery",
  }),
  "out_for_delivery",
);
assert.equal(
  deriveOperationalState({
    readyAt: "t",
    pickedUpAt: "stale",
    outForDeliveryAt: "u",
    deliveredAt: "v",
    fulfilmentMethod: "delivery",
  }),
  "delivered",
);
assert.equal(
  deriveOperationalState({
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: "v",
    fulfilmentMethod: "delivery",
  }),
  "delivered",
);
assert.ok(
  withOperationalMarker("Amy", {
    readyAt: "t",
    pickedUpAt: null,
    outForDeliveryAt: "u",
    fulfilmentMethod: "delivery",
  }).startsWith("○"),
);
assert.ok(
  withOperationalMarker("Amy", {
    readyAt: "t",
    pickedUpAt: "stale",
    deliveredAt: "v",
    fulfilmentMethod: "delivery",
  }).startsWith("✓"),
);

const controlsSrc = readFileSync(
  resolve("src/workspaces/owner/orders/OrderOperationalControls.tsx"),
  "utf8",
);
assert.ok(controlsSrc.includes("Mark Ready"));
assert.ok(controlsSrc.includes("MARK_OUT_FOR_DELIVERY_LABEL"));
assert.ok(controlsSrc.includes("UNDO_OUT_FOR_DELIVERY_LABEL"));
assert.ok(controlsSrc.includes("Undo Ready"));
assert.ok(controlsSrc.includes("markOrderOutForDeliveryAction"));
assert.ok(controlsSrc.includes("markOrderDeliveredAction"));
assert.ok(controlsSrc.includes("markOrderPickedUpAction"));
assert.ok(controlsSrc.includes("isDeliveryFulfilment(fulfilmentMethod)"));
assert.ok(controlsSrc.includes('import { useState } from "react";'));
assert.ok(!controlsSrc.includes("useTransition"));
assert.ok(!controlsSrc.includes("startTransition("));
assert.ok(controlsSrc.includes("setPending(false)"));
assert.ok(controlsSrc.includes("Updated, but the screen did not refresh"));
assert.ok(controlsSrc.includes("withTimeout"));
assert.ok(controlsSrc.includes("This update is taking too long"));

assert.ok(controlsSrc.includes("formatTimelineTime"));
assert.ok(controlsSrc.includes("Ready at {formatTimelineTime(readyAt)}"));
assert.ok(
  controlsSrc.includes("Out for delivery at {formatTimelineTime(outForDeliveryAt)}"),
);
assert.ok(controlsSrc.includes("formatTimelineTime(deliveredAt)"));
assert.ok(controlsSrc.includes("formatTimelineTime(pickedUpAt)"));

// Deterministic AM/PM — Node en-SG Intl yields lowercase "am"; browsers often "AM".
const outForDeliveryIso = "2026-08-12T02:25:35.642672+00:00";
assert.equal(formatTimelineTime(outForDeliveryIso), "10:25 AM");
assert.equal(formatTimelineDateTime(outForDeliveryIso), "12 Aug, 10:25 AM");
assert.ok(!formatTimelineTime(outForDeliveryIso).includes("am"));
assert.ok(
  formatPaymentDueRelative(outForDeliveryIso, new Date("2026-08-12T03:00:00+00:00")).endsWith(
    "10:25 AM",
  ),
);

const labelsSrc = readFileSync(
  resolve("src/workspaces/owner/orders/labels.ts"),
  "utf8",
);
assert.ok(labelsSrc.includes("formatHourMinute12h"));
assert.ok(labelsSrc.includes('hour12: false'));

const workspaceSrc = readFileSync(
  resolve("src/workspaces/owner/orders/OrderWorkspaceForm.tsx"),
  "utf8",
);
assert.ok(!/OrderOperationalControls[\s\S]{0,400}router\.refresh\(\)/.test(workspaceSrc));

const quickViewSrc = readFileSync(
  resolve("src/workspaces/owner/calendar/CalendarQuickView.tsx"),
  "utf8",
);
assert.ok(quickViewSrc.includes("outForDeliveryAt={order.outForDeliveryAt}"));
assert.ok(quickViewSrc.includes("deliveredAt={order.deliveredAt}"));

// ---------------------------------------------------------------------------
// Message availability
// ---------------------------------------------------------------------------
assert.equal(isCustomerReadyMessageAvailable("pickup"), true);
assert.equal(isCustomerReadyMessageAvailable(null), true);
assert.equal(isCustomerReadyMessageAvailable("delivery"), false);
assert.equal(isDeliveryCustomerReadyMessageAvailable("delivery"), true);
assert.equal(isDeliveryCustomerReadyMessageAvailable("pickup"), false);

const pickupReady = messageActionsForOperationalState({
  readyAt: "2026-08-16T02:00:00.000Z",
  pickedUpAt: null,
  fulfilmentMethod: "pickup",
});
assert.deepEqual(
  pickupReady.map((a) => a.type),
  ["crew", "customer_ready"],
);
assert.equal(pickupReady.find((a) => a.type === "customer_ready")?.primary, true);
assert.equal(pickupReady.find((a) => a.type === "crew")?.primary, false);

const samePerson = deliveryOrder({
  customerName: "Amy",
  phone: "0123456789",
  delivery: deliveryDetails({
    recipientName: "Amy",
    recipientPhone: "0123456789",
    recipientNotifyPreference: "inform_recipient",
  }),
});
const differentInform = deliveryOrder({
  customerName: "Amy",
  phone: "0123456789",
  delivery: deliveryDetails({
    recipientName: "Ben",
    recipientPhone: "0191111222",
    recipientNotifyPreference: "inform_recipient",
  }),
});
const differentSurprise = deliveryOrder({
  customerName: "Amy",
  phone: "0123456789",
  delivery: deliveryDetails({
    recipientName: "Ben",
    recipientPhone: "0191111222",
    recipientNotifyPreference: "do_not_inform_recipient",
  }),
});

const deliveryReady = messageActionsForOperationalState({
  readyAt: "2026-08-16T02:00:00.000Z",
  pickedUpAt: null,
  fulfilmentMethod: "delivery",
  order: samePerson,
});
assert.deepEqual(
  deliveryReady.map((a) => a.type),
  ["crew", "customer_delivery_ready"],
);
assert.equal(
  deliveryReady.find((a) => a.type === "customer_delivery_ready")?.primary,
  true,
);
assert.equal(deliveryReady.find((a) => a.type === "crew")?.primary, false);
assert.equal(deliveryReady.some((a) => a.type === "customer_ready"), false);
assert.equal(
  deliveryReady.find((a) => a.type === "customer_delivery_ready")?.title,
  "Delivery Customer Ready",
);

const deliveryOutSame = messageActionsForOperationalState({
  readyAt: "t",
  pickedUpAt: null,
  outForDeliveryAt: "u",
  fulfilmentMethod: "delivery",
  order: samePerson,
});
assert.deepEqual(
  deliveryOutSame.map((a) => a.type),
  [
    "crew",
    "customer_out_for_delivery",
    "customer_thank_you",
    "customer_delivery_ready",
  ],
);
assert.equal(
  deliveryOutSame.find((a) => a.type === "customer_out_for_delivery")?.primary,
  true,
);
assert.equal(
  deliveryOutSame.find((a) => a.type === "customer_thank_you")?.primary,
  false,
);
assert.equal(
  deliveryOutSame.filter((a) => a.type === "customer_out_for_delivery").length,
  1,
);

const deliveryOutInform = messageActionsForOperationalState({
  readyAt: "t",
  pickedUpAt: null,
  outForDeliveryAt: "u",
  fulfilmentMethod: "delivery",
  order: differentInform,
});
const informOut = deliveryOutInform.filter(
  (a) => a.type === "customer_out_for_delivery",
);
assert.equal(informOut.length, 2);
assert.equal(informOut[0]?.audience, "orderer");
assert.equal(informOut[1]?.audience, "recipient");
assert.equal(informOut[0]?.title, "Out for Delivery — Person who ordered");
assert.equal(informOut[1]?.title, "Out for Delivery — Recipient");
assert.equal(informOut[0]?.contactPhone, "0123456789");
assert.equal(informOut[1]?.contactPhone, "0191111222");
assert.equal(
  messageRecipientLabel("customer_out_for_delivery", "orderer"),
  "CUSTOMER · PERSON WHO ORDERED",
);
assert.equal(
  messageRecipientLabel("customer_out_for_delivery", "recipient"),
  "CUSTOMER · RECIPIENT",
);
assert.ok(deliveryOutInform.some((a) => a.type === "customer_thank_you"));
assert.ok(deliveryOutInform.some((a) => a.type === "customer_delivery_ready"));

const deliveryOutSurprise = messageActionsForOperationalState({
  readyAt: "t",
  pickedUpAt: null,
  outForDeliveryAt: "u",
  fulfilmentMethod: "delivery",
  order: differentSurprise,
});
const surpriseOut = deliveryOutSurprise.filter(
  (a) => a.type === "customer_out_for_delivery",
);
assert.equal(surpriseOut.length, 1);
assert.equal(surpriseOut[0]?.audience, "orderer");
assert.equal(surpriseOut[0]?.contactPhone, "0123456789");
assert.equal(
  surpriseOut.some((a) => a.audience === "recipient"),
  false,
);

const staleDelivered = messageActionsForOperationalState({
  readyAt: "t",
  pickedUpAt: "stale",
  fulfilmentMethod: "delivery",
  order: samePerson,
});
assert.deepEqual(
  staleDelivered.map((a) => a.type),
  ["crew", "customer_delivery_ready"],
);

const deliveryDelivered = messageActionsForOperationalState({
  readyAt: "t",
  pickedUpAt: "stale",
  outForDeliveryAt: "u",
  deliveredAt: "v",
  fulfilmentMethod: "delivery",
  order: differentInform,
});
assert.equal(
  deliveryDelivered.find((a) => a.type === "customer_thank_you")?.primary,
  true,
);
assert.ok(deliveryDelivered.some((a) => a.type === "customer_delivery_ready"));
assert.ok(deliveryDelivered.some((a) => a.type === "customer_out_for_delivery"));
assert.equal(
  deliveryDelivered.filter((a) => a.type === "customer_out_for_delivery").length,
  2,
);
assert.equal(deliveryDelivered.some((a) => a.type === "customer_ready"), false);

const pickupPickedUp = messageActionsForOperationalState({
  readyAt: "2026-08-16T02:00:00.000Z",
  pickedUpAt: "2026-08-16T08:00:00.000Z",
  fulfilmentMethod: "pickup",
});
assert.deepEqual(
  pickupPickedUp.map((a) => a.type),
  ["crew", "customer_thank_you", "customer_ready"],
);

// ---------------------------------------------------------------------------
// Delivery Ready A/B + staff name + scheduled time; Pickup Ready unchanged
// ---------------------------------------------------------------------------
assert.equal(deliveryCustomerReadyVariant(samePerson), "schedule");
assert.equal(deliveryCustomerReadyVariant(differentSurprise), "schedule");
assert.equal(deliveryCustomerReadyVariant(differentInform), "contact_recipient");

const variantA = generateCustomerDeliveryReadyMessage({
  senderName: "Vivian",
  scheduledTime: "16:00:00",
  variant: "schedule",
});
assert.equal(
  variantA,
  "Good morning, Vivian here.\n" +
    "Just to inform you that your order is ready for delivery anytime now, we will arrange delivery base on your schedule at 4pm.\n" +
    "Do let us know if you like to deliver earlier ya ;)",
);
assert.ok(variantA.includes(formatCrewPickupTime({ pickupTime: "16:00:00" })));

const variantB = generateCustomerDeliveryReadyMessage({
  senderName: "Marcus",
  scheduledTime: "16:00:00",
  variant: "contact_recipient",
});
assert.equal(
  variantB,
  "Good morning, Marcus here.\n" +
    "Just to inform you that your order is ready for delivery anytime now.\n" +
    "We will contact the recipient for arranging the delivery ya ;)",
);
assert.ok(!variantB.includes("4pm"));
assert.ok(!variantB.includes("16:00"));

assert.equal(
  generateOrderMessage("customer_delivery_ready", {
    order: samePerson,
    senderName: "  Vivian  ",
  }),
  variantA,
);
assert.equal(
  generateOrderMessage("customer_delivery_ready", {
    order: differentInform,
    senderName: "Marcus",
  }),
  variantB,
);

const pickupReadyBody = generateCustomerReadyMessage("Vivian");
assert.ok(pickupReadyBody.includes("ready for pick up"));
assert.ok(pickupReadyBody.includes("Whitebird counter"));
assert.ok(pickupReadyBody.includes("Wed :3:00pm"));
assert.equal(generateCustomerThankYouMessage(), CUSTOMER_THANK_YOU_MESSAGE);
assert.equal(CUSTOMER_THANK_YOU_MESSAGE, FROZEN_THANK_YOU);
assert.equal(
  generateOrderMessage("customer_thank_you", { order: deliveryOrder() }),
  CUSTOMER_THANK_YOU_MESSAGE,
);
assert.equal(
  generateOrderMessage("customer_out_for_delivery", { order: differentInform }),
  CUSTOMER_OUT_FOR_DELIVERY_MESSAGE,
);
assert.equal(
  CUSTOMER_OUT_FOR_DELIVERY_MESSAGE,
  "Rider has picked up the order and is on his way ya!",
);
assert.doesNotThrow(() =>
  generateOrderMessage("customer_ready", { order: pickupOrder() }),
);
assert.throws(
  () => generateOrderMessage("customer_ready", { order: deliveryOrder() }),
  /Pickup Customer Ready Message is not used for Delivery/,
);
assert.throws(
  () => generateOrderMessage("customer_delivery_ready", { order: pickupOrder() }),
  /Delivery Customer Ready is only for Delivery orders/,
);

assert.deepEqual(outForDeliveryMessageAudiences(samePerson), ["orderer"]);
assert.deepEqual(outForDeliveryMessageAudiences(differentInform), [
  "orderer",
  "recipient",
]);
assert.deepEqual(outForDeliveryMessageAudiences(differentSurprise), ["orderer"]);

// ---------------------------------------------------------------------------
// Authority unchanged
// ---------------------------------------------------------------------------
const owner = buildGuestOrderWorkspaceCapabilities({
  role: "owner",
  staffId: "owner-1",
});
const manager = buildGuestOrderWorkspaceCapabilities({
  role: "manager",
  staffId: "mgr-1",
});
const counter = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co-1",
});
assert.equal(owner.canOperateCollectionControls, true);
assert.equal(manager.canOperateCollectionControls, false);
assert.equal(counter.canOperateCollectionControls, false);
assert.equal(owner.canPrepareConfirmation, true);
assert.equal(manager.canPrepareConfirmation, false);

const actionsSrc = readFileSync(
  resolve("src/workspaces/owner/orders/actions.ts"),
  "utf8",
);
assert.ok(actionsSrc.includes("export async function markOrderOutForDeliveryAction"));
assert.ok(actionsSrc.includes("export async function markOrderDeliveredAction"));
assert.ok(
  /markOrderOutForDeliveryAction[\s\S]*requireOwner\(\)/.test(actionsSrc),
);
assert.ok(/markOrderDeliveredAction[\s\S]*requireOwner\(\)/.test(actionsSrc));

// ---------------------------------------------------------------------------
// Calendar Guide fulfilment-aware ● / ○ / ✓; no emoji; no provisional wording
// ---------------------------------------------------------------------------
const guide = readFileSync(
  resolve("src/workspaces/owner/calendar/CalendarGuide.tsx"),
  "utf8",
);
assert.ok(guide.includes("Pickup:"));
assert.ok(guide.includes("Delivery:"));
assert.ok(guide.includes("= Ready"));
assert.ok(guide.includes("= Picked Up"));
assert.ok(guide.includes("= Out for Delivery"));
assert.ok(guide.includes("= Delivered"));
assert.ok(!guide.includes("= Picked Up / Delivered"));
assert.ok(!guide.includes("🚗"));
assert.equal(existsSync("src/engines/orders/operational-state.ts"), true);

const operationalSrc = readFileSync(
  resolve("src/engines/orders/operational-state.ts"),
  "utf8",
);
assert.ok(operationalSrc.includes("outForDeliveryAt"));
assert.ok(operationalSrc.includes("deliveredAt"));
assert.ok(operationalSrc.includes('return "out_for_delivery"'));
assert.ok(!operationalSrc.includes("relabels completion"));

console.log("M4-P5 Delivery lifecycle tests: PASS");
