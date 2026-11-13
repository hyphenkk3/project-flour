import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  appendStaffNotificationRecoveryTrace,
  clearStaffNotificationRecoveryTrace,
  getPendingStaffNotificationChannelRemoval,
  isRecoveryDiagnosticsEnabled,
  isStaffNotificationRealtimeCallbackCurrent,
  isStaffNotificationTestControlOperationCurrent,
  pruneRecoveryDiagnosticRecords,
  mayUseStaffNotificationRealtimeTestControls,
  removeStaffNotificationChannelForTest,
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

assert.equal(
  mayUseStaffNotificationRealtimeTestControls({
    diagnosticsEnabled: true,
    isMasterOwner: true,
    hostname: exactScope.vercelUrl,
    expectedHostname: exactScope.vercelUrl,
  }),
  true,
);
for (const invalidScope of [
  {
    diagnosticsEnabled: false,
    isMasterOwner: true,
    hostname: exactScope.vercelUrl,
  },
  {
    diagnosticsEnabled: true,
    isMasterOwner: false,
    hostname: exactScope.vercelUrl,
  },
  {
    diagnosticsEnabled: true,
    isMasterOwner: true,
    hostname: "dev.whitebird.asia",
  },
  { diagnosticsEnabled: true, isMasterOwner: true, hostname: "whitebird.asia" },
  { diagnosticsEnabled: true, isMasterOwner: true, hostname: undefined },
]) {
  assert.equal(
    mayUseStaffNotificationRealtimeTestControls({
      ...invalidScope,
      expectedHostname: exactScope.vercelUrl,
    }),
    false,
  );
}

