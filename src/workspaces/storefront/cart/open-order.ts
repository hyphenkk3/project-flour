export const STOREFRONT_OPEN_ORDER_EVENT = "whitebird-open-storefront-order";

export function openStorefrontOrder() {
  window.dispatchEvent(new Event(STOREFRONT_OPEN_ORDER_EVENT));
}
