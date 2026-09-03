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
  /**
   * Dates unavailable for the current cart / monthly collection entry
   * (e.g. special-menu windows). Native date input cannot grey them out;
   * selection is rejected when `rejectExcludedDates` is true.
   */
  excludedDates?: readonly string[];
  rejectExcludedDates?: boolean;
  excludedDateMessage?: string;
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
  /**
   * Dates that cannot be newly selected (e.g. Fully Booked for the current cart).
   * The currently displayed value is kept if it is in this list.
   */
  unavailableDates?: readonly string[];
  unavailableDateMessageFor?: (ymd: string) => string;
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
  excludedDates = [],
  rejectExcludedDates = false,
  excludedDateMessage = "This date is reserved for the Special Menu.",
  minDate: minDateProp,
  maxDate,
  slotsForDate,
  hoursSnapshot = OPERATING_HOURS_SEED,
  showDate = true,
  showTime = true,
  includeFieldNames = true,
  unavailableDates = [],
  unavailableDateMessageFor,
}: PickupSlotFieldsProps) {
  const earliest = earliestPickupDateYmd();
  const minDate = minDateProp?.trim() || earliest;
  const [date, setDate] = useState(defaultDate ?? "");
  const [time, setTime] = useState(() =>
    defaultTime ? normalizePickupTimeValue(defaultTime) : "",
  );
  const [excludedNotice, setExcludedNotice] = useState(false);
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(
    null,
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
    if (defaultDate === undefined) return;
    setDate((current) => (current === defaultDate ? current : defaultDate));
  }, [defaultDate]);

  useEffect(() => {
    if (defaultTime === undefined) return;
    const normalized = defaultTime
      ? normalizePickupTimeValue(defaultTime)
      : "";
    setTime((current) => (current === normalized ? current : normalized));
  }, [defaultTime]);

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
              if (
                rejectExcludedDates &&
                next &&
                excludedDates.includes(next)
              ) {
                setExcludedNotice(true);
                setUnavailableNotice(null);
                event.target.value = date;
                return;
              }
              if (next && next !== date && unavailableDates.includes(next)) {
                setUnavailableNotice(
                  unavailableDateMessageFor?.(next) ??
                    "Fully Booked for your current order.",
                );
                setExcludedNotice(false);
                event.target.value = date;
                return;
              }
              setExcludedNotice(false);
              setUnavailableNotice(null);
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
      {excludedNotice ||
      (date && excludedDates.includes(date) && !rejectExcludedDates) ? (
        <p className="text-status-danger text-sm font-medium sm:col-span-2" role="status">
          {excludedDateMessage}
        </p>
      ) : null}
      {unavailableNotice ? (
        <p className="text-ink text-sm leading-relaxed sm:col-span-2" role="status">
          {unavailableNotice}
        </p>
      ) : null}
      {ordersClosed ? (
        <p className="text-sm font-medium text-red-800 sm:col-span-2" role="status">
          {ORDERS_CLOSED_CUSTOMER_LABEL}
        </p>
      ) : null}
    </div>
  );
}
