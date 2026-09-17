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
  extraCustomerSameDayUnavailableNotice,
  extraCustomerVisibleFulfilmentDates,
  firstAvailableFreshPicksFulfilment,
  freshPicksChooserStates,
  freshPicksMethodAvailability,
} from "@/engines/extra/fresh-picks-fulfilment";
import {
  DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  type FreshPicksPreparationConfig,
} from "@/engines/extra/fresh-picks-preparation";
import {
  FRESH_PICKS_ADD_TO_CART_CTA,
  FRESH_PICKS_ADDED_CONFIRMATION,
  FRESH_PICKS_ADDED_TO_CART_CTA,
  FRESH_PICKS_FIXED_DATES_NOTE,
} from "@/engines/extra/customer-fresh-picks";
import {
  parseCustomerWebsiteFulfilmentMethod,
  type CustomerWebsiteFulfilmentMethod,
  workspaceScheduleDateLabel,
  workspaceScheduleTimeLabel,
} from "@/engines/orders/fulfilment";
import { formatShortBusinessDate } from "@/lib/dates";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import { FulfilmentMethodChooser } from "@/workspaces/storefront/checkout/FulfilmentMethodChooser";
import type { StorefrontExtraPick } from "@/workspaces/storefront/extra/queries";
import {
  addFreshPickToCart,
  extraIsValidForCartPickup,
  freshPickCartHasExtra,
  readFreshPickCart,
  writeFreshPickCart,
} from "@/workspaces/storefront/extra/fresh-pick-cart";
import { useFreshPickCart } from "@/workspaces/storefront/extra/useFreshPickCart";

type GuestExtraOrderFormProps = {
  extra: StorefrontExtraPick;
  hoursSnapshot?: OperatingHoursSnapshot;
  preparationConfig?: FreshPicksPreparationConfig;
};

export function GuestExtraOrderForm({
  extra,
  hoursSnapshot = OPERATING_HOURS_SEED,
  preparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
}: GuestExtraOrderFormProps) {
  const pickupWindow = {
    pickupAvailableFromAt: extra.pickupAvailableFromAt ?? "",
    orderCutoffAt: extra.pickupThroughAt ?? "",
  };
  const fulfilmentContext = {
    window: pickupWindow,
    snapshot: hoursSnapshot,
    config: preparationConfig,
  };
  const dates = extraCustomerVisibleFulfilmentDates(fulfilmentContext);
  const sameDayNotice = extraCustomerSameDayUnavailableNotice(fulfilmentContext);
  const [pickupDate, setPickupDate] = useState(dates[0] ?? "");
  const [fulfilmentMethod, setFulfilmentMethod] =
    useState<CustomerWebsiteFulfilmentMethod>("pickup");
  const [pickupTime, setPickupTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<number | null>(null);
  const cart = useFreshPickCart();
  const inCart = freshPickCartHasExtra(cart, extra.id);

  const methodStates = pickupDate
    ? freshPicksChooserStates(pickupDate, fulfilmentContext)
    : undefined;
  const resolvedMethod = pickupDate
    ? firstAvailableFreshPicksFulfilment(
        pickupDate,
        fulfilmentMethod,
        fulfilmentContext,
      )
    : fulfilmentMethod;
  const methodAvailability = pickupDate
    ? freshPicksMethodAvailability(
        resolvedMethod,
        pickupDate,
        fulfilmentContext,
      )
    : null;
  const usableSlots = methodAvailability?.slots ?? [];
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
      extraIsValidForCartPickup(
        {
          pickupDate: existing.pickupDate,
          pickupTime: existing.pickupTime,
          pickupAvailableFromAt: extra.pickupAvailableFromAt,
          orderCutoffAt: extra.pickupThroughAt,
          fulfilmentMethod: existing.fulfilmentMethod,
        },
        { snapshot: hoursSnapshot, config: preparationConfig },
      )
    ) {
      setPickupDate(existing.pickupDate);
      setPickupTime(existing.pickupTime);
      setFulfilmentMethod(existing.fulfilmentMethod);
    }
  }, [
    extra.pickupAvailableFromAt,
    extra.pickupThroughAt,
    hoursSnapshot,
    preparationConfig,
  ]);

  useEffect(() => {
    return () => {
      if (addedTimer.current) window.clearTimeout(addedTimer.current);
    };
  }, []);

  function addToCart() {
    setError(null);
    if (freshPickCartHasExtra(readFreshPickCart(), extra.id)) {
      setAdded(true);
      return;
    }
    const result = addFreshPickToCart(
      readFreshPickCart(),
      {
        extraStockId: extra.id,
        cakeName: extra.cakeName,
        sizeLabel: extra.sizeLabel,
        unitPrice: extra.unitPrice,
        imageUrl: extra.imageUrl,
        pickupDate,
        pickupTime: timeStillValid ? pickupTime : "",
        fulfilmentMethod: resolvedMethod,
        pickupAvailableFromAt: extra.pickupAvailableFromAt ?? "",
        orderCutoffAt: extra.pickupThroughAt ?? "",
      },
      undefined,
      { snapshot: hoursSnapshot, config: preparationConfig },
    );
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

  const allMethodsUnavailable =
    pickupDate &&
    methodStates &&
    !methodStates.pickup.available &&
    !methodStates.dine_in.available &&
    !methodStates.delivery.available;
  const dateUnavailableMessage = allMethodsUnavailable
    ? methodStates.pickup.reason ||
      methodStates.dine_in.reason ||
      methodStates.delivery.reason
    : null;

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
          Fulfilment
        </h2>
        <p className="text-skyline text-sm leading-relaxed">
          {FRESH_PICKS_FIXED_DATES_NOTE}
        </p>
        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium text-ink"
            htmlFor="pickup_date"
          >
            {workspaceScheduleDateLabel(resolvedMethod)}
          </label>
          <FormSelect
            id="pickup_date"
            name="pickup_date"
            onChange={(event) => {
              const next = event.target.value;
              setPickupDate(next);
              const nextMethod = firstAvailableFreshPicksFulfilment(
                next,
                fulfilmentMethod,
                fulfilmentContext,
              );
              setFulfilmentMethod(nextMethod);
              const nextSlots = freshPicksMethodAvailability(
                nextMethod,
                next,
                fulfilmentContext,
              ).slots;
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
        {pickupDate ? (
          <FulfilmentMethodChooser
            closedDates={[]}
            dateYmd={pickupDate}
            hoursSnapshot={hoursSnapshot}
            includeFieldName={false}
            methodStates={methodStates}
            onChange={(value) => {
              const next = parseCustomerWebsiteFulfilmentMethod(value);
              setFulfilmentMethod(next);
              const nextSlots = freshPicksMethodAvailability(
                next,
                pickupDate,
                fulfilmentContext,
              ).slots;
              setPickupTime(nextSlots[0]?.value ?? "");
            }}
            value={resolvedMethod}
          />
        ) : null}
        {sameDayNotice ? (
          <p className="text-skyline text-sm leading-relaxed" role="status">
            {sameDayNotice}
          </p>
        ) : dateUnavailableMessage ? (
          <p className="text-skyline text-sm leading-relaxed" role="status">
            {dateUnavailableMessage}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium text-ink"
            htmlFor="pickup_time"
          >
            {resolvedMethod === "dine_in"
              ? "Dine-in reservation time"
              : workspaceScheduleTimeLabel(resolvedMethod)}
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
        <FormSubmitButton disabled={usableSlots.length === 0}>
          {inCart ? FRESH_PICKS_ADDED_TO_CART_CTA : FRESH_PICKS_ADD_TO_CART_CTA}
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
