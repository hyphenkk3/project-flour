import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import {
  buildStaffPushMessage,
  isTrustedStaffPushEndpoint,
  parseStaffPushSubscription,
} from "../src/foundation/staff/staff-notification-push-protocol";
import {
  deliverClaimedStaffPushNotifications,
  type ClaimedStaffPushDelivery,
} from "../src/foundation/staff/staff-notification-push-delivery-core";
import {
  dispatchSpecificFreshPickReminderEvents,
  isFreshPickReminderEventId,
} from "../src/foundation/staff/fresh-pick-push-handoff";
import { STAFF_NOTIFICATION_DEFINITIONS } from "../src/foundation/staff/notification-preferences";

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
assert.equal(message.data.href, "/owner");
assert.equal(message.renotify, false);
assert.doesNotMatch(
  JSON.stringify(message),
  /customer|cake|orderNumber|guestName/i,
);

const pushDestinations = {
  new_order: "/owner",
  order_paid: "/owner",
  order_confirmed: "/owner",
  order_cancelled: "/owner",
  order_edited: "/owner",
  approval_required: "/owner/approvals",
  last_minute: "/owner",
  fresh_pick_walk_in_hold_reminder: "/customer-operations/fresh-picks",
  waiting_list_new_request: "/bakery/availability#waiting-list-heading",
} as const;

assert.equal(STAFF_NOTIFICATION_DEFINITIONS.length, 9);
assert.deepEqual(
  STAFF_NOTIFICATION_DEFINITIONS.map(({ code }) => code).sort(),
  Object.keys(pushDestinations).sort(),
);

const appRoot = "src/app/(app)";
const destinationPages = {
  "/owner": "owner/page.tsx",
  "/owner/approvals": "owner/approvals/page.tsx",
  "/customer-operations/fresh-picks":
    "customer-operations/fresh-picks/page.tsx",
  "/bakery/availability": "bakery/availability/page.tsx",
} as const;
const authenticatedLayout = read(`${appRoot}/layout.tsx`);
assert.match(authenticatedLayout, /requireStaff\(\)/);
for (const [route, page] of Object.entries(destinationPages)) {
  assert.ok(
    readFileSync(resolve(appRoot, page), "utf8"),
    `${route} page exists`,
  );
}
assert.match(read(`${appRoot}/owner/page.tsx`), /canAccessOperationsBoard/);
assert.match(
  read(`${appRoot}/owner/approvals/page.tsx`),
  /canAccessOperationsApprovalsInbox/,
);
assert.match(
  read(`${appRoot}/customer-operations/fresh-picks/page.tsx`),
  /canViewWalkInHold/,
);
assert.match(
  read(`${appRoot}/bakery/availability/page.tsx`),
  /canViewOrderAvailability/,
);

const devPreviewOrigin =
  "https://project-flour-44iu5dxpf-hyphen-org.vercel.app";
type WorkerTestEvent = {
  data?: { json(): unknown };
  notification?: { data?: { href?: unknown }; close(): void };
  waitUntil(promise: Promise<unknown>): void;
};
const workerListeners = new Map<string, (event: WorkerTestEvent) => void>();
const workerState: {
  clients: Array<{
    url: string;
    navigatedTo?: string;
    focusCount: number;
    navigate(target: string): Promise<unknown>;
    focus(): Promise<unknown>;
  }>;
  opened: string[];
  shown: Array<{ title: string; options: { data: { href: string } } }>;
} = { clients: [], opened: [], shown: [] };
const workerSelf = {
  location: { origin: devPreviewOrigin },
  addEventListener(type: string, listener: (event: WorkerTestEvent) => void) {
    workerListeners.set(type, listener);
  },
  clients: {
    async matchAll() {
      return workerState.clients;
    },
    async openWindow(target: string) {
      workerState.opened.push(target);
      return null;
    },
  },
  registration: {
    async showNotification(title: string, options: { data: { href: string } }) {
      workerState.shown.push({ title, options });
    },
  },
};
runInNewContext(read("public/sw.js"), { self: workerSelf, URL, Object });

