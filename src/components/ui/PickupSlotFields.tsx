"use client";

import { useEffect, useState } from "react";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  ORDERS_CLOSED_CUSTOMER_LABEL,
  customerPickupSlotsForDate,
  isPickupOrdersClosed,
} from "@/engines/business-calendar/order-availability";
import {
  earliestPickupDateYmd,
  normalizePickupTimeValue,
  type PickupSlot,
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
  timeHelp?: string;
  /** Pickup dates closed for new customer preorders. Staff create omits this. */
  closedDates?: readonly string[];
  /** First selectable pickup date. Defaults to the earliest legal pickup date. */
  minDate?: string;
  /** Last selectable pickup date (latest published monthly catalogue). */
  maxDate?: string;
  /** Override slot list (Dine-in / Delivery windows). Default: pickup slots. */
  slotsForDate?: (
    dateYmd: string,
    closedDates: readonly string[],
  ) => PickupSlot[];
  hoursSnapshot?: OperatingHoursSnapshot;
  showDate?: boolean;
  showTime?: boolean;
  /** When false, date/time inputs are display-only (not submitted). */
  includeFieldNames?: boolean;
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
  timeHelp,
  closedDates = [],
  minDate: minDateProp,
  maxDate,
  slotsForDate,
  hoursSnapshot = OPERATING_HOURS_SEED,
  showDate = true,
  showTime = true,
  includeFieldNames = true,
}: PickupSlotFieldsProps) {
  const earliest = earliestPickupDateYmd();
  const minDate =
    minDateProp && minDateProp > earliest ? minDateProp : earliest;
  const [date, setDate] = useState(defaultDate ?? "");
  const [time, setTime] = useState(() =>
    defaultTime ? normalizePickupTimeValue(defaultTime) : "",
  );

  const ordersClosed = date
    ? isPickupOrdersClosed(date, closedDates)
    : false;
  const resolveSlots =
    slotsForDate ??
    ((dateYmd: string, closed: readonly string[]) =>
      customerPickupSlotsForDate(dateYmd, closed, hoursSnapshot));
  const slots = date ? resolveSlots(date, closedDates) : [];

  useEffect(() => {
    if (!date || !time) return;
    const stillValid = resolveSlots(date, closedDates).some(
      (slot) => slot.value === time,
    );
    if (!stillValid) {
      setTime("");
      onTimeChange?.("");
    }
  }, [closedDates, date, hoursSnapshot, onTimeChange, slotsForDate, time]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showDate ? (
        <FormField htmlFor={dateId} label={dateLabel}>
          <FormInput
            id={dateId}
            max={maxDate || undefined}
            min={minDate}
            name={includeFieldNames ? dateName : undefined}
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
      ) : null}
      {showTime ? (
        <FormField help={timeHelp} htmlFor={timeId} label={timeLabel}>
          <FormSelect
            disabled={!date || slots.length === 0 || ordersClosed}
            id={timeId}
            name={includeFieldNames ? timeName : undefined}
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
      ) : null}
      {ordersClosed ? (
        <p className="text-sm font-medium text-red-800 sm:col-span-2" role="status">
          {ORDERS_CLOSED_CUSTOMER_LABEL}
        </p>
      ) : null}
    </div>
  );
}
