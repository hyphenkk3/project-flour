import { isDeliveryRecipientSameAsOrderingCustomer } from "@/engines/orders/fulfilment";
import { renderCustomerMessageTemplate, type CustomerMessageTemplateRows } from "@/engines/customer-message-templates";
import type {
  OrderPaymentAllocationView,
  StorefrontOrder,
} from "@/types/storefront";

export type CustomerPaymentThankYouVariant =
  | "pickup"
  | "delivery_different_recipient"
  | "delivery_same_recipient"
  | "dine_in";

const CUSTOMER_PAYMENT_THANK_YOU_MESSAGES: Record<
  CustomerPaymentThankYouVariant,
  string
> = {
  pickup:
    "Thank you for your payment!\n\n" +
    "In case someone is picking up on your behalf please make sure that him/her knows that it’s under whose order and the contents of the order to avoid mishandling of the cake ya. 🙏😬\n\n" +
    "Thank you and see you soon! ❤️",
  delivery_different_recipient:
    "Thank you for your payment!\n\n" +
    "We will inform you and also message recipient before delivery on that day ya!\n\n" +
    "Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)",
  delivery_same_recipient:
    "Thank you for your payment!\n\n" +
    "We will inform you before delivery on that day ya!\n\n" +
    "Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)",
  dine_in:
    "Thank you for your payment!\n\n" +
    "Kindly inform our crew on the day when you want the cake being served and we will take care of the rest ya. ☺️\n\n" +
    "Thank you and see you soon! ❤️",
};

const DELIVERY_SAME_RECIPIENT_NO_NOTIFY_MESSAGE =
  "Thank you for your payment!\n\n" +
  "Your delivery is arranged as confirmed.\n\n" +
  "Thank you and see you soon! ❤️";

type PaymentThankYouOrder = Pick<
  StorefrontOrder,
  "fulfilmentMethod" | "customerName" | "phone" | "delivery"
>;

export function customerPaymentThankYouVariant(
  order: PaymentThankYouOrder,
): CustomerPaymentThankYouVariant {
  if (order.fulfilmentMethod === "dine_in") return "dine_in";
  if (order.fulfilmentMethod !== "delivery") return "pickup";

  return isDeliveryRecipientSameAsOrderingCustomer({
    customerName: order.customerName,
    customerPhone: order.phone,
    delivery: order.delivery,
  })
    ? "delivery_same_recipient"
    : "delivery_different_recipient";
}

export function generateCustomerPaymentThankYouMessage(
  order: PaymentThankYouOrder,
  templates?: CustomerMessageTemplateRows,
): string {
  const variant = customerPaymentThankYouVariant(order);
  const mayInformRecipient =
    order.delivery?.recipientNotifyPreference === "inform_recipient";

  let key:
    | "payment_thank_you_pickup"
    | "payment_thank_you_dine_in"
    | "payment_thank_you_delivery_same_inform"
    | "payment_thank_you_delivery_same_do_not_inform"
    | "payment_thank_you_delivery_different_inform"
    | "payment_thank_you_delivery_different_do_not_inform";
  let fallback: string;

  if (variant === "pickup") {
    key = "payment_thank_you_pickup";
    fallback = CUSTOMER_PAYMENT_THANK_YOU_MESSAGES.pickup;
  } else if (variant === "dine_in") {
    key = "payment_thank_you_dine_in";
    fallback = CUSTOMER_PAYMENT_THANK_YOU_MESSAGES.dine_in;
  } else if (variant === "delivery_same_recipient" && !mayInformRecipient) {
    key = "payment_thank_you_delivery_same_do_not_inform";
    fallback = DELIVERY_SAME_RECIPIENT_NO_NOTIFY_MESSAGE;
  } else if (variant === "delivery_same_recipient") {
    key = "payment_thank_you_delivery_same_inform";
    fallback = CUSTOMER_PAYMENT_THANK_YOU_MESSAGES.delivery_same_recipient;
  } else if (!mayInformRecipient) {
    key = "payment_thank_you_delivery_different_do_not_inform";
    fallback = CUSTOMER_PAYMENT_THANK_YOU_MESSAGES.delivery_different_recipient.replace(
      "We will inform you and also message recipient before delivery on that day ya!",
      "We will inform you before delivery on that day ya!",
    );
  } else {
    key = "payment_thank_you_delivery_different_inform";
    fallback = CUSTOMER_PAYMENT_THANK_YOU_MESSAGES.delivery_different_recipient;
  }

  return renderCustomerMessageTemplate(key, templates, {}, fallback);
}

export function hasVerifiedPaymentForPaymentThankYou(
  paymentAllocations: readonly Pick<
    OrderPaymentAllocationView,
    "paymentStatus"
  >[],
): boolean {
  return paymentAllocations.some(
    (allocation) => allocation.paymentStatus === "verified",
  );
}
