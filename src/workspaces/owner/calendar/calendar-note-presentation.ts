export const CALENDAR_ORDER_NOTE_LABEL = "Order Note";

/** Customer notes are a separate informational signal, never bakery attention. */
export function hasCalendarCustomerNote(
  customerNotes: string | null | undefined,
): boolean {
  return Boolean(customerNotes?.trim());
}
