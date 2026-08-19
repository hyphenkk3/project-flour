"use client";

import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  customerFulfilmentAvailability,
  type CustomerFulfilmentAvailability,
} from "@/engines/orders/customer-fulfilment-availability";
import type { CustomerWebsiteFulfilmentMethod } from "@/engines/orders/fulfilment";

const METHODS: Array<{
  value: CustomerWebsiteFulfilmentMethod;
  label: string;
}> = [
  { value: "pickup", label: "Pickup" },
  { value: "dine_in", label: "Dine-in" },
  { value: "delivery", label: "Delivery" },
];

type FulfilmentMethodChooserProps = {
  dateYmd: string;
  closedDates: readonly string[];
  value: CustomerWebsiteFulfilmentMethod;
  onChange: (value: CustomerWebsiteFulfilmentMethod) => void;
  hoursSnapshot?: OperatingHoursSnapshot;
};

function optionClass(available: boolean, selected: boolean): string {
  if (!available) {
    return "border-fog bg-fog/40 text-skyline cursor-not-allowed";
  }
  if (selected) {
    return "border-[var(--color-signal)] bg-white text-ink";
  }
  return "border-fog bg-white text-ink";
}

export function FulfilmentMethodChooser({
  dateYmd,
  closedDates,
  value,
  onChange,
  hoursSnapshot = OPERATING_HOURS_SEED,
}: FulfilmentMethodChooserProps) {
  const availability = customerFulfilmentAvailability(
    dateYmd,
    closedDates,
    hoursSnapshot,
  );

  return (
    <fieldset className="space-y-2">
      <legend className="text-ink text-sm font-medium">
        How would you like to receive your order?
      </legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {METHODS.map((method) => {
          const state: CustomerFulfilmentAvailability = availability[method.value];
          return (
            <label
              className={`flex min-h-12 items-start gap-3 rounded-lg border px-3 py-2 text-sm ${optionClass(state.available, value === method.value)}`}
              key={method.value}
            >
              <input
                checked={state.available && value === method.value}
                className="mt-1 size-4 accent-[var(--color-signal)] disabled:cursor-not-allowed"
                disabled={!state.available}
                name="fulfilment_method"
                onChange={() => {
                  if (state.available) onChange(method.value);
                }}
                required={state.available && value === method.value}
                type="radio"
                value={method.value}
              />
              <span>
                <span className="block font-medium">{method.label}</span>
                {!state.available && state.reason ? (
                  <span className="mt-0.5 block text-xs">{state.reason}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
