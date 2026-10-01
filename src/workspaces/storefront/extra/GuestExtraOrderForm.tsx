"use client";

import { useActionState, useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormRadioGroup,
  FormRequiredLegend,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  extraCustomerSameDayUnavailableNotice,
  extraCustomerVisibleFulfilmentDates,
  freshPicksMethodAvailability,
} from "@/engines/extra/fresh-picks-fulfilment";
import {
  DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  type FreshPicksPreparationConfig,
} from "@/engines/extra/fresh-picks-preparation";
import {
  FRESH_PICKS_FIXED_DATES_NOTE,
  FRESH_PICKS_NAME_HELP,
  FRESH_PICKS_ORDER_CTA,
  FRESH_PICKS_SUCCESS_FLOW,
  FRESH_PICKS_WHATSAPP_NOTE,
} from "@/engines/extra/customer-fresh-picks";
import { OPTIONAL_NOTES_CUSTOMER_WARNING } from "@/engines/orders/order-guide";
import { formatShortBusinessDate } from "@/lib/dates";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  submitGuestExtraOrderAction,
  loadFreshPickPrices,
  type ExtraOrderState,
} from "@/workspaces/storefront/extra/actions";
import type { StorefrontExtraPick } from "@/workspaces/storefront/extra/queries";
import type { PhysicalReceiptChoice } from "@/workspaces/storefront/checkout/preorder-draft";
import {
  CatalogueVoucherAmountLines,
} from "@/workspaces/storefront/offers/CatalogueVoucherAmountLines";
import { useEligibleCatalogueVoucher } from "@/workspaces/storefront/offers/useEligibleCatalogueVoucher";

const initialState: ExtraOrderState = { error: null };

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
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    submitGuestExtraOrderAction,
    initialState,
  );
  const window = {
    pickupAvailableFromAt: extra.pickupAvailableFromAt ?? "",
    orderCutoffAt: extra.pickupThroughAt ?? "",
  };
  const fulfilmentContext = {
    window,
    snapshot: hoursSnapshot,
    config: preparationConfig,
  };
  const dates = extraCustomerVisibleFulfilmentDates(fulfilmentContext);
  const sameDayNotice = extraCustomerSameDayUnavailableNotice(fulfilmentContext);
  const [pickupDate, setPickupDate] = useState(dates[0] ?? "");
  const [pickupTime, setPickupTime] = useState("");
  const [includeReceiptChoice, setIncludeReceiptChoice] =
    useState<PhysicalReceiptChoice>("");
  const [priceResult, setPriceResult] = useState<{
    key: string;
    unitPrice: number | null;
    error: string | null;
  }>({ key: "", unitPrice: null, error: null });
  const priceKey = `${extra.id}|${pickupDate}`;
  const priceReady = priceResult.key === priceKey && priceResult.unitPrice != null;
  const unitPrice = priceReady ? priceResult.unitPrice : null;
  const priceError = priceResult.key === priceKey ? priceResult.error : null;
  const availability = pickupDate
    ? freshPicksMethodAvailability("pickup", pickupDate, fulfilmentContext)
    : null;
  const usableSlots = availability?.slots ?? [];
  const timeStillValid = usableSlots.some((slot) => slot.value === pickupTime);
  const voucher = useEligibleCatalogueVoucher(
    {
      pickupDate,
      items: [
        {
          cakeId: extra.libraryCakeId ?? "",
          sizeId: extra.libraryCakeSizeId ?? "",
          sizeLabel: extra.sizeLabel,
          quantity: 1,
          unitPrice: unitPrice ?? 0,
        },
      ],
    },
    "fresh_pick",
    { enabled: priceReady },
  );

  useEffect(() => {
    let cancelled = false;
    if (!pickupDate) return;
    void loadFreshPickPrices([extra.id], pickupDate).then((result) => {
      if (cancelled) return;
      const price = result.items[0]?.unitPrice;
      setPriceResult({
        key: priceKey,
        unitPrice: result.error ? null : (price ?? null),
        error: result.error,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [extra.id, pickupDate, priceKey]);

  useLayoutEffect(() => {
    if (!state.orderId) return;
    router.replace(
      `/order/success?order=${state.orderId}&flow=${FRESH_PICKS_SUCCESS_FLOW}`,
    );
  }, [router, state.orderId]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input name="extra_stock_id" type="hidden" value={extra.id} />
      <input name="extra_cake_name" type="hidden" value={extra.cakeName} />
      <input name="fulfilment_method" type="hidden" value="pickup" />
      <input name="catalogue_voucher_id" type="hidden" value={voucher?.id ?? ""} />
      <FormRequiredLegend />

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Pickup
        </h2>
        <p className="text-skyline text-sm leading-relaxed">
          {FRESH_PICKS_FIXED_DATES_NOTE}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink" htmlFor="pickup_date">
              Pickup date
            </label>
            <FormSelect
              id="pickup_date"
              name="pickup_date"
              onChange={(event) => {
                const next = event.target.value;
                setPickupDate(next);
                setPickupTime(
                  freshPicksMethodAvailability(
                    "pickup",
                    next,
                    fulfilmentContext,
                  ).slots[0]?.value ?? "",
                );
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
            <label className="text-sm font-medium text-ink" htmlFor="pickup_time">
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
        {sameDayNotice ? (
          <p className="text-skyline text-sm leading-relaxed" role="status">
            {sameDayNotice}
          </p>
        ) : null}
      </section>

      {priceReady && unitPrice != null ? (
        voucher ? (
          <dl className="space-y-1.5">
            <CatalogueVoucherAmountLines
              commercialTotal={unitPrice}
              voucher={voucher}
            />
          </dl>
        ) : (
          <p className="text-ink text-sm font-semibold">Total · {formatRm(unitPrice)}</p>
        )
      ) : priceError ? (
        <p className="text-signal text-sm" role="alert">{priceError}</p>
      ) : (
        <p className="text-skyline text-sm" role="status">
          Updating price for your selected pickup date…
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Customer
        </h2>
        <FormField help={FRESH_PICKS_NAME_HELP} htmlFor="customer_name" label="Name">
          <FormInput id="customer_name" name="customer_name" required />
        </FormField>
        <FormField help={FRESH_PICKS_WHATSAPP_NOTE} htmlFor="phone" label="WhatsApp phone">
          <FormInput id="phone" name="phone" required type="tel" />
        </FormField>
        <FormRadioGroup
          legend="Would you like a copy of the receipt? (will be attached during pickup)"
          name="include_receipt"
          onChange={(value) =>
            setIncludeReceiptChoice(value === "yes" || value === "no" ? value : "")
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
        <p className="text-ink text-sm font-medium">Optional notes</p>
        <p className="text-status-danger text-sm leading-snug font-bold" id="optional-notes-warning">
          {OPTIONAL_NOTES_CUSTOMER_WARNING}
        </p>
        <FormTextarea
          aria-describedby="optional-notes-warning"
          aria-label="Optional notes"
          id="notes"
          name="notes"
          rows={3}
        />
      </section>

      <FormError message={state.error} />
      <FormActions>
        <FormSubmitButton
          disabled={usableSlots.length === 0 || !timeStillValid || !priceReady}
          pending={pending}
        >
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
