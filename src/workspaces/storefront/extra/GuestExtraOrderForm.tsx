"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormError,
  FormSelect,
  FormSubmitButton,
} from "@/components/ui/form";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  extraCustomerPickupSlotsForDate,
  extraCustomerVisiblePickupDates,
} from "@/engines/extra/extra-pickup";
import {
  FRESH_PICKS_ADD_TO_CART_CTA,
  FRESH_PICKS_ADDED_CONFIRMATION,
  FRESH_PICKS_FIXED_DATES_NOTE,
} from "@/engines/extra/customer-fresh-picks";
import { formatShortBusinessDate } from "@/lib/dates";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontExtraPick } from "@/workspaces/storefront/extra/queries";
import {
  addFreshPickToCart,
  extraIsValidForCartPickup,
  readFreshPickCart,
  writeFreshPickCart,
} from "@/workspaces/storefront/extra/fresh-pick-cart";

type GuestExtraOrderFormProps = {
  extra: StorefrontExtraPick;
  hoursSnapshot?: OperatingHoursSnapshot;
};

export function GuestExtraOrderForm({
  extra,
  hoursSnapshot = OPERATING_HOURS_SEED,
}: GuestExtraOrderFormProps) {
  const pickupWindow = {
    pickupAvailableFromAt: extra.pickupAvailableFromAt ?? "",
    orderCutoffAt: extra.pickupThroughAt ?? "",
  };
  const dates = extraCustomerVisiblePickupDates(
    pickupWindow,
    undefined,
    hoursSnapshot,
  );
  const [pickupDate, setPickupDate] = useState(dates[0] ?? "");
  const [pickupTime, setPickupTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<number | null>(null);

  const usableSlots = extraCustomerPickupSlotsForDate(
    pickupDate,
    pickupWindow,
    undefined,
    hoursSnapshot,
  );
  const timeStillValid = usableSlots.some((slot) => slot.value === pickupTime);

  useEffect(() => {
    const existing = readFreshPickCart();
    if (
      !existing?.pickupDate ||
      !existing.pickupTime ||
      !extra.pickupAvailableFromAt ||
      !extra.pickupThroughAt
    ) {
      return;
    }
    if (
      extraIsValidForCartPickup({
        pickupDate: existing.pickupDate,
        pickupTime: existing.pickupTime,
        pickupAvailableFromAt: extra.pickupAvailableFromAt,
        orderCutoffAt: extra.pickupThroughAt,
      })
    ) {
      setPickupDate(existing.pickupDate);
      setPickupTime(existing.pickupTime);
    }
  }, [
    extra.pickupAvailableFromAt,
    extra.pickupThroughAt,
  ]);

  useEffect(() => {
    return () => {
      if (addedTimer.current) window.clearTimeout(addedTimer.current);
    };
  }, []);

  function addToCart() {
    setError(null);
    const result = addFreshPickToCart(readFreshPickCart(), {
      extraStockId: extra.id,
      cakeName: extra.cakeName,
      sizeLabel: extra.sizeLabel,
      unitPrice: extra.unitPrice,
      imageUrl: extra.imageUrl,
      pickupDate,
      pickupTime: timeStillValid ? pickupTime : "",
      pickupAvailableFromAt: extra.pickupAvailableFromAt ?? "",
      orderCutoffAt: extra.pickupThroughAt ?? "",
    });
    if (!result.ok) {
      setAdded(false);
      setError(result.error);
      return;
    }
    writeFreshPickCart(result.cart);
    setAdded(true);
    if (addedTimer.current) window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setAdded(false), 2400);
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        addToCart();
      }}
    >
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
                  pickupWindow,
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
          {formatRm(extra.unitPrice)}
        </p>
      ) : null}

      <FormError message={error} />
      {added ? (
        <p className="text-signal text-sm" role="status">
          {FRESH_PICKS_ADDED_CONFIRMATION}
        </p>
      ) : null}

      <FormActions>
        <FormSubmitButton
          disabled={usableSlots.length === 0}
          type="submit"
        >
          {FRESH_PICKS_ADD_TO_CART_CTA}
        </FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          href="/extra"
        >
          Continue shopping
        </Link>
      </FormActions>
    </form>
  );
}
