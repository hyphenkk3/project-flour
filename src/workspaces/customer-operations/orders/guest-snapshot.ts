import type { Customer } from "@/types/customer";

export type OperationalGuestSnapshot = {
  guestName: string;
  guestPhone: string | null;
};

/**
 * Copy CRM identity onto the operational guest snapshot.
 * Does not write `customer_id` and does not merge identities.
 */
export function guestSnapshotFromCrmCustomer(
  customer: Pick<Customer, "fullName" | "phoneNumber">,
): OperationalGuestSnapshot {
  const guestName = customer.fullName.trim();
  const phone = customer.phoneNumber?.trim() ?? "";
  return {
    guestName,
    guestPhone: phone.length > 0 ? phone : null,
  };
}
