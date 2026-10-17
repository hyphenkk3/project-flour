/**
 * Fresh Pick pickup-window draft used by Extra Board and Calendar.
 */

import {
  defaultExtraPickupFromSlot,
  extraFreshPickDay,
} from "@/engines/extra/fresh-picks-eligibility";

export type ExtraWindowDraft = {
  pickupFromDate: string;
  pickupFromSlot: string;
  cutoffDate: string;
  cutoffSlot: string;
};

export function initialExtraWindow(
  todayYmd: string,
  preparedOn?: string | null,
): ExtraWindowDraft {
  const locked = extraFreshPickDay(preparedOn ?? null, todayYmd);
  const pickupFromDate = locked && preparedOn ? preparedOn : todayYmd;
  const pickupFromSlot =
    defaultExtraPickupFromSlot({ pickupFromDate, todayYmd }) ?? "";
  return { pickupFromDate, pickupFromSlot, cutoffDate: "", cutoffSlot: "" };
}

export function nextExtraWindow(
  base: ExtraWindowDraft,
  patch: Partial<ExtraWindowDraft>,
  todayYmd: string,
): ExtraWindowDraft {
  const next = { ...base, ...patch };
  if (patch.pickupFromDate && patch.pickupFromSlot == null) {
    next.pickupFromSlot =
      defaultExtraPickupFromSlot({
        pickupFromDate: patch.pickupFromDate,
        todayYmd,
      }) ?? "";
  }
  if (patch.pickupFromDate && patch.cutoffDate == null) {
    next.cutoffDate = "";
    next.cutoffSlot = "";
  }
  if (patch.cutoffDate != null && patch.cutoffSlot == null) {
    next.cutoffSlot = "";
  }
  return next;
}
