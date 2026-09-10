/**
 * Fresh Pick pickup-window draft used by Extra Board and Calendar.
 */

import {
  clampExtraOrderCutoffDate,
  defaultExtraOrderCutoffSlot,
  defaultExtraPickupFromSlot,
  extraFreshPickDates,
  extraFreshPickDay,
  extraPickupThroughIso,
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
  const fromIso = extraPickupThroughIso(pickupFromDate, pickupFromSlot);
  const cutoffDate = todayYmd;
  let cutoffSlot =
    defaultExtraOrderCutoffSlot({
      cutoffDate,
      todayYmd,
      notBeforeIso: fromIso ?? undefined,
    }) ?? "";
  if (!cutoffSlot && extraFreshPickDates(todayYmd).tomorrow) {
    return {
      pickupFromDate,
      pickupFromSlot,
      cutoffDate: extraFreshPickDates(todayYmd).tomorrow!,
      cutoffSlot:
        defaultExtraOrderCutoffSlot({
          cutoffDate: extraFreshPickDates(todayYmd).tomorrow!,
          todayYmd,
          notBeforeIso: fromIso ?? undefined,
        }) ?? "",
    };
  }
  return { pickupFromDate, pickupFromSlot, cutoffDate, cutoffSlot };
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
    next.cutoffDate = clampExtraOrderCutoffDate(
      next.pickupFromDate,
      next.cutoffDate,
    );
  }
  if (patch.pickupFromDate || patch.pickupFromSlot || patch.cutoffDate) {
    const fromIso = extraPickupThroughIso(
      next.pickupFromDate,
      next.pickupFromSlot,
    );
    if (patch.cutoffSlot == null) {
      next.cutoffSlot =
        defaultExtraOrderCutoffSlot({
          cutoffDate: next.cutoffDate,
          todayYmd,
          notBeforeIso: fromIso ?? undefined,
        }) ?? "";
    }
  }
  return next;
}
