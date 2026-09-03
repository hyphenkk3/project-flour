"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormCheckbox,
  FormError,
  FormField,
  FormInput,
  FormRadioGroup,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  extraCustomerPickupSlotsForDate,
  extraOrderablePickupDates,
} from "@/engines/extra/extra-pickup";
import {
  FRESH_PICKS_FIXED_DATES_NOTE,
  FRESH_PICKS_NAME_HELP,
  FRESH_PICKS_ORDER_CTA,
  FRESH_PICKS_WHATSAPP_NOTE,
} from "@/engines/extra/customer-fresh-picks";
import {
  formatCustomerPreorderOptionLabel,
  type CustomerComplimentaryOption,
} from "@/engines/orders/customer-preorder-options";
import { formatShortBusinessDate } from "@/lib/dates";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  loadExtraComplimentaryOptions,
  submitGuestExtraOrderAction,
  type ExtraOrderState,
} from "@/workspaces/storefront/extra/actions";
import type { StorefrontExtraPick } from "@/workspaces/storefront/extra/queries";
import type { PhysicalReceiptChoice } from "@/workspaces/storefront/checkout/preorder-draft";

const initialState: ExtraOrderState = { error: null };

type GuestExtraOrderFormProps = {
  extra: StorefrontExtraPick;
  hoursSnapshot?: OperatingHoursSnapshot;
};

export function GuestExtraOrderForm({
  extra,
  hoursSnapshot = OPERATING_HOURS_SEED,
}: GuestExtraOrderFormProps) {
  const [state, formAction, pending] = useActionState(
    submitGuestExtraOrderAction,
    initialState,
  );
  const window = {
    pickupAvailableFromAt: extra.pickupAvailableFromAt ?? "",
    orderCutoffAt: extra.pickupThroughAt ?? "",
  };
  const dates = extraOrderablePickupDates(window, undefined, hoursSnapshot);
  const [pickupDate, setPickupDate] = useState(dates[0] ?? "");
  const [pickupTime, setPickupTime] = useState("");
  const [receiptRequested, setReceiptRequested] = useState(false);
  const [includeReceiptChoice, setIncludeReceiptChoice] =
    useState<PhysicalReceiptChoice>("");
  const [complimentaryOptions, setComplimentaryOptions] = useState<
    CustomerComplimentaryOption[]
  >([]);
  const [complimentaryCodes, setComplimentaryCodes] = useState<string[]>([]);

  const usableSlots = extraCustomerPickupSlotsForDate(
    pickupDate,
    window,
    undefined,
    hoursSnapshot,
  );
  const timeStillValid = usableSlots.some((slot) => slot.value === pickupTime);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!pickupDate) {
        setComplimentaryOptions([]);
        setComplimentaryCodes([]);
        return;
      }
      const next = await loadExtraComplimentaryOptions(pickupDate);
      if (cancelled) return;
      setComplimentaryOptions(next.complimentaryOptions);
      setComplimentaryCodes((current) =>
        current.filter((code) =>
          next.complimentaryOptions.some((option) => option.code === code),
        ),
      );
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [pickupDate]);

  function toggleComplimentary(code: string, selected: boolean) {
    setComplimentaryCodes((current) =>
      selected
        ? Array.from(new Set([...current, code]))
        : current.filter((entry) => entry !== code),
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input name="extra_stock_id" type="hidden" value={extra.id} />

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Pickup
        </h2>
        <p className="text-skyline text-sm leading-relaxed">
          {FRESH_PICKS_FIXED_DATES_NOTE}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-medium text-ink"
              htmlFor="pickup_date"
            >
              Pickup date
            </label>
            <FormSelect
              id="pickup_date"
              name="pickup_date"
              onChange={(event) => {
                const next = event.target.value;
                setPickupDate(next);
                const nextSlots = extraCustomerPickupSlotsForDate(
                  next,
                  window,
                  undefined,
                  hoursSnapshot,
                );
                setPickupTime(nextSlots[0]?.value ?? "");
              }}
              required
              value={pickupDate}
            >
              {dates.map((date) => (
                <option key={date} value={date}>
                  {formatShortBusinessDate(date)}
                </option>
              ))}
            </FormSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-medium text-ink"
              htmlFor="pickup_time"
            >
              Pickup time
            </label>
            <FormSelect
              id="pickup_time"
              name="pickup_time"
              onChange={(event) => setPickupTime(event.target.value)}
              required
              value={timeStillValid ? pickupTime : ""}
            >
              <option value="">Choose a time</option>
              {usableSlots.map((slot) => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))}
            </FormSelect>
          </div>
        </div>
      </section>

      {extra.unitPrice != null ? (
        <p className="text-ink text-sm font-semibold">
          Total · {formatRm(extra.unitPrice)}
        </p>
      ) : null}

      {complimentaryOptions.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Options
          </h2>
          <div className="space-y-2">
            <p className="text-ink text-sm font-medium">Complimentary</p>
            {complimentaryOptions.map((option) => (
              <FormCheckbox
                checked={complimentaryCodes.includes(option.code)}
                key={option.code}
                label={formatCustomerPreorderOptionLabel(option.name, 0)}
                name="complimentary_code"
                onChange={(event) =>
                  toggleComplimentary(option.code, event.target.checked)
                }
                value={option.code}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Customer
        </h2>
        <FormField
          help={FRESH_PICKS_NAME_HELP}
          htmlFor="customer_name"
          label="Name"
        >
          <FormInput id="customer_name" name="customer_name" required />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            help={FRESH_PICKS_WHATSAPP_NOTE}
            htmlFor="phone"
            label="WhatsApp phone"
          >
            <FormInput id="phone" name="phone" required type="tel" />
          </FormField>
          <FormField
            help="For a copy of your order"
            htmlFor="email"
            label="Email (optional)"
          >
            <FormInput
              id="email"
              name="email"
              required={receiptRequested}
              type="email"
            />
          </FormField>
        </div>
        <FormCheckbox
          checked={receiptRequested}
          label="Email me a copy of my order"
          name="email_submission_receipt_requested"
          onChange={(event) => setReceiptRequested(event.target.checked)}
        />
        <FormRadioGroup
          legend="Would you like a copy of the receipt? (will be attached during pickup)"
          name="include_receipt"
          onChange={(value) =>
            setIncludeReceiptChoice(
              value === "yes" || value === "no" ? value : "",
            )
          }
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          required
          value={includeReceiptChoice}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Notes
        </h2>
        <FormField htmlFor="notes" label="Optional notes">
          <FormTextarea id="notes" name="notes" rows={3} />
        </FormField>
      </section>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton disabled={usableSlots.length === 0} pending={pending}>
          {FRESH_PICKS_ORDER_CTA}
        </FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          href="/extra"
        >
          Back
        </Link>
      </FormActions>
    </form>
  );
}
