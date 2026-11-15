import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildStaffPushMessage,
  isStaffNotificationEventId,
  isTrustedStaffPushEndpoint,
  parseStaffPushEventScope,
  parseStaffPushSubscription,
} from "../src/foundation/staff/staff-notification-push-protocol.ts";
import {
  deliverClaimedStaffPushNotifications,
  type ClaimedStaffPushDelivery,
} from "../src/foundation/staff/staff-notification-push-delivery-core.ts";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const eventId = "8e5b25a5-f302-48ba-aa60-a6f2857b1d35";
const key = "A".repeat(87);
const auth = "B".repeat(22);
const subscription = {
  endpoint: `https://fcm.googleapis.com/fcm/send/${"x".repeat(80)}`,
  expirationTime: null,
  keys: { p256dh: key, auth },
};

assert.equal(isStaffNotificationEventId(eventId), true);
assert.equal(isStaffNotificationEventId(""), false);
assert.equal(isStaffNotificationEventId("not-a-uuid"), false);
assert.deepEqual(parseStaffPushEventScope(undefined), { kind: "batch" });
assert.deepEqual(parseStaffPushEventScope(null), { kind: "invalid" });
assert.deepEqual(parseStaffPushEventScope(""), { kind: "invalid" });
assert.deepEqual(parseStaffPushEventScope(eventId), { kind: "event", eventId });

assert.equal(isTrustedStaffPushEndpoint(subscription.endpoint), true);
assert.equal(
  isTrustedStaffPushEndpoint("http://fcm.googleapis.com/send/a"),
  false,
);
assert.equal(isTrustedStaffPushEndpoint("https://127.0.0.1/send/a"), false);
assert.equal(isTrustedStaffPushEndpoint("https://evil.example/send/a"), false);
assert.equal(
  isTrustedStaffPushEndpoint(
    `https://attacker.fcm.googleapis.com/send/${"x".repeat(80)}`,
  ),
  false,
);
assert.equal(
  isTrustedStaffPushEndpoint("https://user:pass@fcm.googleapis.com/send/a"),
  false,
);
assert.deepEqual(parseStaffPushSubscription(subscription), subscription);
assert.equal(
  parseStaffPushSubscription({
    ...subscription,
    keys: { p256dh: "bad", auth },
  }),
  null,
);

const message = buildStaffPushMessage({ eventId, code: "new_order" });
assert.equal(message.title, "New order received");
assert.equal(message.data.href, "/owner/orders");
assert.equal(message.renotify, false);
assert.doesNotMatch(
  JSON.stringify(message),
  /customer|cake|orderNumber|guestName/i,
);

const claimed: ClaimedStaffPushDelivery[] = [
  {
    deliveryId: "d1",
    eventId,
    staffId: "staff-a",
    subscriptionId: "sub-a",
    claimedUntil: "2026-11-09T12:00:00Z",
    code: "new_order",
    subscription,
  },
];

