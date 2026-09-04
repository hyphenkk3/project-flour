/**
 * Staff notification reliability — classification, preferences, email, sources.
 * Run: npx tsx scripts/test-staff-notifications.ts
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  STAFF_NOTIFICATION_DEFINITIONS,
  STAFF_NOTIFICATION_DEFAULT_ENABLED,
} from "../src/foundation/staff/notification-preferences";
import {
  STAFF_NOTIFICATION_AUTHORITATIVE_SOURCES,
  classifyApprovalInsert,
  classifyOrderInsert,
  classifyOrderUpdate,
  classifyTimelineInsert,
  isNewOrderNotificationSource,
  notificationChannelsForPreference,
  resolveStaffNotificationPreference,
  selectStaffEmailRecipients,
  staffNotificationEventKey,
} from "../src/foundation/staff/notification-event-identity";
import {
  deliverStaffNotificationEmailsToRecipients,
  deliverPendingStaffNotificationEmails,
} from "../src/foundation/staff/staff-notification-dispatch";
import { authorizeStaffNotificationDispatch } from "../src/foundation/staff/staff-notification-dispatch-auth";
import {
  STAFF_NOTIFICATION_EMAIL_MAX_ATTEMPTS,
  STAFF_NOTIFICATION_EMAIL_SWEEP_LIMIT,
  eventHasPendingStaffNotificationEmail,
  isStaffNotificationEmailDeliveryClaimable,
  selectPendingStaffNotificationEventIds,
  staffNotificationEmailNextAttemptAt,
  staffNotificationEmailRetryDelayMs,
  tryClaimStaffNotificationEmailDelivery,
} from "../src/foundation/staff/staff-notification-dispatch-queue";
import { isNewOrderNotificationEligible } from "../src/workspaces/owner/orders/new-order-notifications";
import type { StorefrontOrderListItem } from "../src/types/storefront";

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function sampleOrder(
  overrides: Partial<StorefrontOrderListItem> = {},
): StorefrontOrderListItem {
  return {
    id: "order-1",
    orderNumber: "WB-100",
    customerName: "Guest",
    phone: "91234567",
    cakeName: "Mangolicious",
    sizeLabel: "6",
    additionalItemCount: 0,
    pickupDate: "2026-09-18",
    pickupTime: "14:00",
    status: "submitted",
    createdAt: "2026-08-20T00:00:00.000Z",
    confirmationNeedsResend: false,
    orderSource: "customer_website",
    crewOrder: false,
    extraStockId: null,
    fulfilmentMethod: "pickup",
    productionStartedAt: null,
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    paymentDeadlineAt: null,
    hasPendingFeeRequest: false,
    ...overrides,
  };
}

const codes = STAFF_NOTIFICATION_DEFINITIONS.map((item) => item.code);
assert.deepEqual(codes, [
  "new_order",
  "order_paid",
  "order_confirmed",
  "order_cancelled",
  "order_edited",
  "approval_required",
  "last_minute",
]);

assert.equal(
  STAFF_NOTIFICATION_AUTHORITATIVE_SOURCES.new_order,
  "orders.insert",
);
assert.equal(
  STAFF_NOTIFICATION_AUTHORITATIVE_SOURCES.order_paid,
  "orders.update.paid",
);
assert.equal(
  STAFF_NOTIFICATION_AUTHORITATIVE_SOURCES.order_confirmed,
  "order_timeline_events.insert.customer_confirmed",
);
assert.equal(
  STAFF_NOTIFICATION_AUTHORITATIVE_SOURCES.order_cancelled,
  "orders.update.cancelled",
);
assert.equal(
  STAFF_NOTIFICATION_AUTHORITATIVE_SOURCES.order_edited,
  "order_timeline_events.insert.order_updated",
);
assert.equal(
  STAFF_NOTIFICATION_AUTHORITATIVE_SOURCES.approval_required,
  "operations_approval_requests.insert.pending",
);
assert.equal(
  STAFF_NOTIFICATION_AUTHORITATIVE_SOURCES.last_minute,
  "orders.order_source.last_minute",
);

const sql = read(
  "supabase/migrations/20260903160000_staff_notification_reliability.sql",
);
assert.match(sql, /unique \(event_key\)/);
assert.match(sql, /staff_notification_on_orders/);
assert.match(sql, /staff_notification_on_timeline/);
assert.match(sql, /staff_notification_on_approvals/);
assert.match(sql, /Waiting-list tables are intentionally not sources/);
assert.doesNotMatch(sql, /from public\.waiting_list/);
assert.match(sql, /staff_notification_request_dispatch/);
assert.match(sql, /net\.http_post/);
assert.match(sql, /exception/);

const order = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "submitted",
  paymentStatus: "unpaid",
  extraStockId: null as string | null,
  orderSource: "customer_website",
};

const newOrderEvents = classifyOrderInsert(order);
assert.equal(newOrderEvents.length, 1);
assert.equal(newOrderEvents[0]?.code, "new_order");
assert.equal(
  newOrderEvents[0]?.eventKey,
  staffNotificationEventKey("new_order", order.id),
);

const secondInsert = classifyOrderInsert(order);
assert.equal(secondInsert[0]?.eventKey, newOrderEvents[0]?.eventKey);

const freshPicks = classifyOrderInsert({
  ...order,
  extraStockId: "extra-1",
});
assert.equal(freshPicks.length, 0);
assert.equal(
  isNewOrderNotificationSource({
    status: "submitted",
    extraStockId: "extra-1",
  }),
  false,
);
assert.equal(
  isNewOrderNotificationEligible(sampleOrder({ extraStockId: "extra-1" })),
  false,
);

assert.equal(
  classifyOrderInsert({
    ...order,
    status: "awaiting_payment",
  }).length,
  0,
);

const conversionOrder = classifyOrderInsert({
  ...order,
  id: "converted-order",
});
assert.equal(conversionOrder.length, 1);
assert.equal(conversionOrder[0]?.code, "new_order");

assert.equal(
  classifyTimelineInsert({
    id: "wl-event",
    orderId: "converted-order",
    eventType: "waiting_list_converted",
  }).length,
  0,
);

const paidOnce = classifyOrderUpdate(
  { ...order, status: "awaiting_payment", paymentStatus: "unpaid" },
  { ...order, status: "paid", paymentStatus: "paid" },
);
assert.equal(paidOnce.length, 1);
assert.equal(paidOnce[0]?.code, "order_paid");
assert.equal(paidOnce[0]?.eventKey, `order_paid:${order.id}`);

const paidStatusOnly = classifyOrderUpdate(
  { ...order, status: "awaiting_payment", paymentStatus: "unpaid" },
  { ...order, status: "paid", paymentStatus: "unpaid" },
);
const paidPaymentOnly = classifyOrderUpdate(
  { ...order, status: "paid", paymentStatus: "unpaid" },
  { ...order, status: "paid", paymentStatus: "paid" },
);
assert.equal(paidStatusOnly[0]?.eventKey, paidOnce[0]?.eventKey);
assert.equal(paidPaymentOnly.length, 0);

assert.equal(
  classifyTimelineInsert({
    id: "pay-tl",
    orderId: order.id,
    eventType: "payment_secured",
  }).length,
  0,
);
assert.equal(
  classifyTimelineInsert({
    id: "pay-rec",
    orderId: order.id,
    eventType: "payment_recorded",
  }).length,
  0,
);

const confirmed = classifyTimelineInsert({
  id: "confirm-tl",
  orderId: order.id,
  eventType: "customer_confirmed",
});
assert.equal(confirmed.length, 1);
assert.equal(confirmed[0]?.code, "order_confirmed");
assert.equal(confirmed[0]?.eventKey, `order_confirmed:${order.id}`);

const confirmedAgain = classifyTimelineInsert({
  id: "confirm-tl-2",
  orderId: order.id,
  eventType: "customer_confirmed",
});
assert.equal(confirmedAgain[0]?.eventKey, confirmed[0]?.eventKey);

const cancelled = classifyOrderUpdate(
  { ...order, status: "awaiting_payment" },
  { ...order, status: "cancelled" },
);
assert.equal(cancelled.length, 1);
assert.equal(cancelled[0]?.code, "order_cancelled");
assert.equal(
  classifyTimelineInsert({
    id: "cancel-tl",
    orderId: order.id,
    eventType: "order_cancelled",
  }).length,
  0,
);

const laterCancelledUpdate = classifyOrderUpdate(
  { ...order, status: "cancelled", paymentStatus: "unpaid" },
  {
    ...order,
    status: "cancelled",
    paymentStatus: "unpaid",
    orderSource: "walk_in",
  },
);
assert.equal(laterCancelledUpdate.length, 0);
assert.equal(
  classifyTimelineInsert(
    { id: "edit-after-cancel", orderId: order.id, eventType: "order_updated" },
    "cancelled",
  ).length,
  0,
);
assert.equal(
  classifyTimelineInsert(
    {
      id: "confirm-after-cancel",
      orderId: order.id,
      eventType: "customer_confirmed",
    },
    "cancelled",
  ).length,
  0,
);

const edited = classifyTimelineInsert({
  id: "edit-1",
  orderId: order.id,
  eventType: "order_updated",
});
assert.equal(edited.length, 1);
assert.equal(edited[0]?.code, "order_edited");
assert.equal(edited[0]?.eventKey, "order_edited:edit-1");
assert.notEqual(
  classifyTimelineInsert({
    id: "edit-2",
    orderId: order.id,
    eventType: "order_updated",
  })[0]?.eventKey,
  edited[0]?.eventKey,
);

assert.equal(
  classifyOrderUpdate(
    { ...order, status: "submitted" },
    { ...order, status: "submitted", paymentStatus: "unpaid" },
  ).length,
  0,
);

const approval = classifyApprovalInsert({
  id: "apr-1",
  orderId: order.id,
  status: "pending",
});
assert.equal(approval.length, 1);
assert.equal(approval[0]?.code, "approval_required");
assert.equal(approval[0]?.eventKey, "approval_required:apr-1");
assert.equal(
  classifyApprovalInsert({
    id: "apr-1",
    orderId: order.id,
    status: "approved",
  }).length,
  0,
);

const lastMinuteInsert = classifyOrderInsert({
  ...order,
  orderSource: "last_minute",
});
assert.equal(lastMinuteInsert.length, 2);
assert.deepEqual(lastMinuteInsert.map((item) => item.code).sort(), [
  "last_minute",
  "new_order",
]);

const lastMinuteUpdate = classifyOrderUpdate(
  { ...order, orderSource: "walk_in" },
  { ...order, orderSource: "last_minute" },
);
assert.equal(lastMinuteUpdate.length, 1);
assert.equal(lastMinuteUpdate[0]?.code, "last_minute");
assert.equal(lastMinuteUpdate[0]?.eventKey, `last_minute:${order.id}`);
assert.equal(
  classifyOrderUpdate(
    { ...order, orderSource: "last_minute" },
    { ...order, orderSource: "last_minute", paymentStatus: "unpaid" },
  ).length,
  0,
);

assert.deepEqual(
  notificationChannelsForPreference({ webEnabled: false, emailEnabled: false }),
  { web: false, email: false },
);
assert.deepEqual(
  notificationChannelsForPreference({ webEnabled: true, emailEnabled: false }),
  { web: true, email: false },
);
assert.deepEqual(
  notificationChannelsForPreference({ webEnabled: false, emailEnabled: true }),
  { web: false, email: true },
);
assert.deepEqual(
  notificationChannelsForPreference({ webEnabled: true, emailEnabled: true }),
  { web: true, email: true },
);

const managerA = resolveStaffNotificationPreference("new_order", {
  webEnabled: true,
  emailEnabled: true,
});
const managerB = resolveStaffNotificationPreference("new_order", {
  webEnabled: false,
  emailEnabled: true,
});
const customerOps = resolveStaffNotificationPreference("new_order", {
  webEnabled: true,
  emailEnabled: false,
});
assert.equal(managerA.webEnabled && managerA.emailEnabled, true);
assert.equal(managerB.webEnabled, false);
assert.equal(managerB.emailEnabled, true);
assert.equal(customerOps.webEnabled, true);
assert.equal(customerOps.emailEnabled, false);

const emailRecipients = selectStaffEmailRecipients({
  code: "new_order",
  staff: [
    { id: "a", email: "a@whitebird.test", isActive: true },
    { id: "b", email: "b@whitebird.test", isActive: true },
    { id: "c", email: "c@whitebird.test", isActive: true },
    { id: "d", email: "d@whitebird.test", isActive: false },
    { id: "e", email: null, isActive: true },
  ],
  preferencesByStaffId: new Map([
    ["a", { new_order: { emailEnabled: true } }],
    ["b", { new_order: { emailEnabled: true } }],
    ["c", { new_order: { emailEnabled: false } }],
  ]),
});
assert.deepEqual(emailRecipients.map((item) => item.staffId).sort(), [
  "a",
  "b",
]);

const defaultOn = selectStaffEmailRecipients({
  code: "order_paid",
  staff: [{ id: "z", email: "z@whitebird.test", isActive: true }],
  preferencesByStaffId: new Map(),
});
assert.equal(STAFF_NOTIFICATION_DEFAULT_ENABLED, true);
assert.equal(defaultOn.length, 1);

const now = new Date("2026-09-03T14:00:00.000Z");
const sentDelivery = {
  staffId: "a",
  status: "sent" as const,
  attemptCount: 1,
  nextAttemptAt: null,
  claimedUntil: null,
};
const undeliveredRecipient = { staffId: "b" };

assert.equal(
  eventHasPendingStaffNotificationEmail({
    recipients: [{ staffId: "a" }, { staffId: "b" }],
    deliveries: [
      sentDelivery,
      {
        staffId: "b",
        status: "sent",
        attemptCount: 1,
        nextAttemptAt: null,
        claimedUntil: null,
      },
    ],
    now,
  }),
  false,
);

assert.equal(
  eventHasPendingStaffNotificationEmail({
    recipients: [{ staffId: "a" }, undeliveredRecipient],
    deliveries: [sentDelivery],
    now,
  }),
  true,
);

const failedRetryable = {
  staffId: "a",
  status: "failed" as const,
  attemptCount: 1,
  nextAttemptAt: new Date("2026-09-03T13:59:00.000Z"),
  claimedUntil: null,
};
assert.equal(
  isStaffNotificationEmailDeliveryClaimable(failedRetryable, now),
  true,
);

assert.equal(
  isStaffNotificationEmailDeliveryClaimable(sentDelivery, now),
  false,
);
assert.equal(
  isStaffNotificationEmailDeliveryClaimable(
    {
      ...sentDelivery,
      nextAttemptAt: new Date("2026-09-03T13:00:00.000Z"),
    },
    now,
  ),
  false,
);

assert.equal(staffNotificationEmailRetryDelayMs(1), 60 * 1000);
assert.equal(staffNotificationEmailRetryDelayMs(2), 5 * 60 * 1000);
assert.equal(staffNotificationEmailRetryDelayMs(3), 15 * 60 * 1000);
assert.equal(staffNotificationEmailRetryDelayMs(4), 60 * 60 * 1000);
assert.equal(staffNotificationEmailRetryDelayMs(5), null);
assert.equal(
  staffNotificationEmailNextAttemptAt(1, now)?.toISOString(),
  "2026-09-03T14:01:00.000Z",
);
assert.equal(
  isStaffNotificationEmailDeliveryClaimable(
    {
      staffId: "a",
      status: "failed",
      attemptCount: 1,
      nextAttemptAt: new Date("2026-09-03T14:01:00.000Z"),
      claimedUntil: null,
    },
    now,
  ),
  false,
);

assert.equal(
  isStaffNotificationEmailDeliveryClaimable(
    {
      staffId: "a",
      status: "failed",
      attemptCount: STAFF_NOTIFICATION_EMAIL_MAX_ATTEMPTS,
      nextAttemptAt: new Date("2026-09-03T13:00:00.000Z"),
      claimedUntil: null,
    },
    now,
  ),
  false,
);
assert.equal(
  isStaffNotificationEmailDeliveryClaimable(
    {
      staffId: "a",
      status: "failed",
      attemptCount: STAFF_NOTIFICATION_EMAIL_MAX_ATTEMPTS - 1,
      nextAttemptAt: new Date("2026-09-03T13:00:00.000Z"),
      claimedUntil: null,
    },
    now,
  ),
  true,
);

assert.deepEqual(
  selectPendingStaffNotificationEventIds({
    events: [
      { id: "delivered", createdAt: new Date("2026-09-01T00:00:00.000Z") },
      { id: "pending-older", createdAt: new Date("2026-09-02T00:00:00.000Z") },
      { id: "pending-newer", createdAt: new Date("2026-09-03T00:00:00.000Z") },
    ],
    pendingByEventId: new Map([
      ["delivered", false],
      ["pending-older", true],
      ["pending-newer", true],
    ]),
    limit: STAFF_NOTIFICATION_EMAIL_SWEEP_LIMIT,
  }),
  ["pending-older", "pending-newer"],
);

const firstClaim = tryClaimStaffNotificationEmailDelivery({
  existing: null,
  now,
});
assert.equal(firstClaim.ok, true);
const secondClaim = tryClaimStaffNotificationEmailDelivery({
  existing: firstClaim.ok
    ? {
        staffId: "a",
        status: "claimed",
        attemptCount: 0,
        nextAttemptAt: null,
        claimedUntil: firstClaim.claimedUntil,
      }
    : null,
  now,
});
assert.equal(secondClaim.ok, false);
const expiredClaim = tryClaimStaffNotificationEmailDelivery({
  existing: firstClaim.ok
    ? {
        staffId: "a",
        status: "claimed",
        attemptCount: 0,
        nextAttemptAt: null,
        claimedUntil: firstClaim.claimedUntil,
      }
    : null,
  now: new Date(
    firstClaim.ok ? firstClaim.claimedUntil.getTime() + 1 : now.getTime(),
  ),
});
assert.equal(expiredClaim.ok, true);

async function testEmailDelivery() {
  const sent: string[] = [];
  const fakeMailer = {
    async send(input: { to: string; idempotencyKey: string }) {
      sent.push(`${input.to}:${input.idempotencyKey}`);
      return { id: "resend-1" };
    },
  };

  const bothOn = await deliverStaffNotificationEmailsToRecipients({
    eventId: "evt-1",
    eventKey: "new_order:order-1",
    content: {
      code: "new_order",
      title: "New order received",
      description: "Guest · Mangolicious",
    },
    recipients: emailRecipients,
    mailer: fakeMailer,
  });
  assert.equal(bothOn.sent, 2);
  assert.equal(bothOn.failed, 0);
  assert.equal(sent.length, 2);

  const duplicateSend = await deliverStaffNotificationEmailsToRecipients({
    eventId: "evt-1",
    eventKey: "new_order:order-1",
    content: {
      code: "new_order",
      title: "New order received",
      description: "Guest · Mangolicious",
    },
    recipients: emailRecipients,
    alreadyDeliveredStaffIds: new Set(
      emailRecipients.map((item) => item.staffId),
    ),
    mailer: fakeMailer,
  });
  assert.equal(duplicateSend.sent, 0);
  assert.equal(duplicateSend.skipped, 2);
  assert.equal(sent.length, 2);

  const failingMailer = {
    async send() {
      throw new Error("Resend unavailable");
    },
  };
  const paymentSucceeded = true;
  const failedEmail = await deliverStaffNotificationEmailsToRecipients({
    eventId: "evt-paid",
    eventKey: "order_paid:order-1",
    content: {
      code: "order_paid",
      title: "Order paid",
      description: "Guest · Mangolicious",
    },
    recipients: [{ staffId: "a", email: "a@whitebird.test" }],
    mailer: failingMailer,
  });
  assert.equal(paymentSucceeded, true);
  assert.equal(failedEmail.failed, 1);
  assert.equal(failedEmail.sent, 0);

  const memoryDeliveries = new Map<
    string,
    {
      staffId: string;
      status: "sent" | "failed" | "claimed";
      attemptCount: number;
      nextAttemptAt: Date | null;
      claimedUntil: Date | null;
    }
  >();
  const claimedEvent = {
    eventId: "evt-concurrent",
    eventKey: "new_order:order-concurrent",
    code: "new_order" as const,
    title: "New order received",
    description: "Guest · Mangolicious",
    href: "/owner/orders/order-concurrent",
    payload: {},
    orderId: null,
  };
  const concurrentRecipients = [
    { staffId: "a", email: "a@whitebird.test" },
    { staffId: "b", email: "b@whitebird.test" },
  ];

  const memoryClaimer = async () => {
    const claimNow = new Date();
    const claimed = [];
    for (const recipient of concurrentRecipients) {
      const existing = memoryDeliveries.get(recipient.staffId) ?? null;
      const claim = tryClaimStaffNotificationEmailDelivery({
        existing,
        now: claimNow,
      });
      if (!claim.ok) continue;
      memoryDeliveries.set(recipient.staffId, {
        staffId: recipient.staffId,
        status: "claimed",
        attemptCount: existing?.attemptCount ?? 0,
        nextAttemptAt: existing?.nextAttemptAt ?? null,
        claimedUntil: claim.claimedUntil,
      });
      claimed.push({
        deliveryId: `delivery-${recipient.staffId}`,
        eventId: claimedEvent.eventId,
        staffId: recipient.staffId,
        staffEmail: recipient.email,
        claimedUntil: claim.claimedUntil.toISOString(),
        eventKey: claimedEvent.eventKey,
        code: claimedEvent.code,
        title: claimedEvent.title,
        description: claimedEvent.description,
        href: claimedEvent.href,
        payload: claimedEvent.payload,
        orderId: claimedEvent.orderId,
      });
    }
    return claimed;
  };

  const memoryComplete = async (input: {
    staffId: string;
    status: "sent" | "failed";
    claimedUntil: string;
  }) => {
    const existing = memoryDeliveries.get(input.staffId);
    if (!existing || existing.status !== "claimed") return;
    if (existing.claimedUntil?.toISOString() !== input.claimedUntil) return;
    memoryDeliveries.set(input.staffId, {
      staffId: input.staffId,
      status: input.status,
      attemptCount: existing.attemptCount + 1,
      nextAttemptAt:
        input.status === "sent"
          ? null
          : staffNotificationEmailNextAttemptAt(
              existing.attemptCount + 1,
              new Date(),
            ),
      claimedUntil: null,
    });
  };

  const concurrentSent: string[] = [];
  const concurrentMailer = {
    async send(input: { to: string }) {
      concurrentSent.push(input.to);
      return { id: "resend-concurrent" };
    },
  };

  const firstDispatch = await deliverPendingStaffNotificationEmails({
    mailer: concurrentMailer,
    claimer: memoryClaimer,
    completeDelivery: async (input) => {
      await memoryComplete(input);
    },
  });
  const secondDispatch = await deliverPendingStaffNotificationEmails({
    mailer: concurrentMailer,
    claimer: memoryClaimer,
    completeDelivery: async (input) => {
      await memoryComplete(input);
    },
  });

  assert.equal(firstDispatch[0]?.sent, 2);
  assert.equal(secondDispatch.length, 0);
  assert.equal(concurrentSent.length, 2);
  assert.equal(
    [...memoryDeliveries.values()].every((row) => row.status === "sent"),
    true,
  );
  assert.equal(
    eventHasPendingStaffNotificationEmail({
      recipients: concurrentRecipients,
      deliveries: [...memoryDeliveries.values()],
      now: new Date(),
    }),
    false,
  );

  const unauthorized = authorizeStaffNotificationDispatch(
    new Request("http://localhost/api/staff/notifications/dispatch", {
      method: "POST",
    }),
  );
  assert.equal(unauthorized.ok, false);
  assert.ok(unauthorized.ok === false && unauthorized.status >= 401);

  const previous = process.env.STAFF_NOTIFICATION_DISPATCH_SECRET;
  process.env.STAFF_NOTIFICATION_DISPATCH_SECRET = "test-dispatch-secret";
  const stillUnauthorized = authorizeStaffNotificationDispatch(
    new Request("http://localhost/api/staff/notifications/dispatch", {
      method: "POST",
    }),
  );
  assert.equal(stillUnauthorized.ok, false);
  const authorized = authorizeStaffNotificationDispatch(
    new Request("http://localhost/api/staff/notifications/dispatch", {
      method: "POST",
      headers: { authorization: "Bearer test-dispatch-secret" },
    }),
  );
  assert.equal(authorized.ok, true);
  if (previous == null) {
    delete process.env.STAFF_NOTIFICATION_DISPATCH_SECRET;
  } else {
    process.env.STAFF_NOTIFICATION_DISPATCH_SECRET = previous;
  }

  const listenerSrc = read(
    "src/components/shell/StaffNotificationListener.tsx",
  );
  assert.match(listenerSrc, /staff_notification_events/);
  assert.doesNotMatch(listenerSrc, /\/api\/staff\/notifications\/email/);
  assert.doesNotMatch(listenerSrc, /localStorage/);
  assert.doesNotMatch(listenerSrc, /order_timeline_events/);
  assert.doesNotMatch(listenerSrc, /operations_approval_requests/);

  const dispatchSrc = read(
    "src/foundation/staff/staff-notification-dispatch.ts",
  );
  assert.match(dispatchSrc, /createServiceClient/);
  assert.match(dispatchSrc, /RESEND_API_KEY/);
  assert.doesNotMatch(dispatchSrc, /StaffNotificationListener/);
  assert.match(dispatchSrc, /idempotencyKey/);
  assert.match(dispatchSrc, /claim_staff_notification_email_deliveries/);
  assert.match(dispatchSrc, /complete_staff_notification_email_delivery/);
  assert.doesNotMatch(
    dispatchSrc,
    /\.from\("staff_notification_events"\)[\s\S]*\.order\("created_at"/,
  );

  const queueSql = read(
    "supabase/migrations/20260903220000_staff_notification_email_dispatch_queue.sql",
  );
  assert.match(queueSql, /for update skip locked/i);
  assert.match(queueSql, /on conflict \(event_id, staff_id\)/);
  assert.match(queueSql, /status is distinct from 'sent'/);
  assert.match(queueSql, /coalesce\(pref\.email_enabled, true\)/);
  assert.match(queueSql, /sp\.is_active = true/);
  assert.match(queueSql, /staff_notification_email_retry_delay/);
  assert.match(queueSql, /claimed_until is not distinct from p_claimed_until/);
  assert.doesNotMatch(queueSql, /create extension/i);
  assert.doesNotMatch(queueSql, /net\.http_post/);

  const emailRouteSrc = read("src/app/api/staff/notifications/email/route.ts");
  assert.match(emailRouteSrc, /403/);
  assert.doesNotMatch(emailRouteSrc, /RESEND_API_KEY/);
  assert.doesNotMatch(emailRouteSrc, /from "resend"/);

  const dispatchRouteSrc = read(
    "src/app/api/staff/notifications/dispatch/route.ts",
  );
  assert.match(dispatchRouteSrc, /authorizeStaffNotificationDispatch/);
  assert.doesNotMatch(dispatchRouteSrc, /requireStaff/);

  const middlewareSrc = read("src/middleware.ts");
  assert.match(middlewareSrc, /isMachineDispatchPath/);
  assert.match(
    middlewareSrc,
    /pathname === "\/api\/staff\/notifications\/dispatch"/,
  );
  assert.doesNotMatch(
    middlewareSrc.split("function isPublicPath")[1]?.split("function ")[0] ?? "",
    /\/api\/staff\/notifications\/dispatch/,
  );

  const engineSrc = read("src/foundation/staff/staff-notification-engine.ts");
  assert.doesNotMatch(engineSrc, /localStorage/);
  assert.match(engineSrc, /BroadcastChannel/);

  const operationsSrc = read("src/workspaces/owner/OperationsLiveBoard.tsx");
  assert.doesNotMatch(operationsSrc, /toast\(/);
  assert.doesNotMatch(operationsSrc, /tryClaimNewOrderNotification/);
  assert.doesNotMatch(operationsSrc, /NEW_ORDER_NOTIFIED_IDS_KEY/);
  assert.doesNotMatch(operationsSrc, /Guest Preorder/);
  assert.doesNotMatch(operationsSrc, /localStorage/);

  const homeCockpitSrc = read("src/workspaces/home/HomeCockpit.tsx");
  assert.doesNotMatch(homeCockpitSrc, /notificationPreference/);
  assert.doesNotMatch(homeCockpitSrc, /HomeGuestPreorderNotificationListener/);
  assert.equal(
    existsSync(
      resolve("src/workspaces/home/HomeGuestPreorderNotificationListener.tsx"),
    ),
    false,
  );

  const userMenuSrc = read("src/components/shell/UserMenu.tsx");
  assert.doesNotMatch(userMenuSrc, /Guest Preorder/);
  assert.doesNotMatch(userMenuSrc, /guest-preorder-notification/);
  assert.doesNotMatch(userMenuSrc, /localStorage/);

  const settingsSrc = read(
    "src/components/settings/NotificationPreferences.tsx",
  );
  assert.match(settingsSrc, /web_enabled/);
  assert.match(settingsSrc, /email_enabled/);
  assert.match(settingsSrc, /notification_code/);

  const settingsPageSrc = read("src/app/(app)/settings/page.tsx");
  assert.match(settingsPageSrc, /NotificationPreferences/);
  assert.match(settingsPageSrc, /getNotificationDefinitionsForRole/);

  assert.doesNotMatch(
    read("src/components/shell/AppShellFrame.tsx"),
    /staffEmail/,
  );

  const clientFiles = [
    "src/components/shell/StaffNotificationListener.tsx",
    "src/components/shell/AppShellFrame.tsx",
    "src/components/settings/NotificationPreferences.tsx",
    "src/workspaces/owner/OperationsLiveBoard.tsx",
  ];
  for (const file of clientFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /RESEND_API_KEY/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_RESEND/);
  }

  assert.match(read(".env.example"), /RESEND_API_KEY/);
  assert.doesNotMatch(read(".env.example"), /NEXT_PUBLIC_RESEND/);
  const vercelJson = read("vercel.json");
  assert.doesNotMatch(vercelJson, /"crons"/);
  assert.doesNotMatch(vercelJson, /\* \* \* \* \*/);
  assert.doesNotMatch(vercelJson, /\/api\/staff\/notifications\/dispatch/);

  const cronSql = read(
    "supabase/migrations/20260904120000_staff_notification_pg_cron_sweep.sql",
  );
  assert.match(cronSql, /create extension if not exists pg_cron/);
  assert.doesNotMatch(cronSql, /create extension if not exists pg_net/);
  assert.match(cronSql, /staff-notification-email-dispatch-sweep/);
  assert.match(cronSql, /\*\/15 \* \* \* \*/);
  assert.match(cronSql, /staff_notification_cron_sweep/);
  assert.match(cronSql, /net\.http_get/);
  assert.match(cronSql, /Authorization/);
  assert.match(cronSql, /Bearer /);
  assert.match(cronSql, /app\.settings\.staff_notification_dispatch_url/);
  assert.match(cronSql, /app\.settings\.staff_notification_dispatch_secret/);
  assert.match(cronSql, /staff_notification_pg_net_per_event/);
  assert.doesNotMatch(cronSql, /ALTER DATABASE/i);
  assert.doesNotMatch(cronSql, /STAFF_NOTIFICATION_DISPATCH_SECRET\s*=/);
  assert.doesNotMatch(cronSql, /https:\/\//);

  const vaultSql = read(
    "supabase/migrations/20260904190000_staff_notification_dispatch_vault.sql",
  );
  assert.match(vaultSql, /staff_notification_dispatch_config/);
  assert.match(vaultSql, /per_event_enabled boolean not null default false/);
  assert.match(vaultSql, /vault\.decrypted_secrets/);
  assert.match(vaultSql, /staff_notification_dispatch_secret/);
  assert.match(vaultSql, /net\.http_post/);
  assert.match(vaultSql, /net\.http_get/);
  assert.doesNotMatch(vaultSql, /create extension if not exists pg_net/);
  assert.doesNotMatch(vaultSql, /ALTER DATABASE/i);
  assert.doesNotMatch(vaultSql, /STAFF_NOTIFICATION_DISPATCH_SECRET\s*=/);
  assert.doesNotMatch(vaultSql, /https:\/\//);
  assert.doesNotMatch(vaultSql, /vault\.create_secret/);
  assert.match(vaultSql, /#variable_conflict use_column/);

  assert.match(
    read("src/workspaces/storefront/checkout/actions.ts"),
    /scheduleStaffNotificationDispatch/,
  );
  assert.match(
    read("src/workspaces/owner/orders/actions.ts"),
    /scheduleStaffNotificationDispatch/,
  );
  assert.match(
    read("src/foundation/staff/schedule-staff-notification-dispatch.ts"),
    /after/,
  );

  assert.doesNotMatch(
    read("src/workspaces/waiting-list/actions.ts").split(
      "export async function submitGuestWaitingListAction",
    )[0] ?? "",
    /new_order/,
  );

  const phase8Sql = read(
    "supabase/migrations/20260903140000_phase8_guest_order_cancel.sql",
  );
  assert.match(phase8Sql, /status = 'cancelled'/);
  assert.match(phase8Sql, /order_cancelled/);

  console.log("PASS staff notifications");
}

void testEmailDelivery().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
