import { isDeliveryRecipientSameAsOrderingCustomer } from "@/engines/orders/fulfilment";
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
): string {
  const variant = customerPaymentThankYouVariant(order);
  const mayInformRecipient =
    order.delivery?.recipientNotifyPreference === "inform_recipient";

  if (!mayInformRecipient && variant === "delivery_same_recipient") {
    return DELIVERY_SAME_RECIPIENT_NO_NOTIFY_MESSAGE;
  }

  const message = CUSTOMER_PAYMENT_THANK_YOU_MESSAGES[variant];
  if (!mayInformRecipient && variant === "delivery_different_recipient") {
    return message.replace(
      "We will inform you and also message recipient before delivery on that day ya!",
      "We will inform you before delivery on that day ya!",
    );
  }

  return message;
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
