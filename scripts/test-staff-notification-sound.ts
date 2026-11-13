import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  playStaffNotificationSound,
  primeStaffNotificationSound,
  recordStaffNotificationSoundOwnership,
  recoveredStaffNotificationSoundPriority,
  shouldPlayStaffNotificationSound,
} from "../src/foundation/staff/staff-notification-sound";
import {
  readStaffNotificationRecoveryTrace,
  STAFF_NOTIFICATION_RECOVERY_TRACE_KEY,
} from "../src/foundation/staff/staff-notification-recovery-diagnostics";
import {
  STAFF_NOTIFICATION_DEFINITIONS,
  STAFF_NOTIFICATION_DEFAULT_SOUND_ENABLED,
} from "../src/foundation/staff/notification-preferences";
import { resolveStaffNotificationPreference } from "../src/foundation/staff/notification-event-identity";

assert.equal(STAFF_NOTIFICATION_DEFAULT_SOUND_ENABLED, false);

assert.equal(
  shouldPlayStaffNotificationSound({ code: "new_order", soundEnabled: true }),
  true,
);
assert.equal(
  shouldPlayStaffNotificationSound({ code: "new_order", soundEnabled: false }),
  false,
);
assert.equal(
  shouldPlayStaffNotificationSound({ code: "order_paid", soundEnabled: true }),
  true,
);
assert.equal(
  recoveredStaffNotificationSoundPriority({
    code: "new_order",
    soundEnabled: true,
  }),
  1,
);
assert.equal(
  recoveredStaffNotificationSoundPriority({
    code: "order_cancelled",
    soundEnabled: true,
  }),
  2,
  "warning categories take precedence within the single recovered-batch cue",
);
assert.equal(
  recoveredStaffNotificationSoundPriority({
    code: "new_order",
    soundEnabled: false,
  }),
  0,
  "recovery still honors the category Sound preference",
);

assert.equal(STAFF_NOTIFICATION_DEFINITIONS.length, 9);
for (const { code } of STAFF_NOTIFICATION_DEFINITIONS) {
  assert.equal(
    shouldPlayStaffNotificationSound({ code, soundEnabled: true }),
    true,
  );
  assert.equal(
    shouldPlayStaffNotificationSound({ code, soundEnabled: false }),
    false,
  );
}

const individualSoundPreferences = new Map(
  STAFF_NOTIFICATION_DEFINITIONS.map(({ code }) => [code, false]),
);
individualSoundPreferences.set("order_edited", true);
assert.equal(
  shouldPlayStaffNotificationSound({
    code: "order_edited",
    soundEnabled: individualSoundPreferences.get("order_edited"),
  }),
  true,
);
assert.equal(
  shouldPlayStaffNotificationSound({
    code: "order_cancelled",
    soundEnabled: individualSoundPreferences.get("order_cancelled"),
  }),
  false,
);
const staffAPreferences = new Map([
  [
    "order_edited",
    resolveStaffNotificationPreference("order_edited", { soundEnabled: true }),
  ],
  [
    "order_cancelled",
    resolveStaffNotificationPreference("order_cancelled", {
      soundEnabled: false,
    }),
  ],
]);
const staffBPreferences = new Map([
  [
    "order_edited",
    resolveStaffNotificationPreference("order_edited", {
      soundEnabled: false,
    }),
  ],
]);
assert.equal(staffAPreferences.get("order_edited")?.soundEnabled, true);
assert.equal(staffAPreferences.get("order_cancelled")?.soundEnabled, false);
assert.equal(staffBPreferences.get("order_edited")?.soundEnabled, false);
assert.equal(
  resolveStaffNotificationPreference("waiting_list_new_request").soundEnabled,
  false,
);
assert.equal(
  shouldPlayStaffNotificationSound({
    code: "unknown_category",
    soundEnabled: true,
  }),
  false,
);
assert.equal(shouldPlayStaffNotificationSound({ code: "new_order" }), false);
assert.equal(
  shouldPlayStaffNotificationSound({
    code: "new_order",
    soundEnabled: "true" as unknown as boolean,
  }),
  false,
);

const scheduledFrequencies: number[] = [];
const scheduledStarts: number[] = [];
let resumeCalls = 0;
let contextCreations = 0;
let resumeShouldFail = false;
let schedulingShouldFail = false;

class FakeAudioContext {
  static lastCreated: FakeAudioContext | null = null;
  state: AudioContextState = "suspended";
  currentTime = 12;
  destination = {} as AudioDestinationNode;

