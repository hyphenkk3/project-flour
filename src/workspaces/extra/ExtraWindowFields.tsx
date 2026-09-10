"use client";

import {
  extraFreshPickDates,
  extraOrderCutoffDateOptions,
  extraOrderCutoffSlotsForDate,
  extraPickupFromSlotsForDate,
} from "@/engines/extra/fresh-picks-eligibility";
import type { ExtraWindowDraft } from "@/workspaces/extra/extra-window";

export function ExtraWindowFields({
  value,
  onChange,
  todayYmd,
  disabled,
  fieldClass,
}: {
  value: ExtraWindowDraft;
  onChange: (patch: Partial<ExtraWindowDraft>) => void;
  todayYmd: string;
  disabled: boolean;
  fieldClass: string;
}) {
  const dates = extraFreshPickDates(todayYmd);
  const pickupSlots = extraPickupFromSlotsForDate({
    pickupFromDate: value.pickupFromDate,
    todayYmd,
  });
  const cutoffDates = extraOrderCutoffDateOptions(
    value.pickupFromDate,
    todayYmd,
  );
  const cutoffSlots = extraOrderCutoffSlotsForDate({
    cutoffDate: value.cutoffDate,
    todayYmd,
  });
  return (
    <>
      <label className="block text-sm">
        <span className="text-ink font-medium">Pickup available from</span>
        <select
          className={`${fieldClass} mt-1.5`}
          disabled={disabled}
          onChange={(e) => onChange({ pickupFromDate: e.target.value })}
          value={value.pickupFromDate}
        >
          <option value={dates.today}>Today</option>
          {dates.tomorrow ? (
            <option value={dates.tomorrow}>Tomorrow</option>
          ) : null}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink font-medium">Pickup from time</span>
        <select
          className={`${fieldClass} mt-1.5`}
          disabled={disabled}
          onChange={(e) => onChange({ pickupFromSlot: e.target.value })}
          value={value.pickupFromSlot}
        >
          {pickupSlots.map((slot) => (
            <option disabled={slot.disabled} key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink font-medium">Orders available through</span>
        <select
          className={`${fieldClass} mt-1.5`}
          disabled={disabled}
          onChange={(e) => onChange({ cutoffDate: e.target.value })}
          value={value.cutoffDate}
        >
          {cutoffDates.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink font-medium">Order cutoff time</span>
        <select
          className={`${fieldClass} mt-1.5`}
          disabled={disabled}
          onChange={(e) => onChange({ cutoffSlot: e.target.value })}
          value={value.cutoffSlot}
        >
          {cutoffSlots.map((slot) => (
            <option disabled={slot.disabled} key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-skyline sm:col-span-2 text-xs leading-relaxed">
        Order cutoff is the last time a new customer may place an order.
        Pickup times follow bakery hours and are not cut off at this time.
      </p>
    </>
  );
}
