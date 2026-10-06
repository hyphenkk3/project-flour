import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateOrderMessage } from "@/engines/orders/messages";
import {
  customerPaymentThankYouVariant,
  generateCustomerPaymentThankYouMessage,
  hasVerifiedPaymentForPaymentThankYou,
} from "@/engines/orders/payment-thank-you";
import { buildWhatsAppDeepLink } from "@/engines/orders/whatsapp";
import { CUSTOMER_THANK_YOU_MESSAGE } from "@/engines/orders/messages";
import type { StorefrontOrder } from "@/types/storefront";

const pickupMessage =
  "Thank you for your payment!\n\n" +
  "In case someone is picking up on your behalf please make sure that him/her knows that it’s under whose order and the contents of the order to avoid mishandling of the cake ya. 🙏😬\n\n" +
  "Thank you and see you soon! ❤️";
const deliveryDifferentMessage =
  "Thank you for your payment!\n\n" +
  "We will inform you and also message recipient before delivery on that day ya!\n\n" +
  "Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)";
const deliverySameMessage =
  "Thank you for your payment!\n\n" +
  "We will inform you before delivery on that day ya!\n\n" +
  "Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)";
const deliveryDifferentNoNotifyMessage =
  "Thank you for your payment!\n\n" +
  "We will inform you before delivery on that day ya!\n\n" +
  "Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)";
const deliverySameNoNotifyMessage =
  "Thank you for your payment!\n\n" +
  "Your delivery is arranged as confirmed.\n\n" +
  "Thank you and see you soon! ❤️";
const dineInMessage =
  "Thank you for your payment!\n\n" +
  "Kindly inform our crew on the day when you want the cake being served and we will take care of the rest ya. ☺️\n\n" +
  "Thank you and see you soon! ❤️";

function order(overrides: Partial<StorefrontOrder> = {}): StorefrontOrder {
  return {
    id: "order-1",
    orderNumber: "WB-001",
    customerName: "Amy Tan",
    phone: "0123456789",
    fulfilmentMethod: "pickup",
    delivery: null,
    paymentAllocations: [],
    ...overrides,
  } as StorefrontOrder;
}

const pickup = order();
const deliveryDifferent = order({
  fulfilmentMethod: "delivery",
  delivery: {
    recipientName: "Lee Tan",
    recipientPhone: "0198765432",
    recipientNotifyPreference: "inform_recipient",
  } as StorefrontOrder["delivery"],
});
const deliverySame = order({
  fulfilmentMethod: "delivery",
  delivery: {
    recipientName: " amy   tan ",
    recipientPhone: "0123 456-789",
    recipientNotifyPreference: "inform_recipient",
  } as StorefrontOrder["delivery"],
});
const deliveryDifferentNoNotify = order({
  fulfilmentMethod: "delivery",
  delivery: {
    recipientName: "Lee Tan",
    recipientPhone: "0198765432",
    recipientNotifyPreference: "do_not_inform_recipient",
  } as StorefrontOrder["delivery"],
});
const deliverySameNoNotify = order({
  fulfilmentMethod: "delivery",
  delivery: {
    recipientName: " amy   tan ",
    recipientPhone: "0123 456-789",
    recipientNotifyPreference: "do_not_inform_recipient",
  } as StorefrontOrder["delivery"],
});
const dineIn = order({ fulfilmentMethod: "dine_in" });