  constructor() {
    contextCreations += 1;
    FakeAudioContext.lastCreated = this;
  }

  async resume() {
    resumeCalls += 1;
    if (resumeShouldFail) throw new Error("synthetic resume failure");
    this.state = "running";
  }

  createOscillator() {
    return {
      type: "sine" as OscillatorType,
      frequency: {
        setValueAtTime(value: number) {
          scheduledFrequencies.push(value);
        },
      },
      connect() {},
      start(time: number) {
        if (schedulingShouldFail) {
          throw new Error("synthetic scheduling failure");
        }
        scheduledStarts.push(time);
      },
      stop() {},
      disconnect() {},
    } as unknown as OscillatorNode;
  }

  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
      disconnect() {},
    } as unknown as GainNode;
  }
}

async function main() {
  const listener = readFileSync(
    resolve("src/components/shell/StaffNotificationListener.tsx"),
    "utf8",
  );
  assert.match(
    listener,
    /claimStaffNotificationForStaff\(\s*staffId,\s*event\.id,/,
  );
  assert.match(listener, /recoveredStaffNotificationSoundPriority/);
  assert.match(listener, /playStaffNotificationSound\(/);
  const notificationEngine = readFileSync(
    resolve("src/foundation/staff/staff-notification-engine.ts"),
    "utf8",
  );
  assert.match(notificationEngine, /new BroadcastChannel\(/);
  assert.match(notificationEngine, /claimedWebEventIds\.has\(eventId\)/);
  assert.match(notificationEngine, /navigator\.locks/);
  const preferencesAction = readFileSync(
    resolve("src/foundation/staff/notification-preferences-actions.ts"),
    "utf8",
  );
  assert.match(preferencesAction, /sound_enabled: soundEnabled/);
  assert.doesNotMatch(preferencesAction, /code === "new_order"/);
  assert.match(preferencesAction, /staff_id: staff\.id/);
  assert.match(preferencesAction, /soundEnabledValue !== "true"/);
  assert.match(preferencesAction, /soundEnabledValue !== "false"/);
  const preferencesSettings = readFileSync(
    resolve("src/components/settings/NotificationPreferences.tsx"),
    "utf8",
  );
  assert.match(
    preferencesSettings,
    /formData\.set\("sound_enabled", String\(next\.soundEnabled\)\)/,
  );
  assert.doesNotMatch(preferencesSettings, /definition\.code === "new_order"/);
  assert.match(preferencesSettings, /definitions\.map\(\(definition\) =>/);
  assert.match(
    preferencesSettings,
    /onClick=\{\(\) => void testNotificationSound\(\)\}/,
  );
  assert.match(preferencesSettings, /Test Sound/);
  assert.match(preferencesSettings, /without changing preferences/);
  assert.match(
    preferencesSettings,
    /Automatic sounds still follow each category/,
  );

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  const unsupported = await playStaffNotificationSound();
  assert.equal(unsupported.restriction, "unsupported");
  assert.equal(unsupported.playbackStatus, "not-attempted");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });

  const firstPlayback = await playStaffNotificationSound();

  assert.equal(firstPlayback.contextState, "running");
  assert.equal(firstPlayback.resumeStatus, "succeeded");
  assert.equal(firstPlayback.playbackStatus, "scheduled");
  assert.equal(firstPlayback.restriction, "none");
  assert.equal(resumeCalls, 1);
  assert.equal(contextCreations, 1);
  assert.deepEqual(scheduledFrequencies, [880, 660]);
  assert.deepEqual(scheduledStarts, [12, 12.14]);

  primeStaffNotificationSound();
  assert.equal(
    resumeCalls,
    1,
    "priming a running context does not resume it again",
  );
  await playStaffNotificationSound();
  assert.equal(contextCreations, 1, "playback reuses the initialized context");
  assert.equal(resumeCalls, 1, "a running context is not resumed repeatedly");

  // The shared fake context can be suspended again to model Safari backgrounding.
  // A rejected resume is reported safely and does not throw into the caller.
  assert.ok(FakeAudioContext.lastCreated);
  FakeAudioContext.lastCreated.state = "suspended";
  resumeShouldFail = true;
  const rejectedResume = await playStaffNotificationSound();
  assert.equal(rejectedResume.contextState, "suspended");
  assert.equal(rejectedResume.resumeStatus, "failed");
  assert.equal(rejectedResume.playbackStatus, "not-attempted");
  assert.equal(rejectedResume.restriction, "resume-rejected");

  resumeShouldFail = false;
  await playStaffNotificationSound();
  assert.equal(FakeAudioContext.lastCreated.state, "running");
  schedulingShouldFail = true;
  const schedulingFailure = await playStaffNotificationSound();
  assert.equal(schedulingFailure.playbackStatus, "failed");
  assert.equal(schedulingFailure.restriction, "schedule-failed");
  schedulingShouldFail = false;

  const diagnosticStorage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: FakeAudioContext,
      crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000222" },
      sessionStorage: {
        getItem: (key: string) => diagnosticStorage.get(key) ?? null,
        setItem: (key: string, value: string) =>
          diagnosticStorage.set(key, value),
        removeItem: (key: string) => diagnosticStorage.delete(key),
      },
      dispatchEvent: () => true,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { visibilityState: "hidden" },
  });
  const diagnosticContext = {
    eventId: "00000000-0000-4000-8000-000000000223",
    source: "live" as const,
    soundPreferenceEnabled: true,
    soundEligible: true,
  };
  assert.ok(FakeAudioContext.lastCreated);
  FakeAudioContext.lastCreated.state = "suspended";
  resumeShouldFail = false;
  const diagnosticPlayback =
    await playStaffNotificationSound(diagnosticContext);
  assert.equal(diagnosticPlayback.playbackStatus, "scheduled");
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  const soundTrace = readStaffNotificationRecoveryTrace().filter(
    (record) => record.eventId === diagnosticContext.eventId,
  );
  assert.deepEqual(
    soundTrace.map((record) => record.soundStage),
    ["attempt", "result"],
  );
  assert.equal(soundTrace[0]?.tabId, "00000000-0000-4000-8000-000000000222");
  assert.equal(soundTrace[0]?.visibilityState, "hidden");
  assert.equal(soundTrace[0]?.soundOwnership, "winner");
  assert.equal(soundTrace[0]?.soundPreferenceEnabled, true);
  assert.equal(soundTrace[0]?.soundEligible, true);
  assert.equal(soundTrace[0]?.audioContextBefore, "suspended");
  assert.equal(soundTrace[0]?.soundResumeAttempted, true);
  assert.equal(soundTrace[1]?.soundResumeOutcome, "succeeded");
  assert.equal(soundTrace[1]?.audioContextAfter, "running");
  assert.equal(soundTrace[1]?.soundPlaybackOutcome, "scheduled");

  const startsBeforeSuppressed = scheduledStarts.length;
  recordStaffNotificationSoundOwnership({
    ...diagnosticContext,
    eventId: "00000000-0000-4000-8000-000000000224",
    ownership: "duplicate_suppressed",
  });
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  const duplicateSoundTrace = readStaffNotificationRecoveryTrace().find(
    (record) => record.eventId === "00000000-0000-4000-8000-000000000224",
  );
  assert.equal(duplicateSoundTrace?.soundOwnership, "duplicate_suppressed");
  assert.equal(duplicateSoundTrace?.soundPlaybackOutcome, "not_attempted");
  assert.equal(scheduledStarts.length, startsBeforeSuppressed);

  FakeAudioContext.lastCreated.state = "suspended";
  resumeShouldFail = true;
  const failedDiagnosticPlayback = await playStaffNotificationSound({
    ...diagnosticContext,
    eventId: "00000000-0000-4000-8000-000000000225",
  });
  assert.equal(failedDiagnosticPlayback.playbackStatus, "not-attempted");
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  const failedSoundTrace = readStaffNotificationRecoveryTrace().filter(
    (record) => record.eventId === "00000000-0000-4000-8000-000000000225",
  );
  assert.equal(failedSoundTrace.at(-1)?.soundResumeOutcome, "rejected");
  assert.equal(failedSoundTrace.at(-1)?.soundPlaybackOutcome, "not_attempted");
  assert.equal(failedSoundTrace.at(-1)?.audioContextAfter, "suspended");
  assert.ok(diagnosticStorage.has(STAFF_NOTIFICATION_RECOVERY_TRACE_KEY));
  resumeShouldFail = false;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: undefined,
  });
  const noWindowPlayback = await playStaffNotificationSound();
  assert.equal(noWindowPlayback.restriction, "unsupported");
  assert.equal(noWindowPlayback.playbackStatus, "not-attempted");

  console.log(
    "Staff sound winner correlation, audio lifecycle diagnostics, dedupe, gesture, shared context and preference regressions: PASS",
  );
}

void main();