function makeWindowClient(url: string) {
  return {
    url,
    focusCount: 0,
    navigatedTo: undefined as string | undefined,
    async navigate(target: string) {
      this.navigatedTo = target;
      return this;
    },
    async focus() {
      this.focusCount += 1;
      return this;
    },
  };
}

async function serviceWorkerNavigationTests() {
  const clickHandler = workerListeners.get("notificationclick");
  const pushHandler = workerListeners.get("push");
  assert.ok(clickHandler);
  assert.ok(pushHandler);

  for (const [code, href] of Object.entries(pushDestinations)) {
    workerState.opened = [];
    const expectedMessage = buildStaffPushMessage({
      eventId: "test-event-id",
      code: code as keyof typeof pushDestinations,
    });
    let pushWait: Promise<void> | undefined;
    pushHandler({
      data: { json: () => ({ version: 1, eventId: "test-event-id", code }) },
      waitUntil(promise: Promise<void>) {
        pushWait = promise;
      },
    });
    await pushWait;
    const shown = workerState.shown.at(-1);
    assert.equal(shown?.options.data.href, href);
    assert.equal(expectedMessage.data.href, href);
    const pageRoute = href.split("#")[0].split("?")[0];
    assert.ok(destinationPages[pageRoute as keyof typeof destinationPages]);

    const openClient = makeWindowClient(`${devPreviewOrigin}/settings`);
    workerState.clients = [openClient];
    let openWait: Promise<unknown> | undefined;
    clickHandler({
      notification: {
        data: { href: shown?.options.data.href },
        close() {},
      },
      waitUntil(promise: Promise<unknown>) {
        openWait = promise;
      },
    });
    await openWait;
    assert.equal(openClient.navigatedTo, `${devPreviewOrigin}${href}`);
    assert.equal(openClient.focusCount, 1);
    assert.equal(workerState.opened.length, 0);

    workerState.clients = [];
    let closedWait: Promise<unknown> | undefined;
    clickHandler({
      notification: {
        data: { href: shown?.options.data.href },
        close() {},
      },
      waitUntil(promise: Promise<unknown>) {
        closedWait = promise;
      },
    });
    await closedWait;
    assert.equal(workerState.opened.at(-1), `${devPreviewOrigin}${href}`);
  }

  workerState.clients = [];
  const openedBeforeExternalHref = workerState.opened.length;
  let unsafeWait: Promise<unknown> | undefined;
  clickHandler({
    notification: {
      data: { href: "//outside.example/path" },
      close() {},
    },
    waitUntil(promise: Promise<unknown>) {
      unsafeWait = promise;
    },
  });
  await unsafeWait;
  assert.equal(workerState.opened.length, openedBeforeExternalHref);

  const pushClient = read(
    "src/foundation/staff/staff-notification-push-client.ts",
  );
  assert.match(pushClient, /register\("\/sw\.js",\s*\{\s*scope: "\/"/);
  assert.match(pushClient, /updateViaCache: "none"/);
  assert.doesNotMatch(read("public/sw.js"), /pushManager|unsubscribe\(/);
}

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
  await serviceWorkerNavigationTests();
  const freshPickEventId = "8e5b25a5-f302-48ba-aa60-a6f2857b1d35";
  assert.equal(isFreshPickReminderEventId(freshPickEventId), true);
  assert.equal(isFreshPickReminderEventId(undefined), false);
  assert.equal(isFreshPickReminderEventId(""), false);
  assert.equal(isFreshPickReminderEventId("not-a-uuid"), false);

  const scopedDispatches: string[] = [];
  const handoff = await dispatchSpecificFreshPickReminderEvents({
    eventIds: [
      { event_id: freshPickEventId },
      { event_id: "invalid" },
      { event_id: freshPickEventId },
    ],
    async dispatch(eventId) {
      scopedDispatches.push(eventId);
      return eventId;
    },
  });
  assert.deepEqual(handoff, {
    attempted: 1,
    rejected: 2,
    results: [freshPickEventId],
  });
  const missingHandoff = await dispatchSpecificFreshPickReminderEvents({
    eventIds: undefined,
    async dispatch(eventId) {
      scopedDispatches.push(eventId);
      return eventId;
    },
  });
  assert.deepEqual(missingHandoff, {
    attempted: 0,
    rejected: 1,
    results: [],
  });
  assert.deepEqual(scopedDispatches, [freshPickEventId]);

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

  assert.deepEqual(result, {
    sent: 2,
    failed: 0,
    revoked: 0,
    suppressed: 0,
    completionFailures: 0,
  });
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
  assert.deepEqual(expired, {
    sent: 0,
    failed: 1,
    revoked: 1,
    suppressed: 0,
    completionFailures: 0,
  });
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

  let providerCalled = false;
  let staleCompletion: { status: string; errorCode?: string } | null = null;
  const staleResult = await deliverClaimedStaffPushNotifications({
    claimed: [claimed[0]],
    beforeSend: async () => "suppress",
    sender: {
      async send() {
        providerCalled = true;
      },
    },
    async complete(input) {
      staleCompletion = { status: input.status, errorCode: input.errorCode };
      return true;
    },
  });
  assert.deepEqual(staleResult, {
    sent: 0,
    failed: 0,
    revoked: 0,
    suppressed: 1,
    completionFailures: 0,
  });
  assert.equal(providerCalled, false);
  assert.deepEqual(staleCompletion, {
    status: "suppressed",
    errorCode: "stale_hold",
  });

  let retrySenderCalled = false;
  let preflightFailure: { status: string; errorCode?: string } | null = null;
  const retryPreflightResult = await deliverClaimedStaffPushNotifications({
    claimed: [claimed[0]],
    beforeSend: async () => "retry",
    sender: {
      async send() {
        retrySenderCalled = true;
      },
    },
    async complete(input) {
      preflightFailure = { status: input.status, errorCode: input.errorCode };
      return true;
    },
  });
  assert.deepEqual(retryPreflightResult, {
    sent: 0,
    failed: 1,
    revoked: 0,
    suppressed: 0,
    completionFailures: 0,
  });
  assert.equal(retrySenderCalled, false);
  assert.deepEqual(preflightFailure, {
    status: "failed",
    errorCode: "hold_preflight_failed",
  });

  const completionFailure = await deliverClaimedStaffPushNotifications({
    claimed: [claimed[0]],
    sender: { async send() {} },
    async complete() {
      return false;
    },
  });
  assert.equal(completionFailure.completionFailures, 1);

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
  assert.match(worker, /addEventListener\("notificationclick"/);
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

  const handoffMigration = read(
    "supabase/migrations/20261111120000_staff_notification_fresh_pick_push_handoff.sql",
  );
  assert.match(
    handoffMigration,
    /list_due_fresh_pick_hold_reminder_push_event_ids/i,
  );
  assert.match(
    handoffMigration,
    /grant execute on function public\.list_due_fresh_pick_hold_reminder_push_event_ids\(integer\)\s+to service_role/i,
  );
  assert.match(
    handoffMigration,
    /staff_notification_fresh_pick_hold_reminder_is_current\(e\.payload\)/i,
  );
  assert.match(
    handoffMigration,
    /status in \('pending', 'claimed', 'sent', 'failed', 'suppressed'\)/i,
  );
  assert.match(
    handoffMigration,
    /p_status = 'suppressed' and p_error_code is distinct from 'stale_hold'/i,
  );
  assert.match(
    handoffMigration,
    /status = 'suppressed'[\s\S]*error_code = 'stale_hold'/i,
  );
  assert.match(handoffMigration, /interval '1 minute'/i);
  assert.match(handoffMigration, /interval '5 minutes'/i);
  assert.doesNotMatch(handoffMigration, /email|resend/i);

  const holdLifecycleMigration = read(
    "supabase/migrations/20260917140000_extra_walk_in_hold.sql",
  );
  const staleHoldMigration = read(
    "supabase/migrations/20261007120000_staff_notification_fresh_pick_hold_stale_suppression.sql",
  );
  assert.match(
    holdLifecycleMigration,
    /create or replace function public\.extra_walk_in_hold_minutes\(\)[\s\S]*?select 15/i,
  );
  assert.match(
    holdLifecycleMigration,
    /create or replace function public\.extra_walk_in_hold_reminder_lead_minutes\(\)[\s\S]*?select 3/i,
  );
  assert.match(
    holdLifecycleMigration,
    /'\* \* \* \* \*'[\s\S]*sweep_extra_walk_in_hold_reminders\(\)/i,
  );
  assert.match(staleHoldMigration, /walk_in_held_by = v_held_by/i);
  assert.match(staleHoldMigration, /walk_in_held_at = v_held_at/i);
  assert.match(staleHoldMigration, /walk_in_held_until = v_held_until/i);
  assert.match(staleHoldMigration, /sold_at is null/i);
  assert.match(staleHoldMigration, /cut_into_slices_at is null/i);
  assert.match(
    staleHoldMigration,
    /extra_walk_in_hold_is_active\([\s\S]*clock_timestamp\(\)/i,
  );

  const handoffRoute = read(
    "src/app/api/staff/notifications/fresh-pick-reminder-dispatch/route.ts",
  );
  assert.match(handoffRoute, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(handoffRoute, /export const maxDuration = 60/);
  assert.match(handoffRoute, /const MAX_EVENT_IDS_PER_RUN = 5/);
  assert.match(
    handoffRoute,
    /process\.env\.VERCEL_GIT_COMMIT_REF !== NOTIFICATION_BRANCH/,
  );
  assert.match(handoffRoute, /tzwtpxdcggesgjaqxkqr\.supabase\.co/);
  assert.match(handoffRoute, /process\.env\.CRON_SECRET/);
  assert.match(handoffRoute, /export async function HEAD[\s\S]*?status: 405/);
  assert.doesNotMatch(handoffRoute, /deliverPendingStaffPushNotifications/);
  assert.match(handoffRoute, /dispatchSpecificFreshPickReminderEvents/);
  assert.match(handoffRoute, /Cache-Control/);
  const vercelConfig = JSON.parse(read("vercel.json")) as {
    schedules: Record<
      string,
      { path: string; requestMethod: string; schedule: string }
    >;
  };
  assert.deepEqual(vercelConfig.schedules["staff-fresh-pick-reminder-push"], {
    schedule: "* * * * *",
    path: "/api/staff/notifications/fresh-pick-reminder-dispatch",
    requestMethod: "GET",
  });
  assert.equal("crons" in vercelConfig, false);
  assert.match(handoffRoute, /timingSafeEqual/);
  assert.doesNotMatch(
    handoffRoute,
    /STAFF_PUSH_VAPID_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY/,
  );
  const pushDispatch = read(
    "src/foundation/staff/staff-notification-push-dispatch.ts",
  );
  assert.match(pushDispatch, /failClosed: true/);
  assert.match(
    pushDispatch,
    /if \(input\?\.failClosed\) throw new Error\("push_queue_unavailable"\)/,
  );
  assert.match(
    pushDispatch,
    /if \(input\?\.failClosed\) throw new Error\("push_claim_unavailable"\)/,
  );
  assert.match(pushDispatch, /result\.completionFailures > 0/);
  assert.match(
    handoffRoute,
    /console\.info\("\[staff-fresh-pick-push\] Run complete:", result\)/,
  );

  console.log(
    "Staff Push handoff IDs, click navigation, isolation, Email freeze, subscription privacy, delivery and retry contracts: PASS",
  );
}

void main();
