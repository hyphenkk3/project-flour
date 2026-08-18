"use client";

import { useEffect, useState } from "react";
import {
  ORDERS_CLOSED_CUSTOMER_LABEL,
  customerPickupSlotsForDate,
  isPickupOrdersClosed,
} from "@/engines/business-calendar/order-availability";
import {
  earliestPickupDateYmd,
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
  dateLabel?: string;
  timeLabel?: string;
  /** Pickup dates closed for new customer preorders. Staff create omits this. */
  closedDates?: readonly string[];
  /** Last selectable pickup date (latest published monthly catalogue). */
  maxDate?: string;
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
  dateLabel = "Pickup date",
  timeLabel = "Pickup time",
  closedDates = [],
  maxDate,
}: PickupSlotFieldsProps) {
  const minDate = earliestPickupDateYmd();
  const [date, setDate] = useState(defaultDate ?? "");
  const [time, setTime] = useState(() =>
    defaultTime ? normalizePickupTimeValue(defaultTime) : "",
  );

  const ordersClosed = date
    ? isPickupOrdersClosed(date, closedDates)
    : false;
  const slots = date ? customerPickupSlotsForDate(date, closedDates) : [];

  useEffect(() => {
    if (!date || !time) return;
    const stillValid = customerPickupSlotsForDate(date, closedDates).some(
      (slot) => slot.value === time,
    );
    if (!stillValid) {
      setTime("");
      onTimeChange?.("");
    }
  }, [closedDates, date, time, onTimeChange]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField htmlFor={dateId} label={dateLabel}>
        <FormInput
          id={dateId}
          max={maxDate || undefined}
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
      <FormField htmlFor={timeId} label={timeLabel}>
        <FormSelect
          disabled={!date || slots.length === 0 || ordersClosed}
          id={timeId}
          name={timeName}
          onChange={(event) => {
            const next = event.target.value;
            setTime(next);
            onTimeChange?.(next);
          }}
          required={required && !ordersClosed}
          value={time}
        >
          <option value="">
            {ordersClosed
              ? ORDERS_CLOSED_CUSTOMER_LABEL
              : date
                ? "Choose a time"
                : "Choose a date first"}
          </option>
          {slots.map((slot) => (
            <option key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </FormSelect>
      </FormField>
      {ordersClosed ? (
        <p className="text-sm font-medium text-red-800 sm:col-span-2" role="status">
          {ORDERS_CLOSED_CUSTOMER_LABEL}
        </p>
      ) : null}
    </div>
  );
}
