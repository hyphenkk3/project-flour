import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

import {
  classifyApprovalInsert,
  classifyOrderInsert,
  classifyOrderUpdate,
  classifyTimelineInsert,
} from "@/foundation/staff/notification-event-identity";
import { STAFF_NOTIFICATION_DEFINITIONS } from "@/foundation/staff/notification-preferences";
import { buildStaffPushMessage } from "@/foundation/staff/staff-notification-push-protocol";
import { deliverClaimedStaffPushNotifications } from "@/foundation/staff/staff-notification-push-delivery-core";
import {
  isStaffNotificationVisibleToRecipient,
  resolveStaffNotificationTestScope,
  STAFF_NOTIFICATION_TEST_KIND,
  STAFF_NOTIFICATION_TEST_TITLE,
} from "@/foundation/staff/staff-notification-test-scope";
import { normalizeLiveNotificationEvent } from "@/foundation/staff/staff-notification-live-fallback";
import {
  buildStaffNotificationToast,
  notificationDurationMs,
} from "@/foundation/staff/staff-notification-engine";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const crew = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const eventId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const descriptionWithPrivateData = "Aisha · Avocado · ORD-20261123-0001";

const regular = classifyOrderInsert({
  id: orderId,
  status: "submitted",
  paymentStatus: "unpaid",
  extraStockId: null,
  orderSource: "customer_website",
});
assert.deepEqual(
  regular.map((candidate) => candidate.code),
  ["new_order"],
);

for (const fulfilmentMethod of ["pickup", "delivery", "dine_in"] as const) {
  const freshPick = classifyOrderInsert({
    id: orderId,
    status: "submitted",
    paymentStatus: "unpaid",
    extraStockId: "33333333-3333-4333-8333-333333333333",
    orderSource: "customer_website",
    fulfilmentMethod,
  });
  assert.deepEqual(
    freshPick.map((candidate) => candidate.code),
    ["last_minute"],
    `${fulfilmentMethod} Fresh Pick must only create Last Minute Order`,
  );
}

const paid = classifyOrderUpdate(
  {
    id: orderId,
    status: "submitted",
    paymentStatus: "unpaid",
    extraStockId: null,
    orderSource: "customer_website",
  },
  {
    id: orderId,
    status: "paid",
    paymentStatus: "paid",
    extraStockId: null,
    orderSource: "customer_website",
  },
);
assert.deepEqual(
  paid.map((candidate) => candidate.code),
  ["order_paid"],
);
assert.deepEqual(
  classifyTimelineInsert(
    { id: eventId, orderId, eventType: "customer_confirmed" },
    "submitted",
  ).map((candidate) => candidate.code),
  ["order_confirmed"],
);
assert.deepEqual(
  classifyTimelineInsert(
    { id: eventId, orderId, eventType: "order_updated" },
    "submitted",
  ).map((candidate) => candidate.code),
  ["order_edited"],
);
assert.deepEqual(
  classifyOrderUpdate(
    {
      id: orderId,
      status: "submitted",
      paymentStatus: "unpaid",
      extraStockId: null,
    },
    {
      id: orderId,
      status: "cancelled",
      paymentStatus: "unpaid",
      extraStockId: null,
    },
  ).map((candidate) => candidate.code),
  ["order_cancelled"],
);
assert.deepEqual(
  classifyApprovalInsert({ id: eventId, orderId, status: "pending" }).map(
    (candidate) => candidate.code,
  ),
  ["approval_required"],
);
assert.equal(STAFF_NOTIFICATION_DEFINITIONS.length >= 7, true);
assert.equal(
  new Set(STAFF_NOTIFICATION_DEFINITIONS.map((definition) => definition.code))
    .size,
  STAFF_NOTIFICATION_DEFINITIONS.length,
  "notification categories remain independently addressable",
);