const callbackScope = {
  disposed: false,
  intentionallyPaused: false,
  channelGeneration: 4,
  currentGeneration: 4,
  isCurrentChannel: true,
};
assert.equal(isStaffNotificationRealtimeCallbackCurrent(callbackScope), true);
assert.equal(
  isStaffNotificationRealtimeCallbackCurrent({
    ...callbackScope,
    intentionallyPaused: true,
  }),
  false,
);
assert.equal(
  isStaffNotificationTestControlOperationCurrent({
    operationGeneration: 3,
    currentGeneration: 3,
    operationStaffId: "staff-a",
    currentStaffId: "staff-a",
  }),
  true,
);
assert.equal(
  isStaffNotificationTestControlOperationCurrent({
    operationGeneration: 3,
    currentGeneration: 4,
    operationStaffId: "staff-a",
    currentStaffId: "staff-a",
  }),
  false,
);
assert.equal(
  isStaffNotificationTestControlOperationCurrent({
    operationGeneration: 3,
    currentGeneration: 3,
    operationStaffId: "staff-a",
    currentStaffId: "staff-b",
  }),
  false,
);
assert.equal(
  isStaffNotificationRealtimeCallbackCurrent({
    ...callbackScope,
    disposed: true,
  }),
  false,
);
assert.equal(
  isStaffNotificationRealtimeCallbackCurrent({
    ...callbackScope,
    currentGeneration: 5,
  }),
  false,
);
assert.equal(
  isStaffNotificationRealtimeCallbackCurrent({
    ...callbackScope,
    isCurrentChannel: false,
  }),
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

appendStaffNotificationRecoveryTrace({
  kind: "sound_diagnostic",
  eventId: "00000000-0000-4000-8000-000000000125",
  source: "live",
  tabId: "00000000-0000-4000-8000-000000000126",
  visibilityState: "hidden",
  soundStage: "result",
  soundOwnership: "winner",
  soundPreferenceEnabled: true,
  soundEligible: true,
  audioContextBefore: "suspended",
  audioContextAfter: "running",
  soundResumeAttempted: true,
  soundResumeOutcome: "succeeded",
  soundPlaybackOutcome: "scheduled",
  soundRestriction: "none",
  outcome: "success",
});
const soundRecord = readStaffNotificationRecoveryTrace().at(-1);
assert.equal(soundRecord?.kind, "sound_diagnostic");
assert.equal(soundRecord?.eventId, "00000000-0000-4000-8000-000000000125");
assert.equal(soundRecord?.tabId, "00000000-0000-4000-8000-000000000126");
assert.equal(soundRecord?.visibilityState, "hidden");
assert.equal(soundRecord?.audioContextBefore, "suspended");
assert.equal(soundRecord?.audioContextAfter, "running");
assert.equal(soundRecord?.soundResumeOutcome, "succeeded");
assert.equal(soundRecord?.soundPlaybackOutcome, "scheduled");
scheduledTasks.shift()?.();

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
assert.match(listener, /recordStaffNotificationSoundOwnership/);
assert.match(listener, /ownership: "duplicate_suppressed"/);
assert.match(listener, /playStaffNotificationSound\(/);
assert.match(listener, /kind: "recovery_finished"/);
assert.match(listener, /retryRecoveryRef\.current\?\.\("manual_retry"\)/);
assert.match(listener, /runRecovery\(source\)/);
assert.match(listener, /removeStaffNotificationChannelForTest/);
assert.match(listener, /supabase\.getChannels\(\)\.includes\(target\)/);
assert.match(listener, /getPendingStaffNotificationChannelRemoval\(supabase\)/);
assert.match(
  listener,
  /candidate\.topic === "realtime:staff-notification-events"/,
);
assert.match(listener, /Resume listening to try again/);
assert.match(listener, /testPauseRequestedRef\.current/);
assert.match(listener, /subscribeRealtimeRef\.current\?\.\(\)/);
assert.match(listener, /auth\.getUser\(\)/);
assert.match(listener, /mayUseStaffNotificationRealtimeTestControls/);
assert.match(listener, /runRecoveryRef\.current\(source\)/);
assert.equal(
  (listener.match(/\.channel\("staff-notification-events"\)/g) ?? []).length,
  1,
);
assert.match(
  listener,
  /if \(disposed \|\| testPauseRequestedRef\.current\) return false/,
);
assert.match(listener, /if \(testPauseRequestedRef\.current\) return/);
assert.match(
  listener,
  /source = everSubscribedRef\.current \? "reconnect" : "page_load"/,
);
assert.match(listener, /listenerLifecycleGenerationRef\.current \+= 1/);
assert.match(listener, /realtimeControlOperationGenerationRef\.current \+= 1/);
const pauseControl = listener.slice(
  listener.indexOf("const pauseRealtimeForTest"),
  listener.indexOf("const resumeRealtimeForTest"),
);
const resumeControl = listener.slice(
  listener.indexOf("const resumeRealtimeForTest"),
  listener.indexOf("const realtimeTestControls"),
);
assert.ok(
  pauseControl.indexOf("realtimeControlOperationRef.current = true") <
    pauseControl.indexOf("await verifyTestControlSession()"),
);
assert.ok(
  pauseControl.indexOf("await verifyTestControlSession()") <
    pauseControl.indexOf(
      "recoveryInProgressRef.current ||",
      pauseControl.indexOf("await verifyTestControlSession()"),
    ) &&
    pauseControl.indexOf(
      "recoveryRequestedRef.current",
      pauseControl.indexOf("await verifyTestControlSession()"),
    ) < pauseControl.indexOf("testPauseRequestedRef.current = true"),
  "Pause must recheck for recovery work after asynchronous session verification",
);
assert.ok(
  resumeControl.indexOf("realtimeControlOperationRef.current = true") <
    resumeControl.indexOf("await verifyTestControlSession()"),
);
assert.match(
  listener.slice(listener.indexOf("const runRecovery = useCallback")),
  /async \(source: RecoveryDiagnosticSource\) => \{\s*if \(testPauseRequestedRef\.current\) return;/,
);
assert.match(
  listener.slice(listener.lastIndexOf("return () => {")),
  /testPauseRequestedRef\.current = false/,
);
assert.doesNotMatch(
  `${pauseControl}\n${resumeControl}`,
  /saveStaffNotificationRecoveryCursor|markStaffNotificationRecoveryPending|clearStaffNotificationRecoveryPending|\.from\(|\.insert\(|push-dispatch/,
);
assert.doesNotMatch(listener, /setInterval\(/);
assert.doesNotMatch(
  listener,
  /sessionStorage.*testPause|localStorage.*testPause/s,
);
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
const diagnosticsPanel = readFileSync(
  resolve("src/components/shell/StaffNotificationRecoveryDiagnostics.tsx"),
  "utf8",
);
assert.match(diagnosticsPanel, /Pause Realtime/);
assert.match(diagnosticsPanel, /Resume Realtime/);
assert.match(diagnosticsPanel, /realtimeStatus === "SUBSCRIBED"/);
assert.doesNotMatch(listener, /SUPABASE_SERVICE_ROLE_KEY|push-dispatch/);
assert.doesNotMatch(toast, /SUPABASE_SERVICE_ROLE_KEY|push-dispatch/);

void (async () => {
  const channel = { id: "only-the-notification-channel" };
  let registered = true;
  assert.equal(
    await removeStaffNotificationChannelForTest({
      channel,
      removeChannel: async (target) => {
        assert.equal(target, channel);
        registered = false;
        return "ok";
      },
      isRegistered: (target) => target === channel && registered,
    }),
    true,
  );
  assert.equal(
    await removeStaffNotificationChannelForTest({
      channel,
      removeChannel: async () => "ok",
      isRegistered: () => true,
    }),
    false,
  );
  const client = {};
  let removalCalls = 0;
  let channelRegistered = true;
  let acknowledgeRemoval: ((value: unknown) => void) | undefined;
  const delayedRemoval = new Promise<unknown>((resolve) => {
    acknowledgeRemoval = resolve;
  });
  const coalescedInput = {
    channel,
    removeChannel: async () => {
      removalCalls += 1;
      return delayedRemoval;
    },
    isRegistered: () => channelRegistered,
    coalesceBy: client,
  };
  const firstRemoval = removeStaffNotificationChannelForTest(coalescedInput);
  const secondRemoval = removeStaffNotificationChannelForTest(coalescedInput);
  assert.equal(removalCalls, 1);
  assert.ok(getPendingStaffNotificationChannelRemoval(client));
  channelRegistered = false;
  acknowledgeRemoval?.("ok");
  assert.deepEqual(await Promise.all([firstRemoval, secondRemoval]), [
    true,
    true,
  ]);
  await Promise.resolve();
  assert.equal(getPendingStaffNotificationChannelRemoval(client), undefined);
  for (const response of ["timed out", "error", undefined]) {
    assert.equal(
      await removeStaffNotificationChannelForTest({
        channel,
        removeChannel: async () => response,
        isRegistered: () => false,
      }),
      false,
    );
  }
  assert.equal(
    await removeStaffNotificationChannelForTest({
      channel,
      removeChannel: async () => {
        throw new Error("synthetic removal failure");
      },
      isRegistered: () => false,
    }),
    false,
  );
  console.log(
    "PASS recovery diagnostics and DEV listener controls: strict scope, paused/stale callback suppression, acknowledged single-channel removal, retry-safe failure, bounded local trace, no privileged dispatch",
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
