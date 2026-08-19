"use client";

import { useMemo, useState } from "react";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  earliestPickupDateYmd,
  getPickupSlotsForDate,
  isValidPickupSlot,
  normalizePickupTimeValue,
} from "@/engines/business-calendar/pickup-slots";
import {
  getEffectivePickupSchedule,
  getStaffPickupExceptionWarning,
} from "@/engines/business-calendar/pickup-schedule";
import { FormField, FormInput, FormSelect } from "@/components/ui/form";

const CUSTOM_VALUE = "__custom__";

type OwnerPickupFieldsProps = {
  defaultDate?: string;
  defaultTime?: string;
  onDateChange?: (date: string) => void;
  onTimeChange?: (time: string) => void;
  /** Contextual schedule labels (Delivery reuses pickup_date / pickup_time). */
  dateLabel?: string;
  timeLabel?: string;
  hoursSnapshot?: OperatingHoursSnapshot;
};

/**
 * Owner staff entry / edit: public slots plus any valid clock time.
 * Customer storefront continues to use PickupSlotFields (slots only).
 * Free-text pickupInstruction is retired from Owner UI (legacy values remain in DB).
 *
 * Closed / outside-hours selections remain allowed; warnings only.
 */
export function OwnerPickupFields({
  defaultDate,
  defaultTime,
  onDateChange,
  onTimeChange,
  dateLabel = "Pickup date",
  timeLabel = "Pickup time",
  hoursSnapshot = OPERATING_HOURS_SEED,
}: OwnerPickupFieldsProps) {
  const minDate = earliestPickupDateYmd();
  const initialTime = defaultTime
    ? normalizePickupTimeValue(defaultTime)
    : "";
  const initialIsCustom =
    Boolean(initialTime) &&
    Boolean(defaultDate) &&
    !isValidPickupSlot(defaultDate!, initialTime, hoursSnapshot);

  const [date, setDate] = useState(defaultDate ?? "");
  const [mode, setMode] = useState<"slot" | "custom">(
    initialIsCustom ? "custom" : "slot",
  );
  const [slotTime, setSlotTime] = useState(
    initialIsCustom ? "" : initialTime,
  );
  const [customTime, setCustomTime] = useState(
    initialIsCustom ? initialTime : "",
  );

  const slots = useMemo(
    () => (date ? getPickupSlotsForDate(date, hoursSnapshot) : []),
    [date, hoursSnapshot],
  );

  const effectiveTime = mode === "custom" ? customTime : slotTime;

  function setSlotAndNotify(next: string) {
    setSlotTime(next);
    onTimeChange?.(next);
  }

  function setCustomAndNotify(next: string) {
    setCustomTime(next);
    onTimeChange?.(next);
  }

  const exceptionWarning = useMemo(() => {
    if (!date) return null;
    const schedule = getEffectivePickupSchedule(date, hoursSnapshot);
    const normalized = effectiveTime
      ? normalizePickupTimeValue(effectiveTime)
      : "";
    return getStaffPickupExceptionWarning(date, normalized || null, schedule);
  }, [date, effectiveTime, hoursSnapshot]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="pickup_date" label={dateLabel}>
          <FormInput
            id="pickup_date"
            min={minDate}
            name="pickup_date"
            onChange={(event) => {
              const next = event.target.value;
              setDate(next);
              onDateChange?.(next);
              if (mode === "slot" && slotTime) {
                const stillValid = getPickupSlotsForDate(next, hoursSnapshot).some(
                  (slot) => slot.value === slotTime,
                );
                if (!stillValid) setSlotAndNotify("");
              }
            }}
            required
            type="date"
            value={date}
          />
        </FormField>

        <FormField
          help="Choose a public slot, or Custom time for special arrangements."
          htmlFor="pickup_time_mode"
          label={timeLabel}
        >
          <FormSelect
            disabled={!date}
            id="pickup_time_mode"
            onChange={(event) => {
              const value = event.target.value;
              if (value === CUSTOM_VALUE) {
                setMode("custom");
                onTimeChange?.(customTime);
                return;
              }
              setMode("slot");
              setSlotAndNotify(value);
            }}
            required={mode === "slot"}
            value={mode === "custom" ? CUSTOM_VALUE : slotTime}
          >
            <option value="">
              {date ? "Choose a time" : "Choose a date first"}
            </option>
            {slots.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
            <option value={CUSTOM_VALUE}>Custom time…</option>
          </FormSelect>
        </FormField>
      </div>

      {mode === "custom" ? (
        <FormField
          help="Stored as a normal clock time for Calendar sorting."
          htmlFor="pickup_time_custom"
          label="Custom clock time"
        >
          <FormInput
            id="pickup_time_custom"
            onChange={(event) => setCustomAndNotify(event.target.value)}
            required
            type="time"
            value={customTime}
          />
        </FormField>
      ) : null}

      {exceptionWarning ? (
        <p
          className="border-status-warning/30 bg-status-warning-soft text-status-warning rounded-lg border px-4 py-3 text-sm"
          role="status"
        >
          {exceptionWarning.message}
        </p>
      ) : null}

      <input name="pickup_time" type="hidden" value={effectiveTime} />
    </div>
  );
}