const testPayload = {
  notificationTest: {
    kind: STAFF_NOTIFICATION_TEST_KIND,
    recipientStaffId: owner,
  },
};
assert.deepEqual(
  resolveStaffNotificationTestScope(STAFF_NOTIFICATION_TEST_TITLE, testPayload),
  { kind: "owner_only", recipientStaffId: owner },
);
assert.equal(
  isStaffNotificationVisibleToRecipient({
    title: STAFF_NOTIFICATION_TEST_TITLE,
    payload: testPayload,
    staffId: owner,
  }),
  true,
);
assert.equal(
  isStaffNotificationVisibleToRecipient({
    title: STAFF_NOTIFICATION_TEST_TITLE,
    payload: testPayload,
    staffId: crew,
  }),
  false,
);
assert.equal(
  resolveStaffNotificationTestScope(STAFF_NOTIFICATION_TEST_TITLE, null).kind,
  "invalid",
  "an unscoped test marker fails closed",
);
assert.equal(
  resolveStaffNotificationTestScope("New Order", testPayload).kind,
  "invalid",
  "test metadata without the unmistakable label fails closed",
);
assert.equal(
  isStaffNotificationVisibleToRecipient({
    title: "New Order",
    payload: null,
    staffId: crew,
  }),
  true,
  "normal events still use each recipient's category preferences",
);

const normalizedTest = normalizeLiveNotificationEvent({
  id: eventId,
  code: "new_order",
  title: STAFF_NOTIFICATION_TEST_TITLE,
  description: descriptionWithPrivateData,
  payload: testPayload,
});
assert.equal(normalizedTest?.title, STAFF_NOTIFICATION_TEST_TITLE);
assert.equal(
  normalizedTest?.description,
  "No order, payment, customer, reservation, or collection record was created.",
);
assert.equal(
  normalizeLiveNotificationEvent({
    id: eventId,
    code: "new_order",
    title: STAFF_NOTIFICATION_TEST_TITLE,
  }),
  null,
);

const pushCopy = buildStaffPushMessage({
  eventId,
  code: "order_confirmed",
  orderId,
  eventTitle: "Order Confirmed",
  eventDescription: descriptionWithPrivateData,
});
assert.equal(pushCopy.title, "Order Confirmed");
assert.equal(pushCopy.body, "An order was confirmed.");
assert.equal(JSON.stringify(pushCopy).includes("Aisha"), false);
assert.equal(JSON.stringify(pushCopy).includes("ORD-20261123"), false);
const testPushCopy = buildStaffPushMessage({
  eventId,
  code: "new_order",
  syntheticTest: true,
});
assert.equal(testPushCopy.title, STAFF_NOTIFICATION_TEST_TITLE);
assert.match(testPushCopy.body, /No order/);

assert.equal(notificationDurationMs("transient"), 4500);
assert.equal(notificationDurationMs("persistent"), null);
const transient = buildStaffNotificationToast(
  {
    id: eventId,
    code: "last_minute",
    title: "Last Minute Order",
    description: "A new Fresh Pick order needs attention.",
  },
  "transient",
);
const persistent = buildStaffNotificationToast(
  {
    id: eventId,
    code: "last_minute",
    title: "Last Minute Order",
    description: "A new Fresh Pick order needs attention.",
    href: "/owner/orders/" + orderId,
  },
  "persistent",
);
assert.equal(transient.title, "Last Minute Order");
assert.equal(transient.durationMs, 4500);
assert.equal(persistent.durationMs, null);
assert.equal(persistent.actionHref, "/owner/orders/" + orderId);

const sentTo: string[] = [];
const pushResult = await deliverClaimedStaffPushNotifications({
  claimed: [
    {
      deliveryId: eventId,
      eventId,
      staffId: owner,
      subscriptionId: eventId,
      claimedUntil: "2026-11-23T00:00:00Z",
      code: "new_order",
      orderId: null,
      syntheticTest: true,
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        expirationTime: null,
        keys: { p256dh: "x", auth: "y" },
      },
    },
    {
      deliveryId: crew,
      eventId,
      staffId: crew,
      subscriptionId: crew,
      claimedUntil: "2026-11-23T00:00:00Z",
      code: "new_order",
      orderId: null,
      syntheticTest: true,
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/test-crew",
        expirationTime: null,
        keys: { p256dh: "x", auth: "y" },
      },
    },
  ],
  sender: {
    async send(input) {
      sentTo.push(input.subscription.endpoint);
      const message = JSON.parse(input.payload) as { title: string };
      assert.equal(message.title, STAFF_NOTIFICATION_TEST_TITLE);
    },
  },
  complete: async () => true,
  beforeSend: async (delivery) =>
    delivery.staffId === owner ? "send" : "suppress_recipient",
});
assert.deepEqual(sentTo, ["https://fcm.googleapis.com/fcm/send/test"]);
assert.equal(pushResult.sent, 1);
assert.equal(pushResult.suppressed, 1);

