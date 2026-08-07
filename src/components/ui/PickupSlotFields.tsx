"use client";

import { useEffect, useState } from "react";
import {
  earliestPickupDateYmd,
  getPickupSlotsForDate,
  normalizePickupTimeValue,
} from "@/engines/business-calendar/pickup-slots";
import { FormField, FormInput, FormSelect } from "@/components/ui/form";

type PickupSlotFieldsProps = {
  dateName?: string;
  timeName?: string;
  dateId?: string;
  timeId?: string;
  defaultDate?: string;
  defaultTime?: string;
  required?: boolean;
  onDateChange?: (date: string) => void;
  onTimeChange?: (time: string) => void;
};

export function PickupSlotFields({
  dateName = "pickup_date",
  timeName = "pickup_time",
  dateId = "pickup_date",
  timeId = "pickup_time",
  defaultDate,
  defaultTime,
  required = true,
  onDateChange,
  onTimeChange,
}: PickupSlotFieldsProps) {
  const minDate = earliestPickupDateYmd();
  const [date, setDate] = useState(defaultDate ?? "");
  const [time, setTime] = useState(() =>
    defaultTime ? normalizePickupTimeValue(defaultTime) : "",
  );

  const slots = date ? getPickupSlotsForDate(date) : [];

  useEffect(() => {
    if (!date || !time) return;
    const stillValid = getPickupSlotsForDate(date).some(
      (slot) => slot.value === time,
    );
    if (!stillValid) {
      setTime("");
      onTimeChange?.("");
    }
  }, [date, time, onTimeChange]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField htmlFor={dateId} label="Pickup date">
        <FormInput
          id={dateId}
          min={minDate}
          name={dateName}
          onChange={(event) => {
            const next = event.target.value;
            setDate(next);
            onDateChange?.(next);
          }}
          required={required}
          type="date"
          value={date}
        />
      </FormField>
      <FormField htmlFor={timeId} label="Pickup time">
        <FormSelect
          disabled={!date || slots.length === 0}
          id={timeId}
          name={timeName}
          onChange={(event) => {
            const next = event.target.value;
            setTime(next);
            onTimeChange?.(next);
          }}
          required={required}
          value={time}
        >
          <option value="">
            {date ? "Choose a time" : "Choose a date first"}
          </option>
          {slots.map((slot) => (
            <option key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </FormSelect>
      </FormField>
    </div>
  );
}
