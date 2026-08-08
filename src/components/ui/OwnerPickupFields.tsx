"use client";

import { useMemo, useState } from "react";
import {
  earliestPickupDateYmd,
  getPickupSlotsForDate,
  isValidPickupSlot,
  normalizePickupTimeValue,
} from "@/engines/business-calendar/pickup-slots";
import { FormField, FormInput, FormSelect } from "@/components/ui/form";

const CUSTOM_VALUE = "__custom__";

type OwnerPickupFieldsProps = {
  defaultDate?: string;
  defaultTime?: string;
  defaultInstruction?: string | null;
  onDateChange?: (date: string) => void;
};

/**
 * Owner staff entry / edit: public slots plus any valid clock time.
 * Customer storefront continues to use PickupSlotFields (slots only).
 */
export function OwnerPickupFields({
  defaultDate,
  defaultTime,
  defaultInstruction,
  onDateChange,
}: OwnerPickupFieldsProps) {
  const minDate = earliestPickupDateYmd();
  const initialTime = defaultTime
    ? normalizePickupTimeValue(defaultTime)
    : "";
  const initialIsCustom =
    Boolean(initialTime) &&
    Boolean(defaultDate) &&
    !isValidPickupSlot(defaultDate!, initialTime);

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
    () => (date ? getPickupSlotsForDate(date) : []),
    [date],
  );

  const effectiveTime = mode === "custom" ? customTime : slotTime;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="pickup_date" label="Pickup date">
          <FormInput
            id="pickup_date"
            min={minDate}
            name="pickup_date"
            onChange={(event) => {
              const next = event.target.value;
              setDate(next);
              onDateChange?.(next);
              if (mode === "slot" && slotTime) {
                const stillValid = getPickupSlotsForDate(next).some(
                  (slot) => slot.value === slotTime,
                );
                if (!stillValid) setSlotTime("");
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
          label="Pickup time"
        >
          <FormSelect
            disabled={!date}
            id="pickup_time_mode"
            onChange={(event) => {
              const value = event.target.value;
              if (value === CUSTOM_VALUE) {
                setMode("custom");
                return;
              }
              setMode("slot");
              setSlotTime(value);
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
            onChange={(event) => setCustomTime(event.target.value)}
            required
            type="time"
            value={customTime}
          />
        </FormField>
      ) : null}

      <input name="pickup_time" type="hidden" value={effectiveTime} />

      <FormField
        help='Optional wording such as "Before 3pm". Does not replace pickup time.'
        htmlFor="pickup_instruction"
        label="Pickup instruction (optional)"
      >
        <FormInput
          defaultValue={defaultInstruction ?? ""}
          id="pickup_instruction"
          name="pickup_instruction"
          placeholder="Before 3pm, early collection…"
        />
      </FormField>
    </div>
  );
}