const serviceWorker = readFileSync(resolve("public/sw.js"), "utf8");
const listeners = new Map<string, (event: unknown) => void>();
let shown: { title: string; options: Record<string, unknown> } | null = null;
const selfMock = {
  location: { origin: "https://preview.example.test" },
  registration: {
    showNotification(title: string, options: Record<string, unknown>) {
      shown = { title, options };
      return Promise.resolve();
    },
  },
  clients: {
    matchAll: async () => [],
    openWindow: async () => undefined,
  },
  addEventListener(name: string, listener: (event: unknown) => void) {
    listeners.set(name, listener);
  },
};
vm.runInNewContext(serviceWorker, { self: selfMock, URL, Promise, Object });
const pushListener = listeners.get("push");
assert.ok(pushListener);
let waitForPush: Promise<unknown> | null = null;
pushListener({
  data: {
    json: () => ({
      version: 2,
      eventId,
      code: "new_order",
      orderId: null,
      title: testPushCopy.title,
      body: testPushCopy.body,
      systemTest: true,
    }),
  },
  waitUntil(promise: Promise<unknown>) {
    waitForPush = promise;
  },
});
await waitForPush;
assert.equal(shown?.title, STAFF_NOTIFICATION_TEST_TITLE);
assert.equal((shown?.options as { body?: string }).body, testPushCopy.body);

const listenerSource = readFileSync(
  resolve("src/components/shell/StaffNotificationListener.tsx"),
  "utf8",
);
const toastSource = readFileSync(
  resolve("src/components/ui/Toast.tsx"),
  "utf8",
);
const mobileNavSource = readFileSync(
  resolve("src/components/shell/MobileNavigation.tsx"),
  "utf8",
);
assert.doesNotMatch(
  listenerSource,
  /Notifications older than the 15-minute recovery window were skipped\./,
);
assert.match(
  listenerSource,
  /olderEventsSkipped:\s*result\.olderEventsSkipped/,
);
assert.match(
  listenerSource,
  /bottom-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\]/,
);
assert.match(
  toastSource,
  /max-h-\[calc\(100dvh-6rem-env\(safe-area-inset-top\)-env\(safe-area-inset-bottom\)\)\]/,
);
assert.match(mobileNavSource, /safe-area-inset-bottom/);

const migration = readFileSync(
  resolve(
    "supabase/migrations/20261123000802_staff_notification_phase1_content_and_fresh_pick.sql",
  ),
  "utf8",
);
assert.match(
  migration,
  /v_order\.order_source is distinct from 'customer_website'/,
);
assert.match(migration, /v_order\.extra_stock_id is null/);
assert.match(migration, /select \* into v_order[\s\S]*?where o\.id = new\.id/);
assert.match(migration, /'last_minute:' \|\| v_order\.id::text/);
assert.match(migration, /'last_minute'/);
assert.match(migration, /on conflict \(event_key\) do nothing/);
assert.match(migration, /deferrable initially deferred/);
assert.match(migration, /when 'order_confirmed' then 'Order Confirmed'/);
assert.match(migration, /when 'order_paid' then 'Order Paid'/);
assert.match(migration, /when 'approval_required' then 'Approval Required'/);

console.log("STAFF_NOTIFICATION_PHASE1_STABILIZATION=PASS");
console.log("CATEGORIES=7; FRESHPICK_CLASSIFICATION=PASS; EVENT_DEDUP=PASS");
console.log("OWNER_ONLY_TEST_SCOPE=PASS; PUSH_LOCKSCREEN_PRIVACY=PASS");
console.log("RECOVERY_AND_MOBILE_NAV_CONTRACT=PASS");