assert.equal(generateCustomerPaymentThankYouMessage(pickup), pickupMessage);
assert.equal(
  generateCustomerPaymentThankYouMessage(deliveryDifferent),
  deliveryDifferentMessage,
);
assert.equal(
  generateCustomerPaymentThankYouMessage(deliverySame),
  deliverySameMessage,
);
assert.equal(
  generateCustomerPaymentThankYouMessage(deliveryDifferentNoNotify),
  deliveryDifferentNoNotifyMessage,
);
assert.equal(
  generateCustomerPaymentThankYouMessage(deliverySameNoNotify),
  deliverySameNoNotifyMessage,
);
assert.equal(
  customerPaymentThankYouVariant(deliveryDifferentNoNotify),
  "delivery_different_recipient",
);
assert.equal(
  customerPaymentThankYouVariant(deliverySameNoNotify),
  "delivery_same_recipient",
);
assert.doesNotMatch(
  generateCustomerPaymentThankYouMessage(deliveryDifferentNoNotify),
  /message recipient|inform recipient|contact recipient/i,
);
assert.match(
  generateCustomerPaymentThankYouMessage(deliveryDifferent),
  /also message recipient before delivery/i,
);
assert.doesNotMatch(
  generateCustomerPaymentThankYouMessage(deliverySameNoNotify),
  /inform you|message|contact|send you/i,
);
assert.equal(generateCustomerPaymentThankYouMessage(dineIn), dineInMessage);

assert.equal(
  generateOrderMessage("customer_payment_thank_you", { order: pickup }),
  pickupMessage,
);
assert.equal(
  generateOrderMessage("customer_payment_thank_you", {
    order: deliveryDifferent,
  }),
  deliveryDifferentMessage,
);
assert.equal(
  generateOrderMessage("customer_payment_thank_you", {
    order: deliveryDifferentNoNotify,
  }),
  deliveryDifferentNoNotifyMessage,
);

const verifiedAllocation = { paymentStatus: "verified" } as const;
assert.equal(hasVerifiedPaymentForPaymentThankYou([verifiedAllocation]), true);
assert.equal(hasVerifiedPaymentForPaymentThankYou([]), false);

const whatsappUrl = buildWhatsAppDeepLink(pickup.phone, pickupMessage);
assert.ok(whatsappUrl);
assert.equal(
  whatsappUrl,
  `https://wa.me/60123456789?text=${encodeURIComponent(pickupMessage)}`,
);
assert.equal(buildWhatsAppDeepLink("", pickupMessage), null);
assert.equal(buildWhatsAppDeepLink("not a phone", pickupMessage), null);

const paymentSectionSource = readFileSync(
  resolve("src/workspaces/owner/orders/PaymentSection.tsx"),
  "utf8",
);
assert.match(paymentSectionSource, /hasVerifiedPaymentForPaymentThankYou\(/);
assert.match(paymentSectionSource, /buildWhatsAppDeepLink\(\s*order\.phone/);
assert.match(
  paymentSectionSource,
  /generateOrderMessage\("customer_payment_thank_you", \{ order \}\)/,
);
assert.match(paymentSectionSource, /Payment Thank You Message/);
assert.match(paymentSectionSource, /Nothing is sent\s+automatically/);
assert.match(paymentSectionSource, /disabled/);
assert.doesNotMatch(paymentSectionSource, /customer_payment_thank_you_sent/);
assert.doesNotMatch(paymentSectionSource, /customer_ready_message_sent/);

const recordPaymentFormSource = readFileSync(
  resolve("src/workspaces/owner/orders/RecordPaymentForm.tsx"),
  "utf8",
);
assert.match(recordPaymentFormSource, /if \(!state\.success\) return/);
assert.match(recordPaymentFormSource, /router\.refresh\(\)/);

const paymentActionSource = readFileSync(
  resolve("src/workspaces/owner/orders/actions.ts"),
  "utf8",
);
const recordAction = paymentActionSource.match(
  /export async function recordAndVerifyPaymentAction[\s\S]*?(?=\nexport type RecordPaymentCorrectionState)/,
);
assert.ok(recordAction, "Record Payment action is present");
assert.match(recordAction[0], /record_and_verify_guest_order_payment/);
assert.match(recordAction[0], /if \(error\) \{[\s\S]*?success: false/);
assert.match(recordAction[0], /return \{ error: null, success: true \}/);

assert.equal(
  generateOrderMessage("customer_thank_you", { order: pickup }),
  CUSTOMER_THANK_YOU_MESSAGE,
);

console.log("Payment Thank You message tests passed.");
