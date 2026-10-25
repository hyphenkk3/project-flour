/**
 * Fresh Picks same-day preparation overlay + 15-minute dine-in grid.
 * Run: npx tsx scripts/test-fresh-picks-same-day-preparation.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  availableDineInVenues,
  getDineInSlotsForDate,
} from "@/engines/business-calendar/dine-in-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  extraCustomerPickupSlotsForDate,
} from "@/engines/extra/extra-pickup";
import { extraPickupThroughIso } from "@/engines/extra/fresh-picks-time";
import {
  extraCustomerSameDayUnavailableNotice,
  extraCustomerSameDayUnavailableNoticeForDate,
  extraCustomerVisibleFulfilmentDates,
  freshPicksMethodAvailability,
  freshPicksMethodAvailabilityForItems,
  freshPicksDineInSlotsForVenue,
  freshPicksDineInVenueSelection,
  freshPicksDineInVenuesForSlots,
  freshPicksDineInReservationSlots,
  freshPicksDineInServingSlotsForReservation,
  freshPicksDineInVenuesForPair,
  isValidExtraCustomerFulfilment,
} from "@/engines/extra/fresh-picks-fulfilment";
import {
  DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  isFreshPicksSameDayCutoffPassed,
  parseFreshPicksPreparationConfig,
  sameDayFreshPicksCutoffCustomerMessage,
  slotPassesFreshPicksLead,
} from "@/engines/extra/fresh-picks-preparation";
import {
  addFreshPickToCart,
  parseFreshPickCart,
} from "@/workspaces/storefront/extra/fresh-pick-cart";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const WED = "2026-08-19";
const THU = "2026-08-20";
const FRI = "2026-08-21";
assert.equal(new Date(2026, 7, 19).getDay(), 3);
assert.equal(new Date(2026, 7, 20).getDay(), 4);

function malaysiaNow(dateYmd: string, clock: string): Date {
  const iso = `${dateYmd}T${clock}+08:00`;
  const ms = Date.parse(iso);
  assert.equal(Number.isFinite(ms), true, `invalid Malaysia clock ${clock}`);
  return new Date(ms);
}

const window = {
  pickupAvailableFromAt: extraPickupThroughIso(THU, "12:00")!,
  orderCutoffAt: extraPickupThroughIso(FRI, "21:00")!,
};
const ctx = {
  window,
  snapshot: OPERATING_HOURS_SEED,
  config: DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
};

assert.equal(parseFreshPicksPreparationConfig({}).cutoffTime, "16:00");
assert.equal(parseFreshPicksPreparationConfig({}).leadMinutes, 60);

{
  const now = malaysiaNow(THU, "15:59:59");
  assert.equal(isFreshPicksSameDayCutoffPassed(now), false);
  assert.equal(
    freshPicksMethodAvailability("pickup", THU, { ...ctx, now }).available,
    true,
  );
}

{
  const now = malaysiaNow(THU, "16:00:00");
  assert.equal(isFreshPicksSameDayCutoffPassed(now), true);
  const pickup = freshPicksMethodAvailability("pickup", THU, { ...ctx, now });
  assert.equal(pickup.available, false);
  assert.equal(pickup.reasonCode, "same_day_preparation_cutoff");
  assert.equal(pickup.message, sameDayFreshPicksCutoffCustomerMessage());
}

{
  const now = malaysiaNow(THU, "16:00:01");
  assert.equal(
    freshPicksMethodAvailability("dine_in", THU, { ...ctx, now }).available,
    false,
  );
  assert.equal(
    extraCustomerVisibleFulfilmentDates({ ...ctx, now }).includes(THU),
    false,
  );
  assert.equal(
    extraCustomerVisibleFulfilmentDates({ ...ctx, now }).includes(FRI),
    true,
  );
  assert.equal(
    extraCustomerSameDayUnavailableNotice({ ...ctx, now }),
    sameDayFreshPicksCutoffCustomerMessage(),
  );
  assert.equal(
    extraCustomerSameDayUnavailableNoticeForDate(FRI, { ...ctx, now }),
    null,
    "today's cutoff warning is not shown for a later selected date",
  );
}

{
  // On 25 Oct, a 26 Oct stock item must not show a warning about today's cutoff.
  const sunday = "2026-10-25";
  const monday = "2026-10-26";
  const now = malaysiaNow(sunday, "16:00:00");
  const itemWindow = {
    pickupAvailableFromAt: extraPickupThroughIso(sunday, "12:00")!,
    orderCutoffAt: extraPickupThroughIso(monday, "21:00")!,
  };
  const itemContext = {
    window: itemWindow,
    now,
    snapshot: OPERATING_HOURS_SEED,
  };
  assert.deepEqual(extraCustomerVisibleFulfilmentDates(itemContext), [monday]);
  assert.equal(
    extraCustomerSameDayUnavailableNoticeForDate(monday, itemContext),
    null,
    "the selected 26 Oct date is not blocked by 25 Oct's cutoff notice",
  );
  assert.equal(
    extraCustomerSameDayUnavailableNoticeForDate(sunday, itemContext),
    sameDayFreshPicksCutoffCustomerMessage(),
    "the notice still explains today's cutoff if today itself is selected",
  );
  const readyItemContext = { ...itemContext, readyForCollection: true };
  assert.equal(
    extraCustomerSameDayUnavailableNoticeForDate(sunday, readyItemContext),
    null,
    "a ready physical item with remaining same-day slots does not show a stale cutoff notice",
  );
}

{
  const afterCutoff = malaysiaNow(THU, "16:15:00");
  const notReady = freshPicksMethodAvailability("pickup", THU, {
    ...ctx,
    now: afterCutoff,
    readyForCollection: false,
  });
  const readyButUnpaid = freshPicksMethodAvailability("pickup", THU, {
    ...ctx,
    now: afterCutoff,
    readyForCollection: true,
  });
  assert.equal(notReady.available, false, "not-ready stock keeps the cutoff");
  assert.equal(notReady.reasonCode, "same_day_preparation_cutoff");
  assert.equal(readyButUnpaid.available, true, "Ready stock bypasses preparation cutoff without payment state");
  assert.equal(readyButUnpaid.slots[0]?.value, "16:30");
  assert.equal(
    isValidExtraCustomerFulfilment({
      method: "pickup",
      fulfilmentDate: THU,
      fulfilmentTime: "16:30",
      ...window,
      readyForCollection: true,
      now: afterCutoff,
    }),
    true,
    "the specific ready item remains orderable after the preparation cutoff",
  );
  assert.equal(
    isValidExtraCustomerFulfilment({
      method: "pickup",
      fulfilmentDate: THU,
      fulfilmentTime: "16:30",
      ...window,
      readyForCollection: false,
      now: afterCutoff,
    }),
    false,
    "Undo Ready restores client-side rejection after cutoff",
  );

  const readyAndUnready = freshPicksMethodAvailabilityForItems(
    "pickup",
    THU,
    [
      { window, readyForCollection: true },
      { window, readyForCollection: false },
    ],
    { now: afterCutoff, snapshot: OPERATING_HOURS_SEED },
  );
  assert.equal(readyAndUnready.available, false, "mixed stock must meet the unready item's cutoff too");

  const beforeCutoff = malaysiaNow(THU, "15:00:00");
  const mixedWithinCutoff = freshPicksMethodAvailabilityForItems(
    "pickup",
    THU,
    [
      { window, readyForCollection: true },
      { window, readyForCollection: false },
    ],
    { now: beforeCutoff, snapshot: OPERATING_HOURS_SEED },
  );
  assert.equal(mixedWithinCutoff.available, true, "mixed items are available while the unready item's cutoff is met");

  const undoReady = freshPicksMethodAvailability("pickup", THU, {
    ...ctx,
    now: afterCutoff,
    readyForCollection: false,
  });
  assert.equal(undoReady.available, notReady.available, "Undo Ready restores the normal cutoff");
}

{
  const now = malaysiaNow(THU, "15:00:00");
  assert.equal(
    slotPassesFreshPicksLead({
      dateYmd: THU,
      timeHm: "15:59",
      now,
      comparison: "inclusive",
    }),
    false,
    "59 minutes is below the 60-minute pickup lead",
  );
  assert.equal(
    slotPassesFreshPicksLead({
      dateYmd: THU,
      timeHm: "16:00",
      now,
      comparison: "inclusive",
    }),
    true,
  );
}

{
  const now = malaysiaNow(THU, "15:50:00");
  const twoHours = parseFreshPicksPreparationConfig({ leadMinutes: 120 });
  const pickup = freshPicksMethodAvailability("pickup", THU, {
    ...ctx,
    now,
    config: twoHours,
  });
  assert.equal(pickup.available, false);
  assert.equal(pickup.reasonCode, "preparation_lead_time");
}

{
  const now = malaysiaNow(THU, "16:30:00");
  const tomorrowPickup = freshPicksMethodAvailability("pickup", FRI, {
    ...ctx,
    now,
  });
  assert.equal(tomorrowPickup.available, true);
  assert.equal(tomorrowPickup.slots[0]?.value, "12:00");
}

{
  const now = malaysiaNow(THU, "15:00:00");
  const dineIn = freshPicksMethodAvailability("dine_in", THU, { ...ctx, now });
  assert.equal(
    isValidExtraCustomerFulfilment({
      method: "dine_in",
      fulfilmentDate: THU,
      fulfilmentTime: "16:00",
      ...window,
      now,
    }),
    false,
    "exact 60-minute dine-in boundary is invalid",
  );
  assert.equal(dineIn.slots[0]?.value, "16:15");
  assert.equal(
    isValidExtraCustomerFulfilment({
      method: "dine_in",
      fulfilmentDate: THU,
      fulfilmentTime: "16:15",
      ...window,
      now,
    }),
    true,
  );
}

const dineInLeadCases: Array<{ now: string; earliest: string }> = [
  { now: "14:59:00", earliest: "16:00" },
  { now: "15:00:00", earliest: "16:15" },
  { now: "15:01:00", earliest: "16:15" },
  { now: "15:14:00", earliest: "16:15" },
  { now: "15:15:00", earliest: "16:30" },
];
for (const example of dineInLeadCases) {
  const now = malaysiaNow(THU, example.now);
  const values = freshPicksMethodAvailability("dine_in", THU, {
    ...ctx,
    now,
  }).slots.map((slot) => slot.value);
  assert.equal(
    values[0],
    example.earliest,
    `${example.now} → earliest dine-in ${example.earliest}`,
  );
}

{
  const slots = getDineInSlotsForDate(THU, OPERATING_HOURS_SEED).map(
    (slot) => slot.value,
  );
  assert.equal(slots.includes("12:00"), true);
  assert.equal(slots.includes("12:15"), true);
  assert.equal(slots.includes("12:30"), true);
  assert.equal(slots[slots.length - 1], "17:00");
}

{
  const slots = getDineInSlotsForDate(THU, OPERATING_HOURS_SEED);
  const venues = freshPicksDineInVenuesForSlots(
    THU,
    slots,
    OPERATING_HOURS_SEED,
  );
  assert.deepEqual(venues, ["hyphen", "whitebird"]);
  assert.equal(
    freshPicksDineInVenueSelection(["whitebird"], "hyphen"),
    "",
    "a date/time change clears an invalid previously selected venue",
  );
  assert.equal(
    freshPicksDineInVenueSelection(["whitebird"], ""),
    "whitebird",
    "a sole venue may be selected when the customer has no prior choice",
  );
  assert.equal(
    freshPicksDineInVenueSelection(["hyphen", "whitebird"], "whitebird"),
    "whitebird",
    "a still-available customer venue choice is preserved",
  );
  const whitebirdSlots = freshPicksDineInSlotsForVenue(
    THU,
    slots,
    "whitebird",
    OPERATING_HOURS_SEED,
  );
  assert.equal(whitebirdSlots.length > 0, true);
  assert.equal(
    whitebirdSlots.every((slot) =>
      availableDineInVenues(THU, slot.value, OPERATING_HOURS_SEED).includes(
        "whitebird",
      ),
    ),
    true,
    "venue-specific time options use the shared operating-hours resolver",
  );
  const restrictedVenueHours = {
    ...OPERATING_HOURS_SEED,
    overrides: [
      {
        capability: "whitebird" as const,
        weekday: 4,
        enabled: true,
        opensAt: "10:00",
        closesAt: "13:00",
        latestBookable: "12:30",
        usualStart: "10:00",
        usualEnd: "13:00",
        overrideDate: THU,
        note: "synthetic venue-hours test",
      },
    ],
  };
  const restrictedSlots = getDineInSlotsForDate(THU, restrictedVenueHours);
  const restrictedWhitebirdSlots = freshPicksDineInSlotsForVenue(
    THU,
    restrictedSlots,
    "whitebird",
    restrictedVenueHours,
  );
  assert.equal(
    restrictedWhitebirdSlots.some((slot) => slot.value === "15:00"),
    false,
    "changing to a venue that closes earlier removes its now-invalid time",
  );
  assert.equal(
    freshPicksDineInVenuesForSlots(
      THU,
      restrictedSlots,
      restrictedVenueHours,
    ).includes("whitebird"),
    true,
    "the venue remains selectable when it has other available times",
  );
  const extraCheckoutSrc = readSrc(
    "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
  );
  assert.match(extraCheckoutSrc, /freshPicksDineInVenuesForPair/);
  assert.match(extraCheckoutSrc, /freshPicksDineInServingSlotsForReservation/);
  assert.match(extraCheckoutSrc, /No dine-in venue is available/);
  assert.doesNotMatch(extraCheckoutSrc, /setSelectedTime\(nextSlots\[0\]/);
}

{
  const now = malaysiaNow(THU, "15:30:00");
  const delivery = freshPicksMethodAvailability("delivery", THU, {
    ...ctx,
    now,
  });
  assert.equal(delivery.available, false);
  assert.equal(delivery.reasonCode, "fulfilment_window_passed");
  assert.match(delivery.message ?? "", /delivery window has ended/i);
}

{
  const now = malaysiaNow(THU, "13:40:00");
  const delivery = freshPicksMethodAvailability("delivery", THU, {
    ...ctx,
    now,
  });
  assert.equal(delivery.slots[0]?.value, "15:00");
  assert.equal(
    isValidExtraCustomerFulfilment({
      method: "delivery",
      fulfilmentDate: THU,
      fulfilmentTime: "14:00",
      ...window,
      now,
    }),
    false,
    "delivery 14:00 is only 20 minutes after 13:40",
  );
}

{
  const now = malaysiaNow(THU, "13:00:00");
  assert.equal(
    isValidExtraCustomerFulfilment({
      method: "delivery",
      fulfilmentDate: THU,
      fulfilmentTime: "14:00",
      ...window,
      now,
    }),
    true,
  );
}

{
  const now = malaysiaNow(THU, "15:00:00");
  const pickup = extraCustomerPickupSlotsForDate(THU, window, now);
  assert.equal(pickup[0]?.value, "16:00");
  assert.equal(
    isValidExtraCustomerFulfilment({
      method: "pickup",
      fulfilmentDate: THU,
      fulfilmentTime: "16:00",
      ...window,
      now,
    }),
    true,
    "pickup keeps inclusive 60-minute boundary on the 30-minute grid",
  );
  assert.equal(
    isValidExtraCustomerFulfilment({
      method: "pickup",
      fulfilmentDate: THU,
      fulfilmentTime: "15:30",
      ...window,
      now,
    }),
    false,
  );
}

{
  const now = malaysiaNow(THU, "14:00:00");
  const ninety = parseFreshPicksPreparationConfig({ leadMinutes: 90 });
  const dineIn = freshPicksMethodAvailability("dine_in", THU, {
    ...ctx,
    now,
    config: ninety,
  });
  assert.equal(dineIn.slots[0]?.value, "15:45");
}

{
  const now = malaysiaNow(WED, "12:00:00");
  const delivery = freshPicksMethodAvailability("delivery", WED, {
    window: {
      pickupAvailableFromAt: extraPickupThroughIso(WED, "12:00")!,
      orderCutoffAt: extraPickupThroughIso(WED, "15:00")!,
    },
    now,
    snapshot: OPERATING_HOURS_SEED,
  });
  assert.equal(delivery.available, false);
  assert.equal(delivery.reasonCode, "method_unavailable_for_date");
}

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const extraDetailPageSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
assert.match(extraFormSrc, /FulfilmentMethodChooser/);
assert.match(extraFormSrc, /Dine-in/);
assert.match(extraFormSrc, /freshPicksChooserStates/);
assert.match(extraFormSrc, /extraCustomerSameDayUnavailableNotice/);
assert.match(extraFormSrc, /includeFieldName=\{false\}/);
assert.match(extraDetailPageSrc, /<GuestExtraOrderForm/);
assert.match(extraFormSrc, /timeLabel="Dine-in reservation time"/);
assert.match(extraFormSrc, /timeLabel="Cake serving time"/);
assert.match(extraFormSrc, /<DineInVenuePartyFields/);
assert.match(extraFormSrc, /freshPicksDineInReservationSlots/);
assert.match(extraFormSrc, /freshPicksDineInServingSlotsForReservation/);
assert.match(extraFormSrc, /freshPicksDineInVenuesForPair/);
assert.ok(
  extraFormSrc.indexOf('timeLabel="Dine-in reservation time"') <
    extraFormSrc.indexOf('timeLabel="Cake serving time"'),
  "Fresh Pick follows regular Preorder reservation then cake serving order",
);
assert.ok(
  extraFormSrc.indexOf('timeLabel="Cake serving time"') <
    extraFormSrc.indexOf("<DineInVenuePartyFields\n") <
    extraFormSrc.indexOf("<FormSubmitButton"),
  "venue photo cards follow both times and precede Add to Cart",
);

{
  const productDate = "2026-08-20";
  const productNow = malaysiaNow(productDate, "15:00:00");
  const productWindow = {
    pickupAvailableFromAt: extraPickupThroughIso(productDate, "12:00")!,
    orderCutoffAt: extraPickupThroughIso(productDate, "21:00")!,
  };
  const available = freshPicksMethodAvailability("dine_in", productDate, {
    window: productWindow,
    now: productNow,
    snapshot: OPERATING_HOURS_SEED,
  });
  const reservation = freshPicksDineInReservationSlots(
    productDate,
    available.slots,
    OPERATING_HOURS_SEED,
  )[0];
  assert.ok(reservation);
  const serving = freshPicksDineInServingSlotsForReservation(
    productDate,
    reservation.value,
    available.slots,
    OPERATING_HOURS_SEED,
  )[0];
  assert.ok(serving);
  const venue = freshPicksDineInVenuesForPair(
    productDate,
    reservation.value,
    serving.value,
    OPERATING_HOURS_SEED,
  )[0];
  assert.ok(venue);
  const productInput = {
    extraStockId: "synthetic-product-detail-extra",
    cakeId: "synthetic-cake",
    cakeSizeId: "synthetic-size",
    cakeName: "Synthetic Cake",
    sizeLabel: '6"',
    unitPrice: 90,
    imageUrl: null,
    pickupDate: productDate,
    pickupTime: serving.value,
    reservationTime: reservation.value,
    fulfilmentMethod: "dine_in" as const,
    dineInVenue: venue,
    pickupAvailableFromAt: productWindow.pickupAvailableFromAt,
    orderCutoffAt: productWindow.orderCutoffAt,
  };
  const added = addFreshPickToCart(
    null,
    productInput,
    productNow,
    { snapshot: OPERATING_HOURS_SEED },
  );
  assert.equal(added.ok, true);
  assert.equal(added.ok && added.cart.dineInVenue, venue);
  assert.equal(added.ok && added.cart.reservationTime, reservation.value);
  assert.equal(added.ok && added.cart.pickupTime, serving.value);
  assert.equal(
    addFreshPickToCart(
      null,
      { ...productInput, dineInVenue: "" },
      productNow,
      { snapshot: OPERATING_HOURS_SEED },
    ).ok,
    false,
    "Dine-in add-to-cart requires a venue",
  );
  if (added.ok) {
    const restored = parseFreshPickCart(added.cart);
    assert.equal(restored?.dineInVenue, venue);
    assert.equal(restored?.reservationTime, reservation.value);
    assert.equal(restored?.pickupTime, serving.value);
  }
}

const extraCheckoutSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
assert.match(extraCheckoutSrc, /name="fulfilment_method"/);
assert.match(extraCheckoutSrc, /includeFieldName=\{false\}/);
assert.match(extraCheckoutSrc, /timeLabel="Dine-in reservation time"/);
assert.match(extraCheckoutSrc, /timeLabel="Cake serving time"/);
assert.match(extraCheckoutSrc, /extraCustomerSameDayUnavailableNotice/);
assert.doesNotMatch(extraCheckoutSrc, /parseGuestCount/);
assert.match(extraCheckoutSrc, /reservationTime:\s*resolvedMethod === "dine_in" \? reservationTime : ""/);

const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
assert.match(extraActionsSrc, /loadOperatingHoursSnapshot/);
assert.match(extraActionsSrc, /isValidExtraCustomerFulfilment/);
assert.match(extraActionsSrc, /p_fulfilment_method/);
assert.match(extraActionsSrc, /p_dine_in/);
assert.doesNotMatch(extraActionsSrc, /now:/);

const checkoutSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.doesNotMatch(checkoutSrc, /isFreshPicksSameDayCutoffPassed/);
assert.doesNotMatch(checkoutSrc, /freshPicksMethodAvailability/);

const dineInSrc = readSrc("src/engines/business-calendar/dine-in-hours.ts");
assert.match(dineInSrc, /DINE_IN_SLOT_MINUTES = 15/);

const migration = readSrc(
  "supabase/migrations/20260916120000_fresh_picks_fulfilment_preparation.sql",
);
assert.match(migration, /fresh_picks_same_day_preparation_cutoff_time/);
assert.match(migration, /fresh_picks_same_day_preparation_lead_minutes/);
assert.match(migration, /_assert_fresh_picks_customer_fulfilment/);
assert.match(migration, /p_fulfilment_method/);
assert.match(migration, /_time_within_operating_hours_grid/);

console.log("PASS Fresh Picks same-day preparation");