async function main() {
  const sent: Array<{ payload: string; urgency: string }> = [];
  const completed: Array<{ status: string; revoke: boolean }> = [];
  const delivered = await deliverClaimedStaffPushNotifications({
    claimed,
    sender: {
      async send(input) {
        sent.push({ payload: input.payload, urgency: input.urgency });
      },
    },
    async complete(input) {
      completed.push({
        status: input.status,
        revoke: Boolean(input.revokeSubscription),
      });
      return true;
    },
  });
  assert.deepEqual(delivered, {
    sent: 1,
    failed: 0,
    revoked: 0,
    suppressed: 0,
    completionUnrecorded: 0,
  });
  assert.deepEqual(JSON.parse(sent[0].payload), {
    version: 1,
    eventId,
    code: "new_order",
  });
  assert.equal(sent[0].urgency, "normal");
  assert.doesNotMatch(sent[0].payload, /endpoint|p256dh|auth|customer|cake/i);
  assert.deepEqual(completed, [{ status: "sent", revoke: false }]);

  let revoked = false;
  const expired = await deliverClaimedStaffPushNotifications({
    claimed,
    sender: {
      async send() {
        throw Object.assign(new Error("expired"), { statusCode: 410 });
      },
    },
    async complete(input) {
      revoked = Boolean(input.revokeSubscription);
      return true;
    },
  });
  assert.deepEqual(expired, {
    sent: 0,
    failed: 1,
    revoked: 1,
    suppressed: 0,
    completionUnrecorded: 0,
  });
  assert.equal(revoked, true);

  const transient = await deliverClaimedStaffPushNotifications({
    claimed,
    sender: {
      async send() {
        throw new Error("network");
      },
    },
    async complete(input) {
      assert.equal(input.errorCode, "transport_error");
      assert.equal(input.revokeSubscription, false);
      return true;
    },
  });
  assert.deepEqual(transient, {
    sent: 0,
    failed: 1,
    revoked: 0,
    suppressed: 0,
    completionUnrecorded: 0,
  });

  const unrecorded = await deliverClaimedStaffPushNotifications({
    claimed,
    sender: { async send() {} },
    async complete() {
      return false;
    },
  });
  assert.deepEqual(unrecorded, {
    sent: 1,
    failed: 0,
    revoked: 0,
    suppressed: 0,
    completionUnrecorded: 1,
  });

  const freshPickClaimed = [
    { ...claimed[0], code: "fresh_pick_walk_in_hold_reminder" as const },
  ];
  let staleProviderCalled = false;
  let staleCompletion: { status: string; errorCode?: string } | null = null;
  const stale = await deliverClaimedStaffPushNotifications({
    claimed: freshPickClaimed,
    async beforeSend() {
      return "suppress";
    },
    sender: {
      async send() {
        staleProviderCalled = true;
      },
    },
    async complete(input) {
      staleCompletion = { status: input.status, errorCode: input.errorCode };
      return true;
    },
  });
  assert.deepEqual(stale, {
    sent: 0,
    failed: 0,
    revoked: 0,
    suppressed: 1,
    completionUnrecorded: 0,
  });
  assert.equal(staleProviderCalled, false);
  assert.deepEqual(staleCompletion, {
    status: "suppressed",
    errorCode: "stale_hold",
  });

  let preflightProviderCalled = false;
  let retryCompletion: { status: string; errorCode?: string } | null = null;
  const retryPreflight = await deliverClaimedStaffPushNotifications({
    claimed: freshPickClaimed,
    async beforeSend() {
      return "retry";
    },
    sender: {
      async send() {
        preflightProviderCalled = true;
      },
    },
    async complete(input) {
      retryCompletion = { status: input.status, errorCode: input.errorCode };
      return true;
    },
  });
  assert.deepEqual(retryPreflight, {
    sent: 0,
    failed: 1,
    revoked: 0,
    suppressed: 0,
    completionUnrecorded: 0,
  });
  assert.equal(preflightProviderCalled, false);
  assert.deepEqual(retryCompletion, {
    status: "failed",
    errorCode: "hold_preflight_failed",
  });

  const migration = read(
    "supabase/migrations/20261109193000_staff_notification_push.sql",
  );
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "3b4ac6f19706bf9356500abfddf478cc14b09e25275162448a5b474d30904339",
  );
  assert.match(migration, /unique \(event_id, subscription_id\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(
    migration,
    /grant all on table public\.staff_notification_push_subscriptions to service_role/i,
  );
  assert.match(migration, /e\.created_at >= pref\.push_enabled_at/);
  assert.match(migration, /e\.created_at >= sub\.created_at/);
  assert.match(migration, /interval '1 minute'/i);
  assert.match(migration, /interval '5 minutes'/i);
  assert.match(migration, /interval '15 minutes'/i);
  assert.match(migration, /interval '1 hour'/i);

  const scopedMigration = read(
    "supabase/migrations/20261114120000_staff_notification_push_dispatch_scope.sql",
  );
  assert.match(
    scopedMigration,
    /if p_event_id is null\s+then\s+raise exception 'event_id_required'/i,
  );
  assert.match(scopedMigration, /where e\.id = p_event_id/i);
  assert.match(scopedMigration, /where d\.event_id = p_event_id/i);
  assert.doesNotMatch(scopedMigration, /p_event_id is null\s+or/i);
  assert.match(scopedMigration, /list_staff_notification_push_batch_event_ids/);
  assert.match(
    scopedMigration,
    /staff_notification_fresh_pick_hold_reminder_is_current\(e\.payload\)/,
  );
  assert.match(scopedMigration, /and d\.event_id = p_event_id/);
  assert.match(
    scopedMigration,
    /p_status = 'suppressed' and p_error_code is distinct from 'stale_hold'/i,
  );
  assert.match(scopedMigration, /d\.attempt_count \+ 1/);
  assert.match(scopedMigration, /d\.attempt_count >= 5/);
  assert.match(scopedMigration, /skip locked/i);
  assert.match(
    scopedMigration,
    /revoke all on function public\.list_staff_notification_push_batch_event_ids\(integer\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    scopedMigration,
    /grant execute on function public\.list_staff_notification_push_batch_event_ids\(integer\)\s+to service_role/i,
  );

  const dispatcher = read(
    "src/foundation/staff/staff-notification-push-dispatch.ts",
  );
  assert.match(dispatcher, /input: \{\s*eventId: string/);
  assert.match(dispatcher, /A valid event ID is required for Push dispatch/);
  assert.match(dispatcher, /p_event_id: eventId/);
  assert.doesNotMatch(dispatcher, /input\?\.eventId \?\? null/);
  assert.match(dispatcher, /PUSH_DELIVERY_LIMIT = 10/);
  assert.match(dispatcher, /PUSH_BATCH_EVENT_LIMIT = 10/);
  assert.match(dispatcher, /list_staff_notification_push_batch_event_ids/);
  assert.match(dispatcher, /validateFreshPickReminderBeforeSend/);
  assert.match(
    dispatcher,
    /staff_notification_fresh_pick_hold_reminder_is_current/,
  );

  const handoffFixture = read(
    "scripts/fixtures/20261111110823_staff_notification_fresh_pick_push_handoff.sql",
  );
  assert.equal(
    createHash("sha256").update(handoffFixture).digest("hex"),
    "7f21442519475cf9ea6736fc7b3c2839495a6df7bad86ef420e4e60006cc4a57",
  );

  const eventRoute = read("src/app/api/staff/notifications/dispatch/route.ts");
  assert.match(eventRoute, /authorizeStaffNotificationDispatch\(request\)/);
  assert.match(eventRoute, /parseStaffPushEventScope/);
  assert.match(
    eventRoute,
    /if \(scope\.kind === "event"\)[\s\S]*?deliverPendingStaffPushNotifications\(\{ eventId \}\)/,
  );
  assert.doesNotMatch(
    eventRoute,
    /deliverPendingStaffPushNotifications\(\{\s*eventId\s*\}\)[\s\S]*?scope\.kind/,
  );
  assert.match(eventRoute, /scope\.kind === "invalid"[\s\S]*?status: 400/);

  const retryRoute = read(
    "src/app/api/staff/notifications/push-retry/route.ts",
  );
  assert.match(retryRoute, /authorizeStaffPushNotificationDispatch\(request\)/);
  assert.match(retryRoute, /retryPendingStaffPushNotifications\(\)/);
  assert.doesNotMatch(retryRoute, /export async function GET/);

  const schedule = read(
    "src/foundation/staff/schedule-staff-notification-dispatch.ts",
  );
  assert.doesNotMatch(schedule, /deliverPendingStaffPushNotifications/);
  const profileTrigger = migration;
  assert.match(profileTrigger, /staff_notification_revoke_inactive_push/);

  const worker = read("public/sw.js");
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /renotify: false/);
  assert.doesNotMatch(worker, /addEventListener\("fetch"/);

  const pushActions = read(
    "src/foundation/staff/staff-notification-push-actions.ts",
  );
  assert.match(pushActions, /requireStaff\(\)/);
  assert.match(pushActions, /parseStaffPushSubscription/);
  assert.match(pushActions, /staffId: staff\.id/);

  const preferences = read("src/foundation/staff/notification-preferences.ts");
  assert.match(preferences, /STAFF_NOTIFICATION_DEFAULT_PUSH_ENABLED = false/);
  assert.match(preferences, /pushEnabled: boolean/);
  const settings = read("src/components/settings/NotificationPreferences.tsx");
  assert.match(settings, /registerStaffPushSubscriptionAction/);
  assert.match(settings, /revokeStaffPushSubscriptionAction/);
  assert.match(
    settings,
    /formData\.set\("push_enabled", String\(next\.pushEnabled\)\)/,
  );
  assert.match(settings, /Push setup needed/);

  console.log(
    "Staff Push event scope, bounded retry, delivery idempotency, subscription security and service worker contracts: PASS",
  );
}

void main();
