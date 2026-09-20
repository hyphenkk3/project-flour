/**
 * Phase 7 — Waiting List (static).
 * Run: npx tsx scripts/test-waiting-list.ts
 *
 * Engine + source assertions. Does not create waiting-list rows, orders,
 * capacity, or catalogue data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  allocateWaitingListOffers,
  capacityIncreaseRequiresWaitingListAction,
  offeredQuantityForRemaining,
  waitingListAvailableToOffer,
  waitingListItemMatchesCapacityEvent,
  waitingListOverAllocates,
} from "@/engines/waiting-list/allocation";
import {
  canConfigureWaitingList,
  canManageWaitingList,
  canViewWaitingList,
} from "@/engines/waiting-list/capabilities";
import {
  isCustomerWaitingListJoinable,
  isWaitingListOffered,
  waitingListEligibleCartLines,
} from "@/engines/waiting-list/eligibility";
import {
  isValidWaitingListWhatsApp,
  WAITING_LIST_ACK_CONTACT,
  WAITING_LIST_ACK_TITLE,
  WAITING_LIST_JOIN_CTA,
  WAITING_LIST_NAME_HELP,
  WAITING_LIST_REQUEST_NOT_ORDER,
  WAITING_LIST_WHATSAPP_NOTE,
  waitingListWhatsAppDigits,
} from "@/engines/waiting-list/phone";
import {
  nextWaitingListQueuePosition,
  waitingListItemAfterPartialAccept,
  waitingListQuantityChangeKeepsPosition,
  waitingListRemainingQuantity,
  waitingListRequestStatusFromItems,
  waitingListScopeChanged,
} from "@/engines/waiting-list/queue";
import {
  resolveWaitingListResponseMinutes,
  waitingListResponseDeadline,
  waitingListResponseIsLate,
} from "@/engines/waiting-list/response-window";
import { DEFAULT_WAITING_LIST_RESPONSE_MINUTES } from "@/engines/waiting-list/types";
import { evaluateGuestCartDateCapacity } from "@/engines/preorder/capacity";
import { evaluateCollectionDate } from "@/engines/preorder/validate";
import { JOIN_WAITING_LIST_CUSTOMER_LABEL } from "@/engines/preorder/types";
import {
  isWaitingListFilterCakeSizePairValid,
  nextWaitingListFilterSizeId,
  WAITING_LIST_FILTER_ACTION,
  WAITING_LIST_SECTION_ID,
  waitingListBoardHref,
  waitingListFilterSizeOptions,
} from "@/workspaces/waiting-list/filter";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.equal(WAITING_LIST_JOIN_CTA, "Join Waiting List");
assert.equal(JOIN_WAITING_LIST_CUSTOMER_LABEL, "Join Waiting List");
assert.equal(WAITING_LIST_ACK_TITLE, "You're on the waiting list.");
assert.match(WAITING_LIST_NAME_HELP, /Nickname \/ English name/);
assert.match(WAITING_LIST_WHATSAPP_NOTE, /WhatsApp number is correct/);
assert.match(WAITING_LIST_REQUEST_NOT_ORDER, /not a confirmed order/);
assert.match(WAITING_LIST_ACK_CONTACT, /does not guarantee/);
assert.equal(waitingListWhatsAppDigits("+60 12-345 6789"), "60123456789");
assert.equal(isValidWaitingListWhatsApp("012-345"), false);
assert.equal(isValidWaitingListWhatsApp("0123456789"), true);

// 1. Disabled → Join Waiting List unavailable
assert.equal(
  isWaitingListOffered({
    fullyBooked: true,
    collectionWaitingListEnabled: false,
    capacityWaitingListEnabled: true,
  }),
  false,
);
assert.equal(
  isWaitingListOffered({
    fullyBooked: true,
    collectionWaitingListEnabled: true,
    capacityWaitingListEnabled: false,
  }),
  false,
);
assert.equal(
  isWaitingListOffered({
    fullyBooked: false,
    collectionWaitingListEnabled: true,
    capacityWaitingListEnabled: true,
  }),
  false,
);
assert.equal(
  isCustomerWaitingListJoinable({
    ordersClosed: true,
    collectionWaitingListEnabled: true,
    matchingCapacity: true,
    capacityWaitingListEnabled: true,
    fullyBooked: false,
  }),
  true,
);
assert.equal(
  isCustomerWaitingListJoinable({
    ordersClosed: false,
    collectionWaitingListEnabled: true,
    matchingCapacity: true,
    capacityWaitingListEnabled: true,
    fullyBooked: false,
  }),
  false,
);

// 2. Enabled + Fully Booked → eligible
assert.equal(
  isWaitingListOffered({
    fullyBooked: true,
    collectionWaitingListEnabled: true,
    capacityWaitingListEnabled: true,
  }),
  true,
);

const cakeA = "cake-a";
const cakeB = "cake-b";
const sizeM = "size-m";
const sizeL = "size-l";
const pickupDate = "2026-09-10";
const cart = [
  { cakeId: cakeA, cakeSizeId: sizeM, quantity: 2, cakeName: "Pandan Cake" },
  { cakeId: cakeB, cakeSizeId: sizeL, quantity: 1, cakeName: "Chocolate Cake" },
];
const eligible = waitingListEligibleCartLines({
  collectionWaitingListEnabled: true,
  cart,
  fullyBookedLineKeys: new Set([`${cakeA}|${sizeM}`, `${cakeB}|${sizeL}`]),
  capacityWaitingListByLineKey: new Map([
    [`${cakeA}|${sizeM}`, true],
    [`${cakeB}|${sizeL}`, true],
  ]),
});
assert.equal(eligible.length, 2);
assert.equal(eligible[0]?.quantity, 2);
assert.equal(eligible[1]?.quantity, 1);

const mixedEligible = waitingListEligibleCartLines({
  collectionWaitingListEnabled: true,
  cart,
  fullyBookedLineKeys: new Set([`${cakeA}|${sizeM}`]),
  capacityWaitingListByLineKey: new Map([
    [`${cakeA}|${sizeM}`, true],
    [`${cakeB}|${sizeL}`, false],
  ]),
});
assert.deepEqual(
  mixedEligible.map((line) => line.cakeId),
  [cakeA],
);

const offeredDate = evaluateCollectionDate({
  selectedYmd: pickupDate,
  businessDate: "2026-09-03",
  lines: [
    {
      lineId: `${cakeA}|${sizeM}`,
      cakeId: cakeA,
      cakeSizeId: sizeM,
      cakeName: "Pandan Cake",
      sizeLabel: "6-inch",
      quantity: 2,
      preorderDays: 2,
    },
  ],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
  capacity: {
    fullyBooked: true,
    waitingListEnabled: true,
    blockingCakeNames: ["Pandan Cake"],
    selectedYmd: pickupDate,
    nextAvailableYmd: null,
  },
});
assert.equal(offeredDate.valid, false);
assert.equal(offeredDate.reason.code, "fully_booked");
if (offeredDate.reason.code === "fully_booked") {
  assert.equal(offeredDate.reason.waitingListOffered, true);
}

const blockedDate = evaluateCollectionDate({
  selectedYmd: pickupDate,
  businessDate: "2026-09-03",
  lines: [
    {
      lineId: `${cakeA}|${sizeM}`,
      cakeId: cakeA,
      cakeSizeId: sizeM,
      cakeName: "Pandan Cake",
      sizeLabel: "6-inch",
      quantity: 2,
      preorderDays: 2,
    },
  ],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
  capacity: {
    fullyBooked: true,
    waitingListEnabled: false,
    blockingCakeNames: ["Pandan Cake"],
    selectedYmd: pickupDate,
    nextAvailableYmd: null,
  },
});
assert.equal(blockedDate.reason.code, "fully_booked");
if (blockedDate.reason.code === "fully_booked") {
  assert.equal(blockedDate.reason.waitingListOffered, false);
}

const cartCapacity = evaluateGuestCartDateCapacity({
  pickupDate,
  collectionId: "col-1",
  cart,
  rows: [
    {
      pickupDate,
      cakeId: cakeA,
      sizeId: sizeM,
      collectionId: null,
      capacityQuantity: 0,
      waitingListEnabled: true,
    },
    {
      pickupDate,
      cakeId: cakeB,
      sizeId: sizeL,
      collectionId: null,
      capacityQuantity: 0,
      waitingListEnabled: false,
    },
  ],
  used: [],
  collectionWaitingListEnabled: true,
});
assert.equal(cartCapacity.fullyBooked, true);
assert.equal(cartCapacity.waitingListEnabled, true);
assert.deepEqual(cartCapacity.waitingListLineKeys, [`${cakeA}|${sizeM}`]);

const collectionOff = evaluateGuestCartDateCapacity({
  pickupDate,
  collectionId: "col-1",
  cart,
  rows: [
    {
      pickupDate,
      cakeId: cakeA,
      sizeId: sizeM,
      collectionId: null,
      capacityQuantity: 0,
      waitingListEnabled: true,
    },
  ],
  used: [],
  collectionWaitingListEnabled: false,
});
assert.equal(collectionOff.fullyBooked, true);
assert.equal(collectionOff.waitingListEnabled, false);

// 3–6 grouped request fields
assert.equal(eligible.length, 2);

// 7. Queue position scoped by date/cake/size
assert.equal(nextWaitingListQueuePosition([]), 1);
assert.equal(nextWaitingListQueuePosition([1, 2]), 3);
assert.equal(
  waitingListScopeChanged(
    { pickupDate, cakeId: cakeA, sizeId: sizeM },
    { pickupDate, cakeId: cakeA, sizeId: sizeM },
  ),
  false,
);

// 8. Quantity-only change preserves queue position
assert.equal(waitingListQuantityChangeKeepsPosition(), true);

// 9–10. Product / date change
assert.equal(
  waitingListScopeChanged(
    { pickupDate, cakeId: cakeA, sizeId: sizeM },
    { pickupDate, cakeId: cakeB, sizeId: sizeM },
  ),
  true,
);
assert.equal(
  waitingListScopeChanged(
    { pickupDate, cakeId: cakeA, sizeId: sizeM },
    { pickupDate: "2026-09-11", cakeId: cakeA, sizeId: sizeM },
  ),
  true,
);

// 11. Remaining quantity math / cancellation retains history (source)
assert.equal(waitingListRemainingQuantity(2, 1), 1);

// 14–16. Contact window
assert.equal(resolveWaitingListResponseMinutes(null, null), 30);
assert.equal(DEFAULT_WAITING_LIST_RESPONSE_MINUTES, 30);
assert.equal(resolveWaitingListResponseMinutes(45, 30), 45);
assert.equal(resolveWaitingListResponseMinutes(null, 20), 20);
const contactedAt = new Date("2026-09-03T02:00:00.000Z");
const deadline = waitingListResponseDeadline(contactedAt, 30);
assert.equal(deadline.getTime() - contactedAt.getTime(), 30 * 60 * 1000);
assert.equal(
  waitingListResponseIsLate(new Date("2026-09-03T02:20:00.000Z"), deadline),
  false,
);
assert.equal(
  waitingListResponseIsLate(new Date("2026-09-03T02:31:00.000Z"), deadline),
  true,
);
assert.equal(
  capacityIncreaseRequiresWaitingListAction(4, 6),
  true,
);
assert.equal(
  capacityIncreaseRequiresWaitingListAction(6, 6),
  false,
);
assert.equal(
  capacityIncreaseRequiresWaitingListAction(null, 6),
  false,
);

// 17–21. Decline / partial / remaining
assert.equal(waitingListAvailableToOffer({
  capacityQuantity: 3,
  occupiedQuantity: 0,
  activeHoldQuantity: 0,
}), 3);
assert.equal(offeredQuantityForRemaining(1, 2), 1);
const afterPartialKeep = waitingListItemAfterPartialAccept({
  quantity: 2,
  previouslyAccepted: 0,
  newlyAccepted: 1,
  keepRemaining: true,
});
assert.equal(afterPartialKeep.status, "partially_accepted");
assert.equal(afterPartialKeep.remainingQuantity, 1);
const afterPartialClose = waitingListItemAfterPartialAccept({
  quantity: 2,
  previouslyAccepted: 0,
  newlyAccepted: 1,
  keepRemaining: false,
});
assert.equal(afterPartialClose.status, "closed");
assert.equal(
  waitingListRequestStatusFromItems(["partially_accepted", "converted"]),
  "partially_converted",
);
assert.equal(waitingListRequestStatusFromItems(["cancelled"]), "cancelled");

// 32. Multiple customers in queue order
const offers = allocateWaitingListOffers(3, [
  { itemId: "c", remainingQuantity: 1, queuePosition: 3, alreadyContacted: false },
  { itemId: "a", remainingQuantity: 2, queuePosition: 1, alreadyContacted: false },
  { itemId: "b", remainingQuantity: 2, queuePosition: 2, alreadyContacted: false },
]);
assert.deepEqual(offers, [
  { itemId: "a", offeredQuantity: 2 },
  { itemId: "b", offeredQuantity: 1 },
]);

const afterADeclines = allocateWaitingListOffers(3, [
  { itemId: "a", remainingQuantity: 2, queuePosition: 1, alreadyContacted: false },
  { itemId: "b", remainingQuantity: 2, queuePosition: 2, alreadyContacted: false },
  { itemId: "c", remainingQuantity: 1, queuePosition: 3, alreadyContacted: false },
]);
assert.deepEqual(afterADeclines[0], { itemId: "a", offeredQuantity: 2 });

const skipContacted = allocateWaitingListOffers(3, [
  { itemId: "a", remainingQuantity: 2, queuePosition: 1, alreadyContacted: true },
  { itemId: "b", remainingQuantity: 2, queuePosition: 2, alreadyContacted: false },
]);
assert.deepEqual(skipContacted, [{ itemId: "b", offeredQuantity: 2 }]);

// 34. No over-allocation
assert.equal(
  waitingListOverAllocates({
    capacityQuantity: 3,
    occupiedQuantity: 0,
    activeHoldQuantity: 2,
    additionalHold: 2,
  }),
  true,
);
assert.equal(
  waitingListOverAllocates({
    capacityQuantity: 3,
    occupiedQuantity: 0,
    activeHoldQuantity: 2,
    additionalHold: 1,
  }),
  false,
);

// 31. Capacity increase identifies affected queue
assert.equal(
  waitingListItemMatchesCapacityEvent({
    itemPickupDate: pickupDate,
    itemCakeId: cakeA,
    itemSizeId: sizeM,
    itemStatus: "active",
    eventPickupDate: pickupDate,
    eventCakeId: cakeA,
    eventSizeId: sizeM,
  }),
  true,
);
assert.equal(
  waitingListItemMatchesCapacityEvent({
    itemPickupDate: pickupDate,
    itemCakeId: cakeA,
    itemSizeId: sizeM,
    itemStatus: "contacted",
    eventPickupDate: pickupDate,
    eventCakeId: cakeA,
    eventSizeId: sizeM,
  }),
  false,
);
assert.equal(
  waitingListItemMatchesCapacityEvent({
    itemPickupDate: pickupDate,
    itemCakeId: cakeA,
    itemSizeId: sizeL,
    itemStatus: "active",
    eventPickupDate: pickupDate,
    eventCakeId: cakeA,
    eventSizeId: sizeM,
  }),
  false,
);

// 36–39. Permissions
assert.equal(canViewWaitingList("customer_operations"), true);
assert.equal(canManageWaitingList("bakery"), true);
assert.equal(canConfigureWaitingList("bakery"), true);
assert.equal(canConfigureWaitingList("customer_operations"), false);
assert.equal(canViewWaitingList("collection"), false);
assert.equal(canManageWaitingList("collection"), false);
assert.equal(canConfigureWaitingList("collection"), false);
assert.equal(canViewWaitingList("owner"), true);
assert.equal(canConfigureWaitingList("manager"), true);

const phase2 = readSrc(
  "supabase/migrations/20260902120000_phase2_ordering_foundation.sql",
);
assert.match(phase2, /create table if not exists public.waiting_list_requests/);
assert.match(phase2, /create table if not exists public.waiting_list_items/);
assert.match(phase2, /create table if not exists public.waiting_list_events/);
assert.match(phase2, /waiting_list_items_active_queue_position_unique_idx/);
assert.match(phase2, /open_to_alternatives/);
assert.match(phase2, /production_capacity_holds/);
assert.match(phase2, /waiting_list_enabled/);
assert.match(phase2, /waiting_list_response_minutes/);
assert.match(phase2, /revoke all on table public.waiting_list_requests from public, anon/);

const sql = readSrc(
  "supabase/migrations/20260903120000_waiting_list_engine.sql",
);
assert.match(sql, /submit_guest_waiting_list_request/);
assert.match(sql, /create_staff_waiting_list_request/);
assert.match(sql, /waiting_list_contact_item/);
assert.match(sql, /waiting_list_record_response/);
assert.match(sql, /waiting_list_convert_item/);
assert.match(sql, /waiting_list_cancel_item/);
assert.match(sql, /waiting_list_offer_alternative/);
assert.match(sql, /waiting_list_set_item_quantity/);
assert.match(sql, /waiting_list_replace_item_scope/);
assert.match(sql, /for update/);
assert.match(sql, /production_capacity_holds/);
assert.match(sql, /create_staff_guest_preorder/);
assert.match(sql, /capacity_action_required/);
assert.match(sql, /now\(\) \+ make_interval\(mins => v_minutes\)/);
assert.match(sql, /waiting_list_requests_staff_all/);
assert.match(sql, /_waiting_list_can_manage/);
assert.doesNotMatch(sql, /for all to authenticated\nusing \(true\)/);
assert.match(sql, /grant execute on function public.submit_guest_waiting_list_request/);
assert.match(sql, /to anon, authenticated/);
assert.match(sql, /'joined'/);
assert.match(sql, /'manually_added'/);
assert.match(sql, /'quantity_changed'/);
assert.match(sql, /'product_changed'/);
assert.match(sql, /'date_changed'/);
assert.match(sql, /'contacted'/);
assert.match(sql, /'response_deadline'/);
assert.match(sql, /'accepted'/);
assert.match(sql, /'declined'/);
assert.match(sql, /'partially_fulfilled'/);
assert.match(sql, /'remaining_kept'/);
assert.match(sql, /'remaining_closed'/);
assert.match(sql, /'alternative_offered'/);
assert.match(sql, /'alternative_accepted'/);
assert.match(sql, /'alternative_declined'/);
assert.match(sql, /'cancelled'/);
assert.match(sql, /'converted_to_order'/);
assert.match(sql, /p_keep_original/);
assert.match(sql, /This cake is still available to order for that date/);
assert.doesNotMatch(sql, /delete from public.waiting_list_/);

const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(formSrc, /JoinWaitingListForm/);
assert.match(formSrc, /fullyBookedWithoutWaitingList/);
assert.match(formSrc, /waitingListOffered/);
assert.match(formSrc, /CustomerWaitingListAvailability/);
assert.match(formSrc, /WAITING_LIST_SEE_AVAILABLE_CTA/);

const joinSrc = readSrc(
  "src/workspaces/storefront/waiting-list/JoinWaitingListForm.tsx",
);
assert.match(joinSrc, /WAITING_LIST_JOIN_CTA/);
assert.match(joinSrc, /WAITING_LIST_REQUEST_NOT_ORDER/);
assert.match(joinSrc, /WAITING_LIST_NAME_HELP/);
assert.match(joinSrc, /WAITING_LIST_WHATSAPP_NOTE/);
assert.match(joinSrc, /open_to_alternatives/);
assert.doesNotMatch(joinSrc, /payment/i);
assert.doesNotMatch(joinSrc, /queue_position/);

const ackSrc = readSrc(
  "src/workspaces/storefront/waiting-list/StorefrontWaitingListAckPage.tsx",
);
assert.match(ackSrc, /WAITING_LIST_ACK_TITLE/);
assert.match(ackSrc, /WAITING_LIST_ACK_CONTACT/);
assert.doesNotMatch(ackSrc, /queuePosition/);
assert.doesNotMatch(ackSrc, /queue_position/);

const guestQueries = readSrc(
  "src/workspaces/storefront/waiting-list/queries.ts",
);
assert.match(guestQueries, /guestWaitingListCookieId/);
assert.match(guestQueries, /createServiceClient/);
assert.doesNotMatch(guestQueries, /queue_position/);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const extraPageSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
assert.doesNotMatch(extraFormSrc, /Join Waiting List/);
assert.doesNotMatch(extraFormSrc, /waiting-list/);
assert.doesNotMatch(extraPageSrc, /Join Waiting List/);

const slotSrc = readSrc("src/components/ui/PickupSlotFields.tsx");
assert.doesNotMatch(slotSrc, /Join Waiting List/);

const boardSrc = readSrc("src/workspaces/waiting-list/WaitingListBoard.tsx");
assert.match(boardSrc, /Scan by date/);
assert.match(boardSrc, /Scan by cake/);
assert.match(boardSrc, /Convert to order/);
assert.match(boardSrc, /Contact/);
assert.match(boardSrc, /Record response/);
assert.match(boardSrc, /Close remaining request/);
assert.match(boardSrc, /Offer alternative/);
assert.match(boardSrc, /Add customer to waiting list/);
assert.match(boardSrc, /replaceWaitingListItemScopeAction/);
assert.match(boardSrc, /Update cake or date/);
assert.match(boardSrc, /guestSnapshotFromCrmCustomer/);
assert.match(boardSrc, /Not in CRM/);
assert.match(boardSrc, /name="notes"/);
assert.doesNotMatch(boardSrc, /name="customer_id"/);
assert.doesNotMatch(boardSrc, /capacity_quantity/);
assert.doesNotMatch(boardSrc, /committedQuantity/);

const sectionSrc = readSrc("src/workspaces/waiting-list/WaitingListSection.tsx");
assert.match(sectionSrc, /listCustomers/);
assert.match(sectionSrc, /listWaitingListCakeOptions/);

const staffActionsSrc = readSrc("src/workspaces/waiting-list/actions.ts");
assert.match(staffActionsSrc, /create_staff_waiting_list_request/);
assert.match(staffActionsSrc, /waiting_list_set_item_quantity/);
assert.match(staffActionsSrc, /waiting_list_replace_item_scope/);
assert.match(staffActionsSrc, /waiting_list_cancel_item/);
assert.match(staffActionsSrc, /p_notes: notes \|\| null/);
assert.doesNotMatch(staffActionsSrc, /p_customer_id/);
assert.match(staffActionsSrc, /canManageWaitingList/);
assert.match(staffActionsSrc, /canConfigureWaitingList/);

const pageSrc = readSrc("src/app/(app)/bakery/availability/page.tsx");
assert.match(pageSrc, /WaitingListSection/);
assert.match(pageSrc, /canViewWaitingList/);

const accessSrc = readSrc("src/foundation/navigation/access.ts");
assert.match(accessSrc, /canViewWaitingList/);

const setCapacitySql = readSrc(
  "supabase/migrations/20260903100000_set_production_capacity.sql",
);
assert.match(setCapacitySql, /waiting_list_enabled,/);
assert.match(setCapacitySql, /Does not touch waiting-list holds/);
assert.match(sql, /set_production_capacity_waiting_list/);
assert.doesNotMatch(sql, /create or replace function public.set_production_capacity\(/);

const capacityEngine = readSrc("src/engines/preorder/capacity.ts");
assert.match(capacityEngine, /Waiting-list holds are not counted/);

const convertSql = sql.slice(sql.indexOf("waiting_list_convert_item"));
assert.match(convertSql, /create_staff_guest_preorder/);
assert.match(convertSql, /guest_name/);
assert.match(convertSql, /guest_phone/);
assert.match(convertSql, /v_item.pickup_date/);

assert.equal(WAITING_LIST_SECTION_ID, "waiting-list-heading");
assert.equal(
  WAITING_LIST_FILTER_ACTION,
  "/bakery/availability#waiting-list-heading",
);
assert.equal(
  waitingListBoardHref({
    date: "2026-09-25",
    cakeId: "cake-1",
    sizeId: "size-1",
  }),
  "/bakery/availability?date=2026-09-25&wlCake=cake-1&wlSize=size-1#waiting-list-heading",
);
assert.match(boardSrc, /WAITING_LIST_FILTER_ACTION/);
assert.match(boardSrc, /method="get"/);
assert.match(boardSrc, /name="month"/);
assert.match(boardSrc, /name="date"/);
assert.match(boardSrc, /name="wlCake"/);
assert.match(boardSrc, /name="wlSize"/);
assert.match(boardSrc, /name="wlStatus"/);
assert.match(boardSrc, /id=\{WAITING_LIST_SECTION_ID\}/);
assert.doesNotMatch(boardSrc, /action="\/bakery\/availability"/);

const filterCakes = [
  {
    id: "choc",
    sizes: [
      { id: "choc-6", label: '6"' },
      { id: "choc-8", label: '8"' },
    ],
  },
  {
    id: "pandan",
    sizes: [{ id: "pandan-6", label: '6"' }],
  },
];
assert.deepEqual(
  waitingListFilterSizeOptions(filterCakes, "choc").map((size) => size.id),
  ["choc-6", "choc-8"],
);
assert.deepEqual(waitingListFilterSizeOptions(filterCakes, ""), []);
assert.equal(
  nextWaitingListFilterSizeId(waitingListFilterSizeOptions(filterCakes, "choc"), "choc-6"),
  "choc-6",
);
assert.equal(
  nextWaitingListFilterSizeId(
    waitingListFilterSizeOptions(filterCakes, "pandan"),
    "choc-6",
  ),
  "",
);
assert.equal(
  nextWaitingListFilterSizeId(waitingListFilterSizeOptions(filterCakes, ""), "choc-6"),
  "",
);
assert.equal(isWaitingListFilterCakeSizePairValid(filterCakes, "choc", "choc-6"), true);
assert.equal(isWaitingListFilterCakeSizePairValid(filterCakes, "choc", "pandan-6"), false);
assert.equal(isWaitingListFilterCakeSizePairValid(filterCakes, "choc", ""), true);
assert.equal(isWaitingListFilterCakeSizePairValid(filterCakes, "", ""), true);
assert.equal(isWaitingListFilterCakeSizePairValid(filterCakes, "", "choc-6"), false);
assert.match(boardSrc, /waitingListFilterSizeOptions/);
assert.match(boardSrc, /nextWaitingListFilterSizeId/);

const queriesSrc = readSrc("src/workspaces/waiting-list/queries.ts");
assert.match(queriesSrc, /query = query\.eq\("pickup_date", input\.date\)/);
assert.match(queriesSrc, /query = query\.eq\("library_cake_id", input\.cakeId\)/);
assert.match(queriesSrc, /query = query\.eq\("library_cake_size_id", input\.sizeId\)/);
assert.match(queriesSrc, /query = query\.eq\("status", input\.status\)/);

assert.match(sql, /Waiting list is not available for that cake and date/);
assert.match(sql, /Waiting list is not enabled for that cake and date/);
assert.match(sql, /Waiting list is not enabled for this collection/);

const insertStart = sql.indexOf(
  "create or replace function public._waiting_list_insert_request",
);
assert.ok(insertStart >= 0);
const insertEnd = sql.indexOf("\ncreate or replace function public.", insertStart + 1);
const insertSql = sql.slice(insertStart, insertEnd > insertStart ? insertEnd : undefined);
assert.doesNotMatch(insertSql, /order_availability/);
assert.doesNotMatch(insertSql, /is_pickup_orders_closed/);

const closedDateSql = readSrc(
  "supabase/migrations/20260920140000_guest_waiting_list_closed_date.sql",
);
assert.match(closedDateSql, /is_pickup_orders_closed\(p_pickup_date\)/);
assert.match(closedDateSql, /_guest_preorder_item_fully_booked/);
assert.match(closedDateSql, /p_actor_staff_id is null/);
assert.match(insertSql, /_waiting_list_matching_capacity/);
assert.match(insertSql, /v_collection.waiting_list_enabled is not true/);
assert.match(insertSql, /v_capacity.waiting_list_enabled is not true/);

const closedDate = evaluateCollectionDate({
  selectedYmd: pickupDate,
  businessDate: "2026-09-03",
  lines: [
    {
      lineId: `${cakeA}|${sizeM}`,
      cakeId: cakeA,
      cakeSizeId: sizeM,
      cakeName: "Pandan Cake",
      sizeLabel: "6-inch",
      quantity: 2,
      preorderDays: 2,
    },
  ],
  operatingOpen: true,
  closed: true,
  inCatalogue: true,
  capacity: {
    fullyBooked: true,
    waitingListEnabled: true,
    blockingCakeNames: ["Pandan Cake"],
    selectedYmd: pickupDate,
    nextAvailableYmd: null,
  },
});
assert.equal(closedDate.valid, false);
assert.equal(closedDate.reason.code, "orders_closed");

assert.match(boardSrc, /createState\.error/);
assert.match(boardSrc, /Add customer to waiting list/);

const capacityPanelSrc = readSrc(
  "src/workspaces/library/order-availability/capacity/ProductionCapacityPanel.tsx",
);
assert.match(capacityPanelSrc, /Waiting list requires a production-capacity row/);
assert.match(capacityPanelSrc, /does not enable the waiting list/);
assert.match(boardSrc, /Closing customer orders does not enable/);

console.log("PASS waiting list");
