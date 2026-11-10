import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildStaffPushMessage,
  isTrustedStaffPushEndpoint,
  parseStaffPushSubscription,
} from "../src/foundation/staff/staff-notification-push-protocol";
import {
  deliverClaimedStaffPushNotifications,
  type ClaimedStaffPushDelivery,
} from "../src/foundation/staff/staff-notification-push-delivery-core";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const key = "A".repeat(87);
const auth = "B".repeat(22);
const subscription = {
  endpoint: `https://fcm.googleapis.com/fcm/send/${"x".repeat(80)}`,
  expirationTime: null,
  keys: { p256dh: key, auth },
};

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

const message = buildStaffPushMessage({
  eventId: "8e5b25a5-f302-48ba-aa60-a6f2857b1d35",
  code: "new_order",
});
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
    eventId: "event-a",
    staffId: "staff-a",
    subscriptionId: "sub-a",
    claimedUntil: "2026-11-09T12:00:00Z",
    code: "new_order",
    subscription,
  },
  {
    deliveryId: "d2",
    eventId: "event-a",
    staffId: "staff-a",
    subscriptionId: "sub-b",
    claimedUntil: "2026-11-09T12:00:00Z",
    code: "new_order",
    subscription: {
      ...subscription,
      endpoint: `https://web.push.apple.com/${"y".repeat(80)}`,
    },
  },
];

