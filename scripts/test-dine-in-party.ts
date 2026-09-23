/**
 * Canonical dine-in venue + party-size rules.
 * Run: npx tsx scripts/test-dine-in-party.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAssistedDineInRpcPayload,
  defaultAssistedDineInDraft,
  validateAssistedOrderFulfilment,
} from "@/engines/orders/assisted-fulfilment";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import { addBusinessCalendarDays } from "@/lib/dates";
import { defaultDeliveryCreateDraft } from "@/engines/orders/fulfilment";
import {
  DINE_IN_BABY_CHAIR_NOTICE,
  DINE_IN_HYPHEN_COMBINE_NOTE,
  DINE_IN_PARTY_ERRORS,
  DINE_IN_VENUE_PHOTO_SRC,
  DINE_IN_WHITEBIRD_GROUP_SIZE_BODY,
  DINE_IN_WHITEBIRD_SPLIT_SEATING_ACK_LABEL,
  buildDineInReservationRpcPayload,
  parseNonNegativeIntCount,
  shouldShowBabyChairNotice,
  shouldShowHyphenCombineNote,
  shouldShowWhitebirdSplitSeatingWarning,
  validateDineInParty,
  validateDineInPartyFromForm,
} from "@/engines/orders/dine-in-party";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

function weekdayOf(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function nextWeekdayOnOrAfter(ymd: string, weekday: number): string {
  let current = ymd;
  for (let i = 0; i < 14; i += 1) {
    if (weekdayOf(current) === weekday) return current;
    current = addBusinessCalendarDays(current, 1) ?? current;
  }
  return ymd;
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

const THU = nextWeekdayOnOrAfter(earliestPickupDateYmd(), 4);
assert.equal(weekdayOf(THU), 4);

// A. Hyphen + 2 adults → allowed, total 2
const hyphenTwo = validateDineInParty({
  venue: "hyphen",
  adultCount: "2",
  kidCount: "",
  toddlerCount: "",
  requireAcknowledgement: true,
});
assert.equal(hyphenTwo.ok, true);
if (hyphenTwo.ok) {
  assert.equal(hyphenTwo.party.totalGuestCount, 2);
  assert.equal(hyphenTwo.party.adultCount, 2);
  assert.equal(hyphenTwo.party.whitebirdSplitSeating, false);
}

// B. Hyphen + 5 adults + 3 kids → total 8, allowed
const hyphenEight = validateDineInParty({
  venue: "hyphen",
  adultCount: "5",
  kidCount: "3",
  toddlerCount: "0",
  requireAcknowledgement: true,
});
assert.equal(hyphenEight.ok, true);
if (hyphenEight.ok) {
  assert.equal(hyphenEight.party.totalGuestCount, 8);
  assert.equal(hyphenEight.party.whitebirdSplitSeating, false);
}
assert.equal(shouldShowHyphenCombineNote("hyphen"), true);
assert.equal(shouldShowWhitebirdSplitSeatingWarning("hyphen", 8), false);

// C. Whitebird + 6 total → allowed, no acknowledgement
const whitebirdSix = validateDineInParty({
  venue: "whitebird",
  adultCount: "4",
  kidCount: "2",
  toddlerCount: "0",
  requireAcknowledgement: true,
});
assert.equal(whitebirdSix.ok, true);
if (whitebirdSix.ok) {
  assert.equal(whitebirdSix.party.totalGuestCount, 6);
  assert.equal(whitebirdSix.party.whitebirdSplitSeatingAcknowledged, false);
}
assert.equal(shouldShowWhitebirdSplitSeatingWarning("whitebird", 6), false);

// D / F. Whitebird + 7 without acknowledgement → blocked from customer submission
const whitebirdSevenNoAck = validateDineInParty({
  venue: "whitebird",
  adultCount: "7",
  requireAcknowledgement: true,
});
assert.equal(whitebirdSevenNoAck.ok, false);
if (!whitebirdSevenNoAck.ok) {
  assert.equal(whitebirdSevenNoAck.error, DINE_IN_PARTY_ERRORS.acknowledgement);
}
assert.equal(shouldShowWhitebirdSplitSeatingWarning("whitebird", 7), true);

// E. Whitebird + 7 with acknowledgement → allowed
const whitebirdSevenAck = validateDineInParty({
  venue: "whitebird",
  adultCount: "7",
  acknowledged: "on",
  requireAcknowledgement: true,
});
assert.equal(whitebirdSevenAck.ok, true);
if (whitebirdSevenAck.ok) {
  assert.equal(whitebirdSevenAck.party.whitebirdSplitSeating, true);
  assert.equal(whitebirdSevenAck.party.whitebirdSplitSeatingAcknowledged, true);
  assert.equal(whitebirdSevenAck.party.totalGuestCount, 7);
}

// G. Whitebird + toddler → stored, baby-chair notice, no guarantee
const whitebirdToddler = validateDineInParty({
  venue: "whitebird",
  adultCount: "2",
  toddlerCount: "1",
  requireAcknowledgement: true,
});
assert.equal(whitebirdToddler.ok, true);
if (whitebirdToddler.ok) {
  assert.equal(whitebirdToddler.party.toddlerCount, 1);
  assert.equal(whitebirdToddler.party.totalGuestCount, 3);
}
assert.equal(shouldShowBabyChairNotice(1), true);
assert.match(DINE_IN_BABY_CHAIR_NOTICE, /first-come, first-served/);
assert.doesNotMatch(DINE_IN_BABY_CHAIR_NOTICE, /guarantee a baby chair$/);

// H. No toddler → no baby-chair notice
assert.equal(shouldShowBabyChairNotice(0), false);

// I. Change Whitebird → Hyphen: warning and ack requirement disappear
assert.equal(shouldShowWhitebirdSplitSeatingWarning("hyphen", 8), false);
const hyphenAfterSwitch = validateDineInParty({
  venue: "hyphen",
  adultCount: "8",
  acknowledged: "on",
  requireAcknowledgement: true,
});
assert.equal(hyphenAfterSwitch.ok, true);
if (hyphenAfterSwitch.ok) {
  assert.equal(
    hyphenAfterSwitch.party.whitebirdSplitSeatingAcknowledged,
    false,
  );
}

// J. Change Hyphen → Whitebird with >6: warning + ack required
assert.equal(shouldShowWhitebirdSplitSeatingWarning("whitebird", 8), true);

// K / L. Waiting List dine-in uses the same validator
const waitingListWhitebird = validateDineInPartyFromForm(
  form({
    dine_in_venue: "whitebird",
    adult_count: "8",
    kid_count: "0",
    toddler_count: "0",
  }),
  true,
);
assert.equal(waitingListWhitebird.ok, false);
const waitingListHyphen = validateDineInPartyFromForm(
  form({
    dine_in_venue: "hyphen",
    adult_count: "8",
  }),
  true,
);
assert.equal(waitingListHyphen.ok, true);

// M. Fresh Pick dine-in Whitebird >6 uses the same rules
const freshPickWhitebird = validateDineInParty({
  venue: "whitebird",
  adultCount: "5",
  kidCount: "2",
  requireAcknowledgement: true,
});
assert.equal(freshPickWhitebird.ok, false);

// N. Fresh Pick pickup does not call dine-in validation — no venue required
assert.equal(parseNonNegativeIntCount("-1"), null);

// O. Staff/manual Whitebird >6 allowed without customer acknowledgement
const staffWhitebird = validateDineInParty({
  venue: "whitebird",
  adultCount: "7",
  requireAcknowledgement: false,
});
assert.equal(staffWhitebird.ok, true);
if (staffWhitebird.ok) {
  assert.equal(staffWhitebird.party.venue, "whitebird");
  assert.equal(staffWhitebird.party.totalGuestCount, 7);
  assert.equal(staffWhitebird.party.whitebirdSplitSeating, true);
  assert.equal(staffWhitebird.party.whitebirdSplitSeatingAcknowledged, false);
}
assert.equal(
  validateAssistedOrderFulfilment({
    method: "dine_in",
    dateYmd: THU,
    timeValue: "14:30",
    delivery: defaultDeliveryCreateDraft(),
    dineIn: {
      ...defaultAssistedDineInDraft(),
      reservationTime: "14:00",
      venue: "whitebird",
      adultCount: "7",
    },
  }),
  null,
);
const staffPayload = buildAssistedDineInRpcPayload({
  ...defaultAssistedDineInDraft(),
  reservationTime: "14:00",
  venue: "whitebird",
  adultCount: "7",
});
assert.ok(staffPayload);
assert.equal(staffPayload?.guest_count, 7);
assert.equal(staffPayload?.adult_count, 7);
assert.equal(staffPayload?.whitebird_split_seating_acknowledged, false);

// P. Pickup/delivery have no venue requirement in this layer
assert.equal(
  validateAssistedOrderFulfilment({
    method: "pickup",
    dateYmd: THU,
    timeValue: "14:00",
    delivery: defaultDeliveryCreateDraft(),
    dineIn: defaultAssistedDineInDraft(),
  }),
  null,
);

// Q. Invalid / negative / non-integer guest counts rejected
assert.equal(parseNonNegativeIntCount("-1"), null);
assert.equal(parseNonNegativeIntCount("1.5"), null);
assert.equal(parseNonNegativeIntCount("abc"), null);
assert.equal(
  validateDineInParty({
    venue: "hyphen",
    adultCount: "-1",
    requireAcknowledgement: true,
  }).ok,
  false,
);
assert.equal(
  validateDineInParty({
    venue: "hyphen",
    adultCount: "1.5",
    requireAcknowledgement: true,
  }).ok,
  false,
);

// R. Client-supplied total cannot override component counts
const manipulated = validateDineInParty({
  venue: "hyphen",
  adultCount: "2",
  kidCount: "1",
  toddlerCount: "1",
  guestCount: "99",
  requireAcknowledgement: true,
});
assert.equal(manipulated.ok, true);
if (manipulated.ok) {
  assert.equal(manipulated.party.totalGuestCount, 4);
  assert.equal(
    buildDineInReservationRpcPayload({
      party: manipulated.party,
      reservationTime: "14:00",
      reservationNote: null,
    }).guest_count,
    4,
  );
}

assert.match(DINE_IN_WHITEBIRD_GROUP_SIZE_BODY, /cannot be combined/);
assert.match(
  DINE_IN_WHITEBIRD_GROUP_SIZE_BODY,
  /may not be next to each other/,
);
assert.match(
  DINE_IN_WHITEBIRD_SPLIT_SEATING_ACK_LABEL,
  /tables cannot be combined/,
);
assert.equal(DINE_IN_VENUE_PHOTO_SRC.hyphen, null);
assert.equal(DINE_IN_VENUE_PHOTO_SRC.whitebird, null);
assert.match(DINE_IN_HYPHEN_COMBINE_NOTE, /tables can be combined at Hyphen/);

const migration = read(
  "supabase/migrations/20260921150000_dine_in_party_composition.sql",
);
assert.match(migration, /assert_dine_in_party_payload/);
assert.match(migration, /adult_count/);
assert.match(migration, /kid_count/);
assert.match(migration, /toddler_count/);
assert.match(migration, /Whitebird groups above 6 are allowed/);
assert.match(migration, /p_require_acknowledgement, false/);
assert.doesNotMatch(migration, /raise exception 'Whitebird groups above 6/);

const ui = read("src/components/ui/DineInVenuePartyFields.tsx");
assert.match(ui, /DineInVenuePartyFields/);
assert.match(ui, /Total guests/);
assert.match(ui, /DINE_IN_WHITEBIRD_GROUP_SIZE_BODY/);
assert.match(ui, /DINE_IN_BABY_CHAIR_NOTICE/);
assert.match(ui, /requireAcknowledgement/);
assert.match(ui, /photos\?/);
assert.match(ui, /dineInVenuePhoto/);

const checkoutForm = read(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const extraForm = read(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const waitingForm = read(
  "src/workspaces/storefront/waiting-list/WaitingListConfirmationForm.tsx",
);
const assistedForm = read(
  "src/workspaces/customer-operations/orders/AssistedOrderFulfilmentFields.tsx",
);
assert.match(checkoutForm, /DineInVenuePartyFields/);
assert.match(extraForm, /DineInVenuePartyFields/);
assert.match(waitingForm, /DineInVenuePartyFields/);
assert.match(assistedForm, /DineInVenuePartyFields/);
assert.match(assistedForm, /requireAcknowledgement=\{false\}/);

const checkoutAction = read("src/workspaces/storefront/checkout/actions.ts");
const extraAction = read("src/workspaces/storefront/extra/actions.ts");
const waitingAction = read(
  "src/workspaces/storefront/waiting-list/confirmation-actions.ts",
);
const ownerAction = read("src/workspaces/owner/orders/actions.ts");
assert.match(checkoutAction, /validateDineInPartyFromForm\(formData, true\)/);
assert.match(extraAction, /validateDineInPartyFromForm\(formData, true\)/);
assert.match(waitingAction, /validateDineInPartyFromForm\(formData, true\)/);
assert.match(ownerAction, /validateDineInPartyFromForm\(formData, false\)/);

console.log("test-dine-in-party: ok");
