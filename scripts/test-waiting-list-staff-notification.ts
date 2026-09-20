/**
 * Waiting List staff notification for customer Join Waiting List.
 * Run: npx tsx scripts/test-waiting-list-staff-notification.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyWaitingListRequestInsert,
  staffNotificationEventKey,
} from "@/foundation/staff/notification-event-identity";
import { STAFF_NOTIFICATION_DEFINITIONS } from "@/foundation/staff/notification-preferences";
import {
  buildStaffNotificationToast,
  buildWaitingListNewRequestNotification,
} from "@/foundation/staff/staff-notification-engine";
import {
  isCustomerWaitingListNotificationSource,
  parseWaitingListNotificationPayload,
  waitingListHomePreviewLine,
  waitingListNewRequestEventKey,
  waitingListNotificationDescription,
  waitingListNotificationHref,
} from "@/engines/waiting-list/staff-notification";
import {
  WAITING_LIST_FILTER_ACTION,
  WAITING_LIST_SECTION_ID,
} from "@/workspaces/waiting-list/filter";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const cakeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sizeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const itemId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

assert.equal(
  waitingListNewRequestEventKey(requestId),
  `waiting_list_new_request:${requestId}`,
);
assert.equal(
  waitingListNewRequestEventKey(requestId),
  staffNotificationEventKey("waiting_list_new_request", requestId),
);
assert.equal(isCustomerWaitingListNotificationSource({ createdByStaffId: null }), true);
assert.equal(isCustomerWaitingListNotificationSource({}), true);
assert.equal(
  isCustomerWaitingListNotificationSource({ createdByStaffId: "staff-1" }),
  false,
);

const customerEvents = classifyWaitingListRequestInsert({
  id: requestId,
  createdByStaffId: null,
});
assert.equal(customerEvents.length, 1);
assert.equal(customerEvents[0]?.eventKey, waitingListNewRequestEventKey(requestId));

const staffEvents = classifyWaitingListRequestInsert({
  id: requestId,
  createdByStaffId: "staff-1",
});
assert.equal(staffEvents.length, 0);

const href = waitingListNotificationHref({
  pickupDate: "2026-09-25",
  cakeId,
  sizeId,
});
assert.equal(
  href,
  `/bakery/availability?date=2026-09-25&wlCake=${cakeId}&wlSize=${sizeId}#${WAITING_LIST_SECTION_ID}`,
);
assert.match(href, /#waiting-list-heading$/);
assert.doesNotMatch(href, /wlStatus=/);

const description = waitingListNotificationDescription({
  guestName: "ycwee",
  cakeName: "Chocolate D'Amour",
  sizeLabel: '6"',
  pickupDate: "2026-09-25",
  quantity: 2,
});
assert.equal(description, `ycwee · Chocolate D'Amour · 6" · 25 Sep · Qty 2`);

const payload = parseWaitingListNotificationPayload({
  requestId,
  itemId,
  guestName: "ycwee",
  guestPhone: "60123456789",
  cakeId,
  cakeName: "Chocolate D'Amour",
  sizeId,
  sizeLabel: '6"',
  pickupDate: "2026-09-25",
  quantity: 2,
  itemCount: 1,
});
assert.ok(payload);
assert.equal(payload.requestId, requestId);
assert.equal(payload.itemId, itemId);
assert.equal(payload.cakeName, "Chocolate D'Amour");
assert.equal(payload.sizeLabel, '6"');
assert.equal(payload.pickupDate, "2026-09-25");
assert.equal(payload.quantity, 2);
assert.equal(payload.guestName, "ycwee");
assert.equal(
  waitingListHomePreviewLine(payload),
  `Chocolate D'Amour · 6" · 25 Sep · Qty 2`,
);

const toast = buildStaffNotificationToast(
  buildWaitingListNewRequestNotification({
    eventId: "evt-1",
    href,
    description,
  }),
  "transient",
);
assert.equal(toast.title, "New waiting list request");
assert.equal(toast.description, description);
assert.equal(toast.actionHref, href);
assert.equal(toast.actionLabel, "View");

assert.ok(
  STAFF_NOTIFICATION_DEFINITIONS.some(
    (definition) => definition.code === "waiting_list_new_request",
  ),
);

const sql = readSrc(
  "supabase/migrations/20260920120000_staff_notification_waiting_list_new_request.sql",
);
assert.match(sql, /staff_notification_emit_waiting_list_new_request/);
assert.match(sql, /waiting_list_new_request:' \|\| v_request.id/);
assert.match(sql, /if v_request.created_by_staff_id is not null/);
assert.match(sql, /on public.waiting_list_requests/);
assert.match(sql, /deferrable initially deferred/);
assert.match(sql, /'requestId'/);
assert.match(sql, /'itemId'/);
assert.match(sql, /'cakeName'/);
assert.match(sql, /'sizeLabel'/);
assert.match(sql, /'pickupDate'/);
assert.match(sql, /'quantity'/);
assert.match(sql, /'guestName'/);
assert.doesNotMatch(sql, /create_staff_waiting_list_request/);
assert.doesNotMatch(sql, /manually_added/);

const guestAction = readSrc("src/workspaces/storefront/waiting-list/actions.ts");
assert.match(guestAction, /submit_guest_waiting_list_request/);
assert.doesNotMatch(guestAction, /emit_staff_notification_event/);

const staffAction = readSrc("src/workspaces/waiting-list/actions.ts");
assert.match(staffAction, /create_staff_waiting_list_request/);
assert.doesNotMatch(staffAction, /waiting_list_new_request/);

const listenerSrc = readSrc("src/components/shell/StaffNotificationListener.tsx");
assert.match(listenerSrc, /waiting_list_new_request/);
assert.match(listenerSrc, /View/);

const engineSql = readSrc(
  "supabase/migrations/20260903120000_waiting_list_engine.sql",
);
assert.match(engineSql, /Waiting list is not available for that cake and date/);
assert.match(engineSql, /Waiting list is not enabled for that cake and date/);
assert.match(engineSql, /Waiting list is not enabled for this collection/);
assert.doesNotMatch(
  sql,
  /_waiting_list_matching_capacity/,
);

const boardSrc = readSrc("src/workspaces/waiting-list/WaitingListBoard.tsx");
assert.match(boardSrc, /WAITING_LIST_FILTER_ACTION/);
assert.equal(
  WAITING_LIST_FILTER_ACTION,
  "/bakery/availability#waiting-list-heading",
);

const homeSrc = readSrc("src/workspaces/home/HomeCockpit.tsx");
assert.match(homeSrc, /Waiting List/);
assert.match(homeSrc, /new customer request/);
assert.match(homeSrc, /View Waiting List/);
assert.match(homeSrc, /waitingListAttention/);

const pageSrc = readSrc("src/app/(app)/home/page.tsx");
assert.match(pageSrc, /listHomeWaitingListAttention/);
assert.match(pageSrc, /canViewWaitingList/);

const querySrc = readSrc("src/workspaces/waiting-list/queries.ts");
assert.match(querySrc, /waiting_list_new_request/);
assert.match(querySrc, /toBusinessDateKey/);

console.log("PASS waiting list staff notification");
