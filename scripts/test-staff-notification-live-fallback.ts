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
    "void presentEvent(event, false,",
    listenerSource.indexOf(
      "const event = normalizeLiveNotificationEvent(payload.new)",
    ),
  ),
);
assert.match(malformedBranch, /if \(!event\)/);
assert.match(malformedBranch, /getLiveNotificationShape\(payload\.new\)/);
assert.match(malformedBranch, /tryStart\(Date\.now\(\)\)/);
assert.match(malformedBranch, /automaticFallbackDiagnosticRef\.current/);
assert.match(malformedBranch, /void runRecovery\("live_fallback"\)/);
const suppressedDiagnostic = malformedBranch.slice(
  malformedBranch.indexOf(
    'console.warn(\n                "[staff-notifications] Malformed live event fallback"',
  ),
);
assert.doesNotMatch(
  suppressedDiagnostic,
  /payload\.new|staffId|order_id|title|description|href|token|cookie/i,
);
assert.match(listenerSource, /automaticRecoveryAttempted: true/);
assert.match(listenerSource, /automaticRecoverySucceeded,/);
const completedDiagnostic = listenerSource.slice(
  listenerSource.indexOf("if (automaticFallbackDiagnostic)"),
  listenerSource.indexOf("if (recoveredSoundPriorityInBatchRef.current > 0)"),
);
assert.doesNotMatch(
  completedDiagnostic,
  /staffId|order_id|title|description|href|token|cookie/i,
);
assert.match(
  listenerSource,
  /\[staff-notifications\] Realtime subscription status/,
);
assert.match(listenerSource, /Retry recovery/);
assert.match(listenerSource, /claimStaffNotificationForStaff/);
assert.match(listenerSource, /if \(recoveryRequestedRef\.current\)/);
assert.doesNotMatch(
  listenerSource,
  /SUPABASE_SERVICE_ROLE_KEY|service_role|push-dispatch|email-dispatch/,
);

console.log(
  "PASS staff notification live fallback: normalization, safe diagnostics, bounded/coalesced recovery, status sanitization, manual retry, and listener integration",
);
