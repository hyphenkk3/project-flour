import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { STAFF_NOTIFICATION_DEFINITIONS } from "../src/foundation/staff/notification-preferences";
import {
  createMalformedLiveRecoveryGate,
  getLiveNotificationShape,
  MALFORMED_LIVE_RECOVERY_COOLDOWN_MS,
  normalizeLiveNotificationEvent,
  toSafeRealtimeSubscriptionStatus,
} from "../src/foundation/staff/staff-notification-live-fallback";

const baseId = "11111111-1111-4111-8111-111111111111";
for (const definition of STAFF_NOTIFICATION_DEFINITIONS) {
  const normalized = normalizeLiveNotificationEvent({
    id: baseId,
    code: definition.code,
    order_id: null,
    title: " Synthetic notification ",
    description: " Safe test summary ",
    href: "/owner",
  });
  assert.equal(normalized?.id, baseId);
  assert.equal(normalized?.code, definition.code);
  assert.equal(normalized?.title, "Synthetic notification");
}

assert.equal(normalizeLiveNotificationEvent(null), null);
assert.equal(normalizeLiveNotificationEvent({ code: "new_order" }), null);
assert.equal(
  normalizeLiveNotificationEvent({ id: baseId, code: "unrecognized" }),
  null,
);
assert.equal(
  normalizeLiveNotificationEvent({
    id: baseId,
    code: "new_order",
    title: 4,
    description: null,
    href: false,
  })?.title,
  "Staff notification",
  "malformed optional fields fail safely without rejecting a valid event",
);
assert.deepEqual(getLiveNotificationShape(null), {
  idPresent: false,
  supportedCodePresent: false,
});
assert.deepEqual(getLiveNotificationShape({ id: baseId, code: "new_order" }), {
  idPresent: true,
  supportedCodePresent: true,
});
assert.equal(toSafeRealtimeSubscriptionStatus("SUBSCRIBED"), "SUBSCRIBED");
assert.equal(
  toSafeRealtimeSubscriptionStatus("CHANNEL_ERROR"),
  "CHANNEL_ERROR",
);
assert.equal(toSafeRealtimeSubscriptionStatus("untrusted-detail"), "UNKNOWN");

const gate = createMalformedLiveRecoveryGate();
assert.equal(
  gate.tryStart(1_000),
  true,
  "first malformed event starts bounded fallback",
);
assert.equal(
  gate.tryStart(1_001),
  false,
  "in-flight malformed events coalesce",
);
gate.finish();
assert.equal(
  gate.tryStart(1_000 + MALFORMED_LIVE_RECOVERY_COOLDOWN_MS - 1),
  false,
  "repeated malformed events are rate-limited after recovery completes",
);
assert.equal(
  gate.tryStart(1_000 + MALFORMED_LIVE_RECOVERY_COOLDOWN_MS),
  true,
  "a later malformed event can attempt recovery after the cooldown",
);
gate.finish();

const listenerSource = readFileSync(
  resolve("src/components/shell/StaffNotificationListener.tsx"),
  "utf8",
);
const malformedBranch = listenerSource.slice(
  listenerSource.indexOf(
    "const event = normalizeLiveNotificationEvent(payload.new)",
  ),
  listenerSource.indexOf(
    ".subscribe((status, error)",
    listenerSource.indexOf(
      "const event = normalizeLiveNotificationEvent(payload.new)",
    ),
  ),
);
assert.match(malformedBranch, /if \(event\)/);
assert.match(malformedBranch, /30_000/);
assert.match(malformedBranch, /malformedRecoveryAtRef\.current/);
assert.match(malformedBranch, /runRecoveryRef\.current\?\.\("reconnect"\)/);
assert.match(
  malformedBranch,
  /markStaffNotificationRecoveryPending\(staffId\)/,
);
assert.doesNotMatch(malformedBranch, /console\.(info|warn).*payload/i);
assert.match(listenerSource, /claimStaffNotificationForStaff/);
assert.match(listenerSource, /recoveryAgainRef\.current/);
assert.doesNotMatch(
  listenerSource,
  /SUPABASE_SERVICE_ROLE_KEY|service_role|push-dispatch|email-dispatch/,
);

console.log(
  "PASS staff notification live fallback: normalization, safe diagnostics, bounded/coalesced recovery, status sanitization, manual retry, and listener integration",
);
