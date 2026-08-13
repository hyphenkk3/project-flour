/**
 * Persist Quick View across server-action remounts after Propose EXTRA.
 * Nested dialog + default Next action refresh was dismissing Quick View.
 */

const QV_ORDER_KEY = "wos.calendar.quickViewOrderId";
const PROPOSED_ITEM_KEY = "wos.calendar.extraProposedItemId";

export function rememberCalendarQuickViewOrder(orderId: string): void {
  try {
    sessionStorage.setItem(QV_ORDER_KEY, orderId);
  } catch {
    // private mode / unavailable
  }
}

export function clearRememberedCalendarQuickViewOrder(): void {
  try {
    sessionStorage.removeItem(QV_ORDER_KEY);
  } catch {
    // ignore
  }
}

export function takeRememberedCalendarQuickViewOrder(): string | null {
  try {
    const value = sessionStorage.getItem(QV_ORDER_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function rememberCalendarExtraProposedItem(itemId: string): void {
  try {
    sessionStorage.setItem(PROPOSED_ITEM_KEY, itemId);
  } catch {
    // ignore
  }
}

export function takeRememberedCalendarExtraProposedItem(): string | null {
  try {
    const value = sessionStorage.getItem(PROPOSED_ITEM_KEY);
    if (value) sessionStorage.removeItem(PROPOSED_ITEM_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
