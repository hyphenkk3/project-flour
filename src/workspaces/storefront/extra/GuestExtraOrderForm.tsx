"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CUSTOMER_FORM_HIGHLIGHT_SUMMARY,
  FormActions,
  FormError,
  FormRequiredLegend,
  FormField,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
  RequiredAsterisk,
  collectInvalidFieldMessages,
  focusFirstInvalidField,
  formStyles,
} from "@/components/ui/form";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  isValidDineInReservationPair,
  parseDineInVenue,
} from "@/engines/business-calendar/dine-in-hours";
import { DineInVenuePartyFields } from "@/components/ui/DineInVenuePartyFields";
import type { DineInVenuePartyFieldsValue } from "@/components/ui/DineInVenuePartyFields";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import {
  extraCustomerSameDayUnavailableNoticeForDate,
  extraCustomerVisibleFulfilmentDates,
  firstAvailableFreshPicksFulfilment,
  freshPicksDineInReservationSlots,
  freshPicksDineInServingSlotsForReservation,
  freshPicksDineInVenuesForPair,
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
import { DineInReservationNotesNotice } from "@/workspaces/storefront/checkout/DineInReservationNotesNotice";
import {
  derivedGuestCountDraft,
  readDineInPartyDraftFields,
  validateDineInParty,
} from "@/engines/orders/dine-in-party";
import { EMPTY_DINE_IN_VENUE_PHOTOS, type DineInVenuePhotoMap } from "@/engines/orders/dine-in-venue-photos";
import type { StorefrontExtraPick } from "@/workspaces/storefront/extra/queries";
import {
  addFreshPickToCart,
  extraIsValidForCartPickup,
  freshPickCartHasExtra,
  patchFreshPickCart,
  readFreshPickCart,
  writeFreshPickCart,
} from "@/workspaces/storefront/extra/fresh-pick-cart";
import { useFreshPickCart } from "@/workspaces/storefront/extra/useFreshPickCart";
import { loadFreshPickPrices } from "@/workspaces/storefront/extra/actions";

type GuestExtraOrderFormProps = {
  extra: StorefrontExtraPick;
  hoursSnapshot?: OperatingHoursSnapshot;
  preparationConfig?: FreshPicksPreparationConfig;
  venuePhotos?: DineInVenuePhotoMap;
};

export function GuestExtraOrderForm({
  extra,
  hoursSnapshot = OPERATING_HOURS_SEED,
  preparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  venuePhotos = EMPTY_DINE_IN_VENUE_PHOTOS,
}: GuestExtraOrderFormProps) {
  const pickupWindow = {
    pickupAvailableFromAt: extra.pickupAvailableFromAt ?? "",
    orderCutoffAt: extra.pickupThroughAt ?? "",
  };
  const fulfilmentContext = {
    window: pickupWindow,
    readyForCollection: extra.readyForCollection,
    snapshot: hoursSnapshot,
    config: preparationConfig,
  };
  const dates = extraCustomerVisibleFulfilmentDates(fulfilmentContext);
  const [pickupDate, setPickupDate] = useState(dates[0] ?? "");
  const [fulfilmentMethod, setFulfilmentMethod] =
    useState<CustomerWebsiteFulfilmentMethod>("pickup");
  const [pickupTime, setPickupTime] = useState("");
  const [reservationTime, setReservationTime] = useState("");
  const cart = useFreshPickCart();
  const [dineInParty, setDineInParty] = useState<DineInVenuePartyFieldsValue>({
    venue: cart?.dineInVenue ?? "",
    adultCount: cart?.adultCount ?? "",
    kidCount: cart?.kidCount ?? "",
    toddlerCount: cart?.toddlerCount ?? "",
    whitebirdSplitSeatingAcknowledged:
      cart?.whitebirdSplitSeatingAcknowledged ?? false,
  });
  const [reservationNote, setReservationNote] = useState(
    cart?.reservationNote ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(false);
  const [priceResult, setPriceResult] = useState<{
    key: string;
    unitPrice: number | null;
    error: string | null;
  }>({ key: "", unitPrice: null, error: null });
  const priceKey = `${extra.id}|${pickupDate}`;
  const priceReady = priceResult.key === priceKey && priceResult.unitPrice != null;
  const unitPrice = priceReady ? priceResult.unitPrice : null;
  const priceError = priceResult.key === priceKey ? priceResult.error : null;
  const addedTimer = useRef<number | null>(null);
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
  const methodSlots = methodAvailability?.slots ?? [];
  const sameDayNotice = pickupDate
    ? extraCustomerSameDayUnavailableNoticeForDate(
        pickupDate,
        fulfilmentContext,
      )
    : null;
  const reservationSlots =
    resolvedMethod === "dine_in" && pickupDate
      ? freshPicksDineInReservationSlots(
          pickupDate,
          methodSlots,
          hoursSnapshot,
        )
      : [];
  const usableSlots =
    resolvedMethod === "dine_in" && pickupDate && reservationTime
      ? freshPicksDineInServingSlotsForReservation(
          pickupDate,
          reservationTime,
          methodSlots,
          hoursSnapshot,
        )
      : resolvedMethod === "dine_in"
        ? []
        : methodSlots;
  const timeStillValid = usableSlots.some((slot) => slot.value === pickupTime);
  const dineInVenues =
    resolvedMethod === "dine_in" && pickupDate && reservationTime && timeStillValid
      ? freshPicksDineInVenuesForPair(
          pickupDate,
          reservationTime,
          pickupTime,
          hoursSnapshot,
        )
      : [];
  const parsedDineInVenue = parseDineInVenue(dineInParty.venue);
  const resolvedDineInVenue =
    parsedDineInVenue && dineInVenues.includes(parsedDineInVenue)
      ? parsedDineInVenue
      : "";
  const validParty = validateDineInParty({
    venue: resolvedDineInVenue,
    adultCount: dineInParty.adultCount,
    kidCount: dineInParty.kidCount,
    toddlerCount: dineInParty.toddlerCount,
    guestCount: derivedGuestCountDraft(dineInParty),
    acknowledged: dineInParty.whitebirdSplitSeatingAcknowledged,
    requireAcknowledgement: true,
  });

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
    const dineInIsValid =
      existing.fulfilmentMethod !== "dine_in" ||
      (isValidDineInReservationPair({
        dateYmd: existing.pickupDate,
        reservationTime: existing.reservationTime,
        servingTime: existing.pickupTime,
        venue: existing.dineInVenue as "hyphen" | "whitebird",
        snapshot: hoursSnapshot,
      }) &&
        Boolean(parseDineInVenue(existing.dineInVenue)));
    if (
      extraIsValidForCartPickup(
        {
          pickupDate: existing.pickupDate,
          pickupTime: existing.pickupTime,
          pickupAvailableFromAt: extra.pickupAvailableFromAt,
          orderCutoffAt: extra.pickupThroughAt,
          readyForCollection: extra.readyForCollection,
          fulfilmentMethod: existing.fulfilmentMethod,
        },
        { snapshot: hoursSnapshot, config: preparationConfig },
      ) && dineInIsValid
    ) {
      setPickupDate(existing.pickupDate);
      setPickupTime(existing.pickupTime);
      setFulfilmentMethod(existing.fulfilmentMethod);
      setReservationTime(existing.reservationTime);
      setDineInParty({
        venue: existing.dineInVenue,
        ...readDineInPartyDraftFields(existing),
      });
      setReservationNote(existing.reservationNote);
    }
  }, [
    extra.readyForCollection,
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

  function updateFulfilmentSelection(
    method: CustomerWebsiteFulfilmentMethod,
    date: string,
  ) {
    const slots = freshPicksMethodAvailability(
      method,
      date,
      fulfilmentContext,
    ).slots;
    if (method !== "dine_in") {
      setReservationTime("");
      setDineInParty((current) => ({ ...current, venue: "" }));
      setPickupTime((current) =>
        slots.some((slot) => slot.value === current)
          ? current
          : (slots[0]?.value ?? ""),
      );
      return;
    }
    const validReservations = freshPicksDineInReservationSlots(
      date,
      slots,
      hoursSnapshot,
    );
    const nextReservation = validReservations.some(
      (slot) => slot.value === reservationTime,
    )
      ? reservationTime
      : "";
    const servingSlots = nextReservation
      ? freshPicksDineInServingSlotsForReservation(
          date,
          nextReservation,
          slots,
          hoursSnapshot,
        )
      : [];
    const nextServing = servingSlots.some((slot) => slot.value === pickupTime)
      ? pickupTime
      : "";
    const venues = nextServing
      ? freshPicksDineInVenuesForPair(
          date,
          nextReservation,
          nextServing,
          hoursSnapshot,
        )
      : [];
    setReservationTime(nextReservation);
    setPickupTime(nextServing);
    setDineInParty((current) => ({
      ...current,
      venue:
        venues.includes(current.venue as "hyphen" | "whitebird")
        ? current.venue
        : "",
    }));
  }

  function changeReservationTime(nextReservation: string) {
    setReservationTime(nextReservation);
    const servingSlots = freshPicksDineInServingSlotsForReservation(
      pickupDate,
      nextReservation,
      methodSlots,
      hoursSnapshot,
    );
    const nextServing = servingSlots.some((slot) => slot.value === pickupTime)
      ? pickupTime
      : "";
    setPickupTime(nextServing);
    const venues = nextServing
      ? freshPicksDineInVenuesForPair(
          pickupDate,
          nextReservation,
          nextServing,
          hoursSnapshot,
        )
      : [];
    setDineInParty((current) => ({
      ...current,
      venue: venues.includes(current.venue as "hyphen" | "whitebird")
        ? current.venue
        : "",
    }));
  }

  function changeCakeServingTime(nextServing: string) {
    setPickupTime(nextServing);
    const venues = reservationTime
      ? freshPicksDineInVenuesForPair(
          pickupDate,
          reservationTime,
          nextServing,
          hoursSnapshot,
        )
      : [];
    setDineInParty((current) => ({
      ...current,
      venue: venues.includes(current.venue as "hyphen" | "whitebird")
        ? current.venue
        : "",
    }));
  }

  function addToCart() {
    setError(null);
    if (freshPickCartHasExtra(readFreshPickCart(), extra.id)) {
      setAdded(true);
      return;
    }
    if (
      resolvedMethod === "dine_in" &&
      (!reservationTime ||
        !timeStillValid ||
        !resolvedDineInVenue ||
        !validParty.ok ||
        !isValidDineInReservationPair({
          dateYmd: pickupDate,
          reservationTime,
          servingTime: pickupTime,
          venue: resolvedDineInVenue as "hyphen" | "whitebird",
          snapshot: hoursSnapshot,
        }))
    ) {
      setAdded(false);
      setError(
        validParty.ok
          ? "Please complete the available Dine-in reservation details."
          : validParty.error,
      );
      return;
    }
    const result = addFreshPickToCart(
      readFreshPickCart(),
      {
        extraStockId: extra.id,
        cakeId: extra.libraryCakeId,
        cakeSizeId: extra.libraryCakeSizeId,
        cakeName: extra.cakeName,
        sizeLabel: extra.sizeLabel,
        unitPrice,
        imageUrl: extra.imageUrl,
        pickupDate,
        pickupTime: timeStillValid ? pickupTime : "",
        fulfilmentMethod: resolvedMethod,
        reservationTime: resolvedMethod === "dine_in" ? reservationTime : "",
        dineInVenue: resolvedMethod === "dine_in" ? resolvedDineInVenue : "",
        pickupAvailableFromAt: extra.pickupAvailableFromAt ?? "",
        orderCutoffAt: extra.pickupThroughAt ?? "",
        readyForCollection: extra.readyForCollection,
      },
      undefined,
      { snapshot: hoursSnapshot, config: preparationConfig },
    );
    if (!result.ok) {
      setAdded(false);
      setError(result.error);
      return;
    }
    writeFreshPickCart(
      patchFreshPickCart(result.cart, {
        reservationTime: resolvedMethod === "dine_in" ? reservationTime : "",
        dineInVenue: resolvedMethod === "dine_in" ? resolvedDineInVenue : "",
        adultCount: dineInParty.adultCount,
        kidCount: dineInParty.kidCount,
        toddlerCount: dineInParty.toddlerCount,
        guestCount: derivedGuestCountDraft(dineInParty),
        whitebirdSplitSeatingAcknowledged:
          dineInParty.whitebirdSplitSeatingAcknowledged,
        reservationNote,
      }),
    );
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
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const errors = collectInvalidFieldMessages(event.currentTarget);
        if (Object.keys(errors).length > 0) {
          setFieldErrors(errors);
          focusFirstInvalidField(event.currentTarget);
          return;
        }
        setFieldErrors({});
        addToCart();
      }}
    >
      <input name="extra_stock_id" type="hidden" value={extra.id} />
      <FormRequiredLegend />

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
            <span data-field-label="">
              {workspaceScheduleDateLabel(resolvedMethod)}
              <RequiredAsterisk />
            </span>
          </label>
          <FormSelect
            aria-invalid={fieldErrors.pickup_date ? true : undefined}
            className={fieldErrors.pickup_date ? formStyles.invalidControlClass : ""}
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
              updateFulfilmentSelection(nextMethod, next);
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
          {fieldErrors.pickup_date ? (
            <p className={formStyles.fieldErrorClass} role="alert">
              {fieldErrors.pickup_date}
            </p>
          ) : null}
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
              updateFulfilmentSelection(next, pickupDate);
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
        {resolvedMethod === "dine_in" ? (
          <>
            <PickupSlotFields
              defaultDate={pickupDate}
              defaultTime={reservationTime}
              hoursSnapshot={hoursSnapshot}
              key={`fresh-pick-reservation-${pickupDate}`}
              markRequired
              onTimeChange={changeReservationTime}
              showDate={false}
              slotsForDate={() => reservationSlots}
              timeError={fieldErrors.reservation_time}
              timeHelp="Choose when you would like your table reservation to start."
              timeId="reservation_time"
              timeLabel="Dine-in reservation time"
              timeName="reservation_time"
            />
            <PickupSlotFields
              defaultDate={pickupDate}
              defaultTime={timeStillValid ? pickupTime : ""}
              hoursSnapshot={hoursSnapshot}
              key={`fresh-pick-serving-${pickupDate}-${reservationTime}`}
              markRequired
              onTimeChange={changeCakeServingTime}
              showDate={false}
              slotsForDate={() => usableSlots}
              timeError={fieldErrors.pickup_time}
              timeHelp="Choose when you would like your cake served. Cake serving time must be within 1 hour of the reservation time."
              timeId="pickup_time"
              timeLabel="Cake serving time"
              timeName="pickup_time"
            />
            {reservationTime && timeStillValid ? (
              <div className="space-y-3">
                <DineInVenuePartyFields
                  fieldErrors={fieldErrors}
                  markRequired
                  onChange={(next) => setDineInParty(next)}
                  photos={venuePhotos}
                  value={{ ...dineInParty, venue: resolvedDineInVenue }}
                  venues={dineInVenues}
                />
                <DineInReservationNotesNotice />
                <FormField
                  help="Optional."
                  htmlFor="reservation_note"
                  label="Reservation note"
                >
                  <FormTextarea
                    id="reservation_note"
                    name="reservation_note"
                    onChange={(event) => setReservationNote(event.target.value)}
                    rows={3}
                    value={reservationNote}
                  />
                </FormField>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-medium text-ink"
              htmlFor="pickup_time"
            >
              <span data-field-label="">
                {workspaceScheduleTimeLabel(resolvedMethod)}
                <RequiredAsterisk />
              </span>
            </label>
            <FormSelect
              aria-invalid={fieldErrors.pickup_time ? true : undefined}
              className={fieldErrors.pickup_time ? formStyles.invalidControlClass : ""}
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
            {fieldErrors.pickup_time ? (
              <p className={formStyles.fieldErrorClass} role="alert">
                {fieldErrors.pickup_time}
              </p>
            ) : null}
          </div>
        )}
      </section>

      {priceReady && unitPrice != null ? (
        <p className="text-ink text-sm font-semibold">
          {formatRm(unitPrice)}
        </p>
      ) : priceError ? (
        <p className="text-signal text-sm" role="alert">
          {priceError}
        </p>
      ) : (
        <p className="text-skyline text-sm" role="status">
          Updating price for your selected pickup date…
        </p>
      )}

      {Object.keys(fieldErrors).length > 0 ? (
        <FormError message={CUSTOMER_FORM_HIGHLIGHT_SUMMARY} />
      ) : null}
      <FormError message={error} />
      {added ? (
        <p className="text-signal text-sm" role="status">
          {FRESH_PICKS_ADDED_CONFIRMATION}
        </p>
      ) : null}

      <FormActions>
        <FormSubmitButton
          disabled={
            !priceReady ||
            (resolvedMethod === "dine_in"
              ? !reservationSlots.length ||
                !reservationTime ||
                !timeStillValid ||
                !resolvedDineInVenue ||
                !validParty.ok
              : !usableSlots.length)
          }
        >
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
