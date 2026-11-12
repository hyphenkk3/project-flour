import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  appendStaffNotificationRecoveryTrace,
  clearStaffNotificationRecoveryTrace,
  isRecoveryDiagnosticsEnabled,
  pruneRecoveryDiagnosticRecords,
  readStaffNotificationRecoveryTrace,
  STAFF_NOTIFICATION_RECOVERY_TRACE_KEY,
  STAFF_NOTIFICATION_RECOVERY_TRACE_LIMIT,
  STAFF_NOTIFICATION_RECOVERY_TRACE_TTL_MS,
  type RecoveryDiagnosticRecord,
} from "../src/foundation/staff/staff-notification-recovery-diagnostics";
import { retainLatestToastItems } from "../src/foundation/ui/toast-retention";

const exactScope = {
  vercelEnvironment: "preview",
  vercelProjectId: "prj_3rmlAQzLSFOi15DEGczSuDYDq8xr",
  vercelBranch: "codex/staff-notifications-dev-20261109",
  vercelUrl: "project-flour-drthdmxf1-hyphen-org.vercel.app",
  supabaseUrl: "https://tzwtpxdcggesgjaqxkqr.supabase.co",
  isMasterOwner: true,
};

assert.equal(isRecoveryDiagnosticsEnabled(exactScope), true);
assert.equal(
  isRecoveryDiagnosticsEnabled({
    ...exactScope,
    vercelEnvironment: "production",
  }),
  false,
);
assert.equal(
  isRecoveryDiagnosticsEnabled({
    ...exactScope,
    vercelProjectId: "other-project",
  }),
  false,
);
assert.equal(
  isRecoveryDiagnosticsEnabled({ ...exactScope, vercelBranch: "main" }),
  false,
);
assert.equal(
  isRecoveryDiagnosticsEnabled({
    ...exactScope,
    supabaseUrl: "https://cuowwlduhxxifmpvpltt.supabase.co",
  }),
  false,
);
assert.equal(
  isRecoveryDiagnosticsEnabled({
    ...exactScope,
    vercelUrl: "dev.whitebird.asia",
  }),
  false,
);
assert.equal(
  isRecoveryDiagnosticsEnabled({ ...exactScope, isMasterOwner: false }),
  false,
);

const now = Date.parse("2026-11-12T08:00:00.000Z");
const sample = (index: number, at = now): RecoveryDiagnosticRecord => ({
  at,
  kind: "event_processing",
  eventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  outcome: "success",
});
const retained = pruneRecoveryDiagnosticRecords(
  Array.from({ length: STAFF_NOTIFICATION_RECOVERY_TRACE_LIMIT + 1 }, (_, i) =>
    sample(i + 1),
  ),
  now,
);
assert.equal(retained.length, STAFF_NOTIFICATION_RECOVERY_TRACE_LIMIT);
assert.equal(retained[0]?.eventId, "00000000-0000-4000-8000-000000000002");
assert.equal(
  pruneRecoveryDiagnosticRecords(
    [sample(1, now - STAFF_NOTIFICATION_RECOVERY_TRACE_TTL_MS - 1)],
    now,
  ).length,
  0,
);
assert.equal(
  pruneRecoveryDiagnosticRecords([sample(2, now + 1)], now).length,
  0,
);
const fiveToastItems = Array.from(
  { length: 5 },
  (_, index) => `toast-${index + 1}`,
);
const sixToastResult = retainLatestToastItems(fiveToastItems, "toast-6", 5);
assert.deepEqual(sixToastResult.retained, [
  "toast-2",
  "toast-3",
  "toast-4",
  "toast-5",
  "toast-6",
]);
assert.deepEqual(sixToastResult.evicted, ["toast-1"]);
const multiBatchToastResult = retainLatestToastItems(
  sixToastResult.retained,
  "toast-7",
  5,
);
assert.deepEqual(multiBatchToastResult.evicted, ["toast-2"]);
assert.equal(multiBatchToastResult.retained.length, 5);