async function main() {
  const sent: Array<{ payload: string; urgency: string }> = [];
  const completed: Array<{
    deliveryId: string;
    status: string;
    revoke: boolean;
  }> = [];
  const result = await deliverClaimedStaffPushNotifications({
    claimed,
    sender: {
      async send(input) {
        sent.push({ payload: input.payload, urgency: input.urgency });
      },
    },
    async complete(input) {
      completed.push({
        deliveryId: input.deliveryId,
        status: input.status,
        revoke: Boolean(input.revokeSubscription),
      });
      return true;
    },
  });

  assert.deepEqual(result, { sent: 2, failed: 0, revoked: 0 });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].urgency, "normal");
  assert.deepEqual(JSON.parse(sent[0].payload), {
    version: 1,
    eventId: "event-a",
    code: "new_order",
  });
  assert.doesNotMatch(sent[0].payload, /endpoint|p256dh|auth|customer|cake/i);
  assert.equal(completed.length, 2);
  assert.equal(completed[0].status, "sent");

  let revoked = false;
  const expired = await deliverClaimedStaffPushNotifications({
    claimed: [claimed[0]],
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
  assert.deepEqual(expired, { sent: 0, failed: 1, revoked: 1 });
  assert.equal(revoked, true);

  let transientFailure: { status: string; revoke: boolean } | null = null;
  await deliverClaimedStaffPushNotifications({
    claimed: [claimed[0]],
    sender: {
      async send() {
        throw new Error("network");
      },
    },
    async complete(input) {
      transientFailure = {
        status: input.status,
        revoke: Boolean(input.revokeSubscription),
      };
      return true;
    },
  });
  assert.deepEqual(transientFailure, { status: "failed", revoke: false });

  const migration = read(
    "supabase/migrations/20261109193000_staff_notification_push.sql",
  );
  assert.match(migration, /unique \(event_id, subscription_id\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.staff_notification_push_subscriptions/i,
  );
  assert.match(
    migration,
    /grant all on table public\.staff_notification_push_subscriptions to service_role/i,
  );
  assert.match(migration, /sp\.is_active = true/);
  assert.match(migration, /sp\.archived_at is null/);
  assert.match(
    migration,
    /set push_enabled = false\s+where staff_id = new\.id and push_enabled = true/i,
  );
  assert.match(migration, /old\.role_id is distinct from new\.role_id/i);
  assert.match(
    migration,
    /revoke all on table public\.staff_notification_push_deliveries/i,
  );
  assert.match(migration, /e\.created_at >= pref\.push_enabled_at/);
  assert.match(migration, /e\.created_at >= sub\.created_at/);
  assert.match(migration, /p_status not in \('sent', 'failed'\)/i);
  assert.match(migration, /interval '1 minute'/i);
  assert.match(migration, /interval '5 minutes'/i);
  assert.match(migration, /interval '15 minutes'/i);
  assert.match(migration, /interval '1 hour'/i);
  assert.match(migration, /register_staff_notification_push_subscription/i);
  assert.match(
    migration,
    /where public\.staff_notification_push_subscriptions\.staff_id = excluded\.staff_id/i,
  );

  const worker = read("public/sw.js");
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /renotify: false/);
  assert.doesNotMatch(worker, /addEventListener\("fetch"/);

  const authActions = read(
    "src/foundation/staff/staff-notification-push-actions.ts",
  );
  assert.match(authActions, /requireStaff\(\)/);
  assert.match(authActions, /parseStaffPushSubscription/);
  const preferences = read(
    "src/components/settings/NotificationPreferences.tsx",
  );
  const preferenceDefaults = read(
    "src/foundation/staff/notification-preferences.ts",
  );
  assert.match(
    preferenceDefaults,
    /STAFF_NOTIFICATION_DEFAULT_PUSH_ENABLED\s*=\s*false/,
  );
  assert.match(
    preferences,
    /formData\.set\("push_enabled", String\(next\.pushEnabled\)\)/,
  );
  assert.match(preferences, /registerStaffPushSubscriptionAction\(/);
  assert.match(preferences, /revokeStaffPushSubscriptionAction\(/);

  const logout = read("src/foundation/auth/actions.ts");
  assert.match(logout, /revokeAllStaffPushEndpoints\(staff\.id\)/);
  const schedule = read(
    "src/foundation/staff/schedule-staff-notification-dispatch.ts",
  );
  assert.match(
    schedule,
    /runUnlessLegacyStaffNotificationEmailIsPaused\(\(\)\s*=>/,
  );
  assert.match(schedule, /deliverPendingStaffNotificationEmails/);
  assert.match(schedule, /deliverPendingStaffPushNotifications/);
  const originalSchedule = execFileSync(
    "git",
    [
      "show",
      "HEAD:src/foundation/staff/schedule-staff-notification-dispatch.ts",
    ],
    { encoding: "utf8" },
  );
  const emailBlockStart =
    "  runUnlessLegacyStaffNotificationEmailIsPaused(() => {";
  const pushBlockStart = "\n\n  // Push is independent of email pause state";
  assert.notEqual(schedule.indexOf(emailBlockStart), -1);
  assert.notEqual(originalSchedule.indexOf(emailBlockStart), -1);
  assert.notEqual(schedule.indexOf(pushBlockStart), -1);
  assert.notEqual(originalSchedule.indexOf(pushBlockStart), -1);
  assert.equal(
    schedule
      .slice(
        schedule.indexOf(emailBlockStart),
        schedule.indexOf(pushBlockStart),
      )
      .trim(),
    originalSchedule
      .slice(
        originalSchedule.indexOf(emailBlockStart),
        originalSchedule.indexOf(pushBlockStart),
      )
      .trim(),
  );
  assert.match(
    schedule,
    /after\(async \(\) => \{[\s\S]*?deliverPendingStaffPushNotifications/,
  );
  const dispatch = read(
    "src/foundation/staff/staff-notification-push-dispatch.ts",
  );
  assert.match(dispatch, /createServiceClient/);
  assert.match(dispatch, /timeout: 8_000/);
  assert.doesNotMatch(dispatch, /console\.(log|error).*endpoint/i);

  const emailPause = read(
    "src/foundation/staff/legacy-staff-notification-email-pause.ts",
  );
  assert.match(emailPause, /LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED\s*=\s*true/);
  assert.doesNotMatch(emailPause, /process\.env/);
  const emailRoute = read("src/app/api/staff/notifications/dispatch/route.ts");
  const originalEmailRoute = execFileSync(
    "git",
    ["show", "HEAD:src/app/api/staff/notifications/dispatch/route.ts"],
    { encoding: "utf8" },
  );
  assert.equal(emailRoute, originalEmailRoute);
  assert.match(emailRoute, /\{ status: auth\.status \}/);
  assert.match(
    emailRoute,
    /if \(LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED\)\s*\{[\s\S]*?\{ error: "Staff email dispatch is paused\." \},\s*\{ status: 503 \}/,
  );
  assert.doesNotMatch(emailRoute, /deliverPendingStaffPushNotifications/);
  const pushRoute = read(
    "src/app/api/staff/notifications/push-dispatch/route.ts",
  );
  assert.match(pushRoute, /authorizeStaffPushNotificationDispatch\(request\)/);
  assert.match(
    pushRoute,
    /deliverPendingStaffPushNotifications\(\{ eventId \}\)/,
  );
  assert.doesNotMatch(
    pushRoute,
    /Email|deliverPendingStaffNotificationEmails|RESEND_API_KEY/i,
  );
  assert.match(pushRoute, /authorizeStaffPushNotificationDispatch\(request\)/);
  assert.doesNotMatch(pushRoute, /export async function GET/);
  const pushDispatchAuth = read(
    "src/foundation/staff/staff-notification-push-dispatch-auth.ts",
  );
  assert.match(pushDispatchAuth, /process\.env\.STAFF_PUSH_DISPATCH_SECRET/);
  assert.match(
    pushDispatchAuth,
    /headers\.get\("authorization"\).*Bearer \$\{secret\}/,
  );
  assert.match(pushDispatchAuth, /status: 503/);
  assert.match(pushDispatchAuth, /status: 401/);
  const settings = read("src/app/(app)/settings/page.tsx");
  assert.match(
    settings,
    /Choose which operational updates you want to receive by email\./,
  );
  const preferenceUi = read(
    "src/components/settings/NotificationPreferences.tsx",
  );
  assert.match(preferenceUi, /\{!emailNotificationsPaused\s*\?\s*\(/);
  assert.match(preferenceUi, /registerStaffPushSubscriptionAction\(/);
  assert.match(preferenceUi, /revokeStaffPushSubscriptionAction\(/);
  const preferenceAction = read(
    "src/foundation/staff/notification-preferences-actions.ts",
  );
  assert.match(
    preferenceAction,
    /!LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED\s*\?\s*\{\s*email_enabled:\s*emailEnabled/,
  );
  const checkout = read("src/workspaces/storefront/checkout/actions.ts");
  assert.match(checkout, /scheduleStaffNotificationDispatch\(\)/);
  assert.doesNotMatch(checkout, /await\s+deliverPendingStaffPushNotifications/);
  const notificationEvents = read(
    "src/foundation/staff/notification-event-identity.ts",
  );
  const baselineNotificationEvents = execFileSync(
    "git",
    ["show", "HEAD:src/foundation/staff/notification-event-identity.ts"],
    { encoding: "utf8" },
  );
  const sourceStart = "export function isNewOrderNotificationSource(";
  const sourceEnd = "export function classifyOrderUpdate(";
  const currentStart = notificationEvents.indexOf(sourceStart);
  const baselineStart = baselineNotificationEvents.indexOf(sourceStart);
  assert.notEqual(currentStart, -1);
  assert.notEqual(baselineStart, -1);
  assert.equal(
    notificationEvents.slice(
      currentStart,
      notificationEvents.indexOf(sourceEnd),
    ),
    baselineNotificationEvents.slice(
      baselineStart,
      baselineNotificationEvents.indexOf(sourceEnd),
    ),
  );

  console.log(
    "Staff push isolation, Email freeze, subscription privacy, delivery and retry contracts: PASS",
  );
}

void main();
