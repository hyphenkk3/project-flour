/**
 * Customer Operations assisted-order fulfilment parity with Whole Cake calendars.
 * Run: npx tsx scripts/test-customer-operations-assisted-fulfilment.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDeliverySlotsForDate } from "@/engines/business-calendar/delivery-hours";
import {
  DINE_IN_SLOT_MINUTES,
  isValidDineInReservationPair,
  isValidDineInSlot,
} from "@/engines/business-calendar/dine-in-hours";
import { hmToMinutes } from "@/engines/business-calendar/operating-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  earliestPickupDateYmd,
  getPickupSlotsForDate,
  isValidClockPickupTime,
  isValidPickupSlot,
} from "@/engines/business-calendar/pickup-slots";
import {
  defaultAssistedDineInDraft,
  assistedCreateSlotPolicy,
  parseOwnerSpecialArrangementFlag,
  validateAssistedOrderFulfilment,
  validateAssistedOwnerOverrideFulfilment,
} from "@/engines/orders/assisted-fulfilment";
import {
  canOverrideCustomerFulfilmentSchedule,
  buildGuestOrderWorkspaceCapabilities,
} from "@/engines/orders/delivery-finance-capabilities";
import { customerFulfilmentSlotsForDate } from "@/engines/orders/customer-fulfilment-availability";
import {
  defaultDeliveryCreateDraft,
  workspaceScheduleDateLabel,
  workspaceScheduleTimeLabel,
} from "@/engines/orders/fulfilment";
import { addBusinessCalendarDays } from "@/lib/dates";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";

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

function previousWeekdayOnOrBefore(ymd: string, weekday: number): string {
  let current = ymd;
  for (let i = 0; i < 14; i += 1) {
    if (weekdayOf(current) === weekday) return current;
    current = addBusinessCalendarDays(current, -1) ?? current;
  }
  return ymd;
}

const earliest = earliestPickupDateYmd();
const THU = nextWeekdayOnOrAfter(earliest, 4);
const WED = nextWeekdayOnOrAfter(earliest, 3);
const beforeEarliest = addBusinessCalendarDays(earliest, -1) ?? "2020-01-01";
const THU_BEFORE = previousWeekdayOnOrBefore(beforeEarliest, 4);
assert.equal(weekdayOf(THU), 4);
assert.equal(weekdayOf(WED), 3);
assert.equal(weekdayOf(THU_BEFORE), 4);
assert.ok(THU_BEFORE < earliest, "override date is before customer earliest");

const emptyDelivery = defaultDeliveryCreateDraft();
const emptyDineIn = defaultAssistedDineInDraft();
const completeDelivery = {
  ...emptyDelivery,
  recipientName: "Recipient",
  recipientPhone: "0123456789",
  addressLine1: "1 Jalan Test",
  postcode: "88000",
  recipientNotifyPreference: "inform_recipient" as const,
};

function slotStep(slots: { value: string }[]): number | null {
  if (slots.length < 2) return null;
  const first = hmToMinutes(slots[0]?.value ?? "");
  const second = hmToMinutes(slots[1]?.value ?? "");
  if (first == null || second == null) return null;
  return second - first;
}

const pickupSlots = getPickupSlotsForDate(THU, OPERATING_HOURS_SEED);
const deliverySlots = getDeliverySlotsForDate(THU, OPERATING_HOURS_SEED);
const dineInSlots = customerFulfilmentSlotsForDate(
  "dine_in",
  THU,
  [],
  OPERATING_HOURS_SEED,
);
assert.ok(pickupSlots.length > 1, "pickup has slots");
assert.ok(deliverySlots.length > 1, "delivery has slots");
assert.ok(dineInSlots.length > 1, "dine-in has slots");
assert.equal(slotStep(pickupSlots), 30);
assert.equal(slotStep(deliverySlots), 30);
assert.equal(slotStep(dineInSlots), DINE_IN_SLOT_MINUTES);
assert.equal(DINE_IN_SLOT_MINUTES, 15);

const pickupTime = pickupSlots[2]?.value ?? pickupSlots[0]?.value ?? "12:00";
const deliveryTime =
  deliverySlots[2]?.value ?? deliverySlots[0]?.value ?? "12:00";
const dineReservation = dineInSlots[4]?.value ?? "14:00";
const dineServing = dineInSlots[4]?.value ?? "14:00";
assert.equal(isValidPickupSlot(THU, pickupTime, OPERATING_HOURS_SEED), true);
assert.equal(isValidPickupSlot(THU, "14:15", OPERATING_HOURS_SEED), false);
assert.equal(isValidPickupSlot(THU, "10:07", OPERATING_HOURS_SEED), false);
assert.equal(isValidClockPickupTime("14:15"), true);
assert.equal(isValidClockPickupTime("10:07"), true);
assert.equal(
  isValidDineInSlot(THU, dineReservation, OPERATING_HOURS_SEED),
  true,
);
assert.equal(isValidDineInSlot(THU, "14:15", OPERATING_HOURS_SEED), true);
assert.equal(isValidDineInSlot(THU, "14:07", OPERATING_HOURS_SEED), false);
assert.equal(isValidDineInSlot(WED, "14:00", OPERATING_HOURS_SEED), false);

assert.equal(
  validateAssistedOrderFulfilment({
    method: "pickup",
    dateYmd: THU,
    timeValue: pickupTime,
    delivery: emptyDelivery,
    dineIn: emptyDineIn,
  }),
  null,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "pickup",
    dateYmd: THU,
    timeValue: "14:15",
    delivery: emptyDelivery,
    dineIn: emptyDineIn,
  }) ?? "",
  /valid pickup time/,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "pickup",
    dateYmd: addBusinessCalendarDays(earliest, -1) ?? "2020-01-01",
    timeValue: pickupTime,
    delivery: emptyDelivery,
    dineIn: emptyDineIn,
  }) ?? "",
  /valid date and time|pickup date and time/,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "pickup",
    dateYmd: THU,
    timeValue: pickupTime,
    delivery: emptyDelivery,
    dineIn: emptyDineIn,
    closedDates: [THU],
  }) ?? "",
  /Orders are closed/,
);

assert.equal(
  validateAssistedOrderFulfilment({
    method: "delivery",
    dateYmd: THU,
    timeValue: deliveryTime,
    delivery: completeDelivery,
    dineIn: emptyDineIn,
  }),
  null,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "delivery",
    dateYmd: THU,
    timeValue: "14:15",
    delivery: completeDelivery,
    dineIn: emptyDineIn,
  }) ?? "",
  /valid delivery time/,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "delivery",
    dateYmd: WED,
    timeValue: "12:00",
    delivery: completeDelivery,
    dineIn: emptyDineIn,
  }) ?? "",
  /valid delivery time/,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "delivery",
    dateYmd: THU,
    timeValue: deliveryTime,
    delivery: emptyDelivery,
    dineIn: emptyDineIn,
  }) ?? "",
  /recipient name/,
);

const validDineIn = {
  ...emptyDineIn,
  reservationTime: dineReservation,
  venue: "whitebird",
  guestCount: "2",
};
assert.equal(
  isValidDineInReservationPair({
    dateYmd: THU,
    reservationTime: dineReservation,
    servingTime: dineServing,
    venue: "whitebird",
    snapshot: OPERATING_HOURS_SEED,
  }),
  true,
);
assert.equal(
  validateAssistedOrderFulfilment({
    method: "dine_in",
    dateYmd: THU,
    timeValue: dineServing,
    delivery: emptyDelivery,
    dineIn: validDineIn,
  }),
  null,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "dine_in",
    dateYmd: THU,
    timeValue: dineServing,
    delivery: emptyDelivery,
    dineIn: { ...validDineIn, reservationTime: "14:07" },
  }) ?? "",
  /reservation time/,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "dine_in",
    dateYmd: THU,
    timeValue: dineServing,
    delivery: emptyDelivery,
    dineIn: { ...validDineIn, venue: "" },
  }) ?? "",
  /sit/,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "dine_in",
    dateYmd: WED,
    timeValue: "14:00",
    delivery: emptyDelivery,
    dineIn: {
      ...validDineIn,
      reservationTime: "14:00",
    },
  }) ?? "",
  /reservation time/,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "dine_in",
    dateYmd: THU,
    timeValue: dineServing,
    delivery: emptyDelivery,
    dineIn: {
      ...validDineIn,
      reservationTime: dineReservation,
      guestCount: "0",
    },
  }) ?? "",
  /guests/,
);

const laterServing = dineInSlots.find((slot) => {
  const reservation = hmToMinutes(dineReservation);
  const serving = hmToMinutes(slot.value);
  return reservation != null && serving != null && serving > reservation + 60;
});
if (laterServing) {
  assert.match(
    validateAssistedOrderFulfilment({
      method: "dine_in",
      dateYmd: THU,
      timeValue: laterServing.value,
      delivery: emptyDelivery,
      dineIn: validDineIn,
    }) ?? "",
    /1 hour/,
  );
}

assert.equal(workspaceScheduleDateLabel("pickup"), "Pickup date");
assert.equal(workspaceScheduleTimeLabel("pickup"), "Pickup time");
assert.equal(workspaceScheduleDateLabel("delivery"), "Delivery date");
assert.equal(workspaceScheduleTimeLabel("delivery"), "Delivery time");
assert.equal(workspaceScheduleDateLabel("dine_in"), "Dine-in date");
assert.equal(workspaceScheduleTimeLabel("dine_in"), "Cake serving time");

const form = [
  read(
    "src/workspaces/customer-operations/orders/AssistedOrderFulfilmentFields.tsx",
  ),
  read("src/components/ui/DineInVenuePartyFields.tsx"),
].join("\n");
const assistedForm = read(
  "src/workspaces/customer-operations/orders/AssistedOrderForm.tsx",
);
const actions = read("src/workspaces/customer-operations/orders/actions.ts");
const helper = read("src/workspaces/owner/orders/create-staff-preorder.ts");
const ownerForm = read("src/workspaces/owner/orders/StaffGuestOrderForm.tsx");
const ownerCreateFields = read(
  "src/workspaces/owner/orders/OrderFulfilmentCreateFields.tsx",
);
const checkoutActions = read("src/workspaces/storefront/checkout/actions.ts");
const extraActions = read("src/workspaces/storefront/extra/actions.ts");
const migration = read(
  "supabase/migrations/20260917120000_staff_guest_preorder_dine_in.sql",
);

assert.match(form, /Dine-in/);
assert.match(form, /customerFulfilmentSlotsForDate/);
assert.match(form, /cakeServingSlotsForReservation/);
assert.match(form, /venuesForReservationAndServing/);
assert.match(form, /workspaceScheduleDateLabel/);
assert.match(form, /workspaceScheduleTimeLabel/);
assert.match(form, /name="dine_in_venue"/);
assert.match(form, /name="guest_count"/);
assert.match(form, /timeName="reservation_time"/);
assert.match(form, /canOverrideCustomerFulfilmentSchedule/);
assert.match(form, /owner_special_arrangement/);
assert.match(form, /Special arrangement \(custom date\/time\)/);
assert.match(form, /type="time"/);
assert.doesNotMatch(form, /Pickup = 30|Delivery = 30|Dine-in = 15/);
assert.doesNotMatch(form, /stepMinutes\s*=\s*15/);
assert.doesNotMatch(assistedForm, /OrderFulfilmentCreateFields/);
assert.match(assistedForm, /AssistedOrderFulfilmentFields/);
assert.match(assistedForm, /canOverrideCustomerFulfilmentSchedule/);
assert.match(actions, /assistedCreateSlotPolicy/);
assert.match(actions, /owner_special_arrangement/);
assert.doesNotMatch(actions, /slotPolicy: "customer-slots"/);
assert.match(actions, /parseCustomerWebsiteFulfilmentMethod/);
assert.match(helper, /p_dine_in/);
assert.match(helper, /slotPolicy \?\? "owner-clock"/);
assert.match(helper, /isValidClockPickupTime/);
assert.match(helper, /Owner-authorized exception/);
assert.match(helper, /validateAssistedOwnerOverrideFulfilment/);
assert.match(ownerForm, /OrderFulfilmentCreateFields/);
assert.doesNotMatch(ownerForm, /slotPolicy/);
assert.match(ownerCreateFields, /OwnerPickupFields/);
assert.match(ownerCreateFields, /scheduleMode = "owner"/);
assert.doesNotMatch(ownerCreateFields, /dine_in/);
const ownerCreateAction = read("src/workspaces/owner/orders/actions.ts");
const ownerCreateFn = ownerCreateAction.slice(
  ownerCreateAction.indexOf(
    "export async function createStaffGuestOrderAction",
  ),
  ownerCreateAction.indexOf("export async function saveOrderWorkspaceAction"),
);
assert.doesNotMatch(ownerCreateFn, /slotPolicy: "customer-slots"/);
assert.match(ownerCreateFn, /createStaffGuestPreorderRecord/);
const ownerPickupFields = read("src/components/ui/OwnerPickupFields.tsx");
assert.match(ownerPickupFields, /__custom__/);
assert.match(ownerPickupFields, /Custom time for special arrangements/);
assert.doesNotMatch(form, /OwnerPickupFields/);
assert.doesNotMatch(assistedForm, /OwnerPickupFields/);
assert.match(checkoutActions, /isValidPickupSlot/);
assert.match(checkoutActions, /isValidDeliverySlot/);
assert.match(checkoutActions, /isValidDineInReservationPair/);
assert.doesNotMatch(checkoutActions, /create_staff_guest_preorder/);
assert.doesNotMatch(extraActions, /create_staff_guest_preorder/);
assert.match(migration, /p_dine_in jsonb default null/);
assert.match(migration, /'pickup', 'delivery', 'dine_in'/);
assert.match(migration, /_sync_order_fulfilment_from_payload/);
assert.match(
  migration,
  /when v_method = 'dine_in' then 'dine_in'::public.fulfilment_method/,
);
assert.match(migration, /order_dine_in_reservations|p_dine_in/);
assert.equal(
  ownerOrderWorkspaceHref("order-1", "/customer-operations/orders"),
  "/owner/orders/order-1?returnTo=%2Fcustomer-operations%2Forders",
);

assert.equal(canOverrideCustomerFulfilmentSchedule("owner"), true);
assert.equal(canOverrideCustomerFulfilmentSchedule("manager"), false);
assert.equal(
  canOverrideCustomerFulfilmentSchedule("customer_operations"),
  false,
);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({ role: "owner", staffId: "o" })
    .canOverrideCustomerFulfilmentSchedule,
  true,
);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({ role: "manager", staffId: "m" })
    .canOverrideCustomerFulfilmentSchedule,
  false,
);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({
    role: "customer_operations",
    staffId: "c",
  }).canOverrideCustomerFulfilmentSchedule,
  false,
);

assert.equal(parseOwnerSpecialArrangementFlag("1"), true);
assert.equal(parseOwnerSpecialArrangementFlag(""), false);
assert.equal(
  assistedCreateSlotPolicy({
    actorRole: "owner",
    ownerSpecialArrangement: true,
  }),
  "owner-clock",
);
assert.equal(
  assistedCreateSlotPolicy({
    actorRole: "owner",
    ownerSpecialArrangement: false,
  }),
  "customer-slots",
);
assert.equal(
  assistedCreateSlotPolicy({
    actorRole: "manager",
    ownerSpecialArrangement: true,
  }),
  "customer-slots",
);
assert.equal(
  assistedCreateSlotPolicy({
    actorRole: "customer_operations",
    ownerSpecialArrangement: true,
  }),
  "customer-slots",
);

const dineInSlotsBefore = customerFulfilmentSlotsForDate(
  "dine_in",
  THU_BEFORE,
  [],
  OPERATING_HOURS_SEED,
);
assert.ok(dineInSlotsBefore.length > 1, "dine-in slots exist before earliest");
const dineBeforeReservation =
  dineInSlotsBefore[4]?.value ?? dineInSlotsBefore[0]?.value ?? "14:00";
const dineBeforeDraft = {
  ...emptyDineIn,
  reservationTime: dineBeforeReservation,
  venue: "whitebird",
  guestCount: "2",
};

assert.equal(
  validateAssistedOwnerOverrideFulfilment({
    method: "pickup",
    dateYmd: THU_BEFORE,
    timeValue: "14:15",
    delivery: emptyDelivery,
    dineIn: emptyDineIn,
  }),
  null,
);
assert.match(
  validateAssistedOrderFulfilment({
    method: "pickup",
    dateYmd: THU_BEFORE,
    timeValue: pickupTime,
    delivery: emptyDelivery,
    dineIn: emptyDineIn,
  }) ?? "",
  /valid date and time|pickup date and time/,
);
assert.equal(
  validateAssistedOwnerOverrideFulfilment({
    method: "delivery",
    dateYmd: THU,
    timeValue: "14:15",
    delivery: completeDelivery,
    dineIn: emptyDineIn,
  }),
  null,
);
assert.match(
  validateAssistedOwnerOverrideFulfilment({
    method: "delivery",
    dateYmd: THU,
    timeValue: "14:15",
    delivery: emptyDelivery,
    dineIn: emptyDineIn,
  }) ?? "",
  /recipient name/,
);
assert.equal(
  validateAssistedOwnerOverrideFulfilment({
    method: "dine_in",
    dateYmd: THU_BEFORE,
    timeValue: dineBeforeReservation,
    delivery: emptyDelivery,
    dineIn: dineBeforeDraft,
  }),
  null,
);
assert.match(
  validateAssistedOwnerOverrideFulfilment({
    method: "dine_in",
    dateYmd: THU_BEFORE,
    timeValue: dineBeforeReservation,
    delivery: emptyDelivery,
    dineIn: { ...dineBeforeDraft, venue: "" },
  }) ?? "",
  /sit/,
);
assert.match(
  validateAssistedOwnerOverrideFulfilment({
    method: "dine_in",
    dateYmd: THU_BEFORE,
    timeValue: dineBeforeReservation,
    delivery: emptyDelivery,
    dineIn: { ...dineBeforeDraft, guestCount: "0" },
  }) ?? "",
  /guests/,
);

const newPage = read("src/app/(app)/customer-operations/orders/new/page.tsx");
assert.match(newPage, /canOverrideCustomerFulfilmentSchedule/);
assert.match(newPage, /requireStaff/);

console.log("PASS customer operations assisted fulfilment");