const values = new Map<string, string>();
const storageNow = Date.now();
const scheduledTasks: Array<() => void> = [];
const fakeWindow = {
  sessionStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
  dispatchEvent: () => true,
  setTimeout: (callback: () => void) => {
    scheduledTasks.push(callback);
    return 1;
  },
};
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: fakeWindow,
});

appendStaffNotificationRecoveryTrace({
  kind: "event_processing",
  eventId: "00000000-0000-4000-8000-000000000123",
  source: "manual_retry",
  outcome: "success",
  runId: "00000000-0000-4000-8000-000000000124",
});
const stored = readStaffNotificationRecoveryTrace();
assert.equal(stored.length, 1);
assert.deepEqual(Object.keys(stored[0] ?? {}).sort(), [
  "at",
  "eventId",
  "kind",
  "outcome",
  "runId",
  "source",
]);
assert.equal(values.has(STAFF_NOTIFICATION_RECOVERY_TRACE_KEY), false);
scheduledTasks.shift()?.();
assert.equal(values.has(STAFF_NOTIFICATION_RECOVERY_TRACE_KEY), true);

values.set(
  STAFF_NOTIFICATION_RECOVERY_TRACE_KEY,
  JSON.stringify([
    {
      at: storageNow,
      kind: "event_processing",
      eventId: "not-a-uuid",
      staffId: "must-not-survive",
      content: "must-not-survive",
    },
    { at: storageNow, kind: "unknown-kind", content: "must-not-survive" },
  ]),
);
const sanitized = readStaffNotificationRecoveryTrace();
assert.equal(sanitized.length, 1);
assert.equal("staffId" in (sanitized[0] ?? {}), false);
assert.equal("content" in (sanitized[0] ?? {}), false);
assert.equal("eventId" in (sanitized[0] ?? {}), false);
clearStaffNotificationRecoveryTrace();
assert.equal(values.has(STAFF_NOTIFICATION_RECOVERY_TRACE_KEY), false);

const listener = readFileSync(
  resolve("src/components/shell/StaffNotificationListener.tsx"),
  "utf8",
);
const toast = readFileSync(resolve("src/components/ui/Toast.tsx"), "utf8");
const layout = readFileSync(resolve("src/app/(app)/layout.tsx"), "utf8");
const shellFrame = readFileSync(
  resolve("src/components/shell/AppShellFrame.tsx"),
  "utf8",
);
assert.match(listener, /kind: "recovery_started"/);
assert.match(listener, /kind: "event_eligible"/);
assert.match(listener, /kind: "normalization"/);
assert.match(listener, /kind: "dedupe_claim"/);
assert.match(listener, /kind: "cursor_saved"/);
assert.match(listener, /kind: "pending_marker"/);
assert.match(listener, /kind: "retry_visibility"/);
assert.match(listener, /kind: "recovery_finished"/);
assert.match(listener, /retryRecoveryRef\.current\?\.\("manual_retry"\)/);
assert.match(listener, /runRecovery\(source\)/);
assert.match(toast, /kind: "toast_retained"/);
assert.match(toast, /kind: "toast_mounted"/);
assert.match(toast, /reason: "toast_limit"/);
assert.match(toast, /"toast_expired"/);
assert.match(layout, /VERCEL_PROJECT_ID/);
assert.match(layout, /isRecoveryDiagnosticsEnabled/);
assert.match(
  shellFrame,
  /window\.location\.hostname === recoveryDiagnosticsHostname/,
);
assert.doesNotMatch(listener, /SUPABASE_SERVICE_ROLE_KEY|push-dispatch/);
assert.doesNotMatch(toast, /SUPABASE_SERVICE_ROLE_KEY|push-dispatch/);

console.log(
  "PASS recovery diagnostics: strict DEV scope, local bounded retention, sanitizer, trace coverage, no privileged dispatch",
);
