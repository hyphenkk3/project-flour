"use server";

import { normalizePhysicalVoucherNumber } from "@/engines/vouchers/physical-rm10";
import { requireStaff } from "@/foundation/auth/session";
import { getManagedRm10CardByNormalizedNumber } from "@/workspaces/library/vouchers/rm10/queries";

export type ManagedRm10LookupResult = {
  found: boolean;
  voucherNumber: string | null;
  expiryDate: string | null;
};

export async function lookupManagedRm10CardAction(
  voucherNumber: string,
): Promise<ManagedRm10LookupResult> {
  await requireStaff();
  const normalized = normalizePhysicalVoucherNumber(voucherNumber);
  if (!normalized) {
    return { found: false, voucherNumber: null, expiryDate: null };
  }

  const card = await getManagedRm10CardByNormalizedNumber(normalized);
  if (!card) {
    return { found: false, voucherNumber: null, expiryDate: null };
  }

  return {
    found: true,
    voucherNumber: card.voucherNumber,
    expiryDate: card.expiryDate,
  };
}
