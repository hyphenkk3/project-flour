import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  playStaffNotificationSound,
  shouldPlayStaffNotificationSound,
} from "../src/foundation/staff/staff-notification-sound";
import { STAFF_NOTIFICATION_DEFAULT_SOUND_ENABLED } from "../src/foundation/staff/notification-preferences";

type FakeNode = {
  connectedTo: unknown[];
  disconnected: boolean;
  startAt?: number;
  stopAt?: number;
  onended?: () => void;
  type?: string;
  frequency: { setValueAtTime: (value: number, at: number) => void };
  gain: {
    setValueAtTime: (value: number, at: number) => void;
    exponentialRampToValueAtTime: (value: number, at: number) => void;
  };
  connect: (node: unknown) => void;
  disconnect: () => void;
  start: (at: number) => void;
  stop: (at: number) => void;
};

const createdNodes: FakeNode[] = [];
let contextInstances = 0;
let resumeMode: "success" | "reject" = "success";
let failScheduling = false;
const contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state: "running" | "suspended" | "closed" = "running";
  currentTime = 7;
  destination = { id: "destination" };
  constructor() {
    contextInstances += 1;
    contexts.push(this);
  }
  resume() {
    return resumeMode === "success"
      ? Promise.resolve().then(() => {
          this.state = "running";
        })
      : Promise.reject(new Error("browser restriction"));
  }
  createOscillator(): FakeNode {
    const node: FakeNode = {
      connectedTo: [],
      disconnected: false,
      frequency: { setValueAtTime: () => undefined },
      gain: {
        setValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
      },
      connect(target) {
        this.connectedTo.push(target);
      },
      disconnect() {
        this.disconnected = true;
      },
      start(at) {
        if (failScheduling) throw new Error("mock scheduling failure");
        this.startAt = at;
      },
      stop(at) {
        this.stopAt = at;
      },
    };
    createdNodes.push(node);
    return node;
  }
  createGain(): FakeNode {
    const node: FakeNode = {
      connectedTo: [],
      disconnected: false,
      frequency: { setValueAtTime: () => undefined },
      gain: {
        setValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
      },
      connect(target) {
        this.connectedTo.push(target);
      },
      disconnect() {
        this.disconnected = true;
      },
      start: () => undefined,
      stop: () => undefined,
    };
    createdNodes.push(node);
    return node;
  }
}

const diagnostics: Array<Record<string, unknown>> = [];
const originalInfo = console.info;
console.info = (_message?: unknown, detail?: unknown) => {
  if (detail && typeof detail === "object")
    diagnostics.push(detail as Record<string, unknown>);
};
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    AudioContext: FakeAudioContext,
    setTimeout,
    clearTimeout,
    crypto: { randomUUID: () => "opaque-tab-test" },
  },
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { visibilityState: "visible" },
});

assert.equal(STAFF_NOTIFICATION_DEFAULT_SOUND_ENABLED, false);
assert.equal(
  shouldPlayStaffNotificationSound({ code: "new_order", soundEnabled: false }),
  false,
);
assert.equal(
  shouldPlayStaffNotificationSound({ code: "new_order", soundEnabled: true }),
  true,
);
assert.equal(
  shouldPlayStaffNotificationSound({ code: "unknown", soundEnabled: true }),
  false,
);

const preferenceQuery = readFileSync(
  resolve("src/foundation/staff/notification-preferences-queries.ts"),
  "utf8",
);
const preferenceAction = readFileSync(
  resolve("src/foundation/staff/notification-preferences-actions.ts"),
  "utf8",
);
const listener = readFileSync(
  resolve("src/components/shell/StaffNotificationListener.tsx"),
  "utf8",
);
const soundMigration = readFileSync(
  resolve(
    "supabase/migrations/20261109110501_staff_notification_sound_preference.sql",
  ),
  "utf8",
);
const privilegeMigration = readFileSync(
  resolve(
    "supabase/migrations/20261109213004_staff_notification_preferences_revoke_client_truncate.sql",
  ),
  "utf8",
);
assert.match(preferenceQuery, /sound_enabled/);
assert.match(preferenceAction, /sound_enabled/);
assert.match(preferenceAction, /soundEnabledValue\s*\?/);
assert.match(listener, /preference\.soundEnabled === true/);
assert.match(listener, /claimStaffNotificationForStaff/);
assert.match(listener, /ownership: "duplicate_suppressed"/);
assert.match(
  soundMigration,
  /add column if not exists sound_enabled boolean not null default false/i,
);
assert.match(
  privilegeMigration,
  /revoke truncate .* from anon, authenticated/i,
);
assert.doesNotMatch(
  privilegeMigration,
  /revoke\s+(select|insert|update|delete)/i,
);

const first = await playStaffNotificationSound({
  eventId: "10000000-0000-4000-8000-000000000001",
  ownership: "winner",
  soundEnabled: true,
  eligible: true,
});
assert.equal(first.playback, "scheduled");
assert.equal(first.contextState, "running");
assert.equal(contextInstances, 1);
assert.equal(createdNodes.length, 4);
assert.equal(createdNodes[0].connectedTo.length, 1);
assert.deepEqual(createdNodes[1].connectedTo, [{ id: "destination" }]);
assert.equal(createdNodes[0].startAt, 7);
assert.equal(createdNodes[2].startAt, 7.14);
assert.equal(createdNodes[0].stopAt, 7.13);
assert.equal(diagnostics.at(-1)?.playback, "scheduled");
assert.equal(
  diagnostics.at(-1)?.eventId,
  "10000000-0000-4000-8000-000000000001",
);
assert.equal(diagnostics.at(-1)?.tabId, "opaque-tab-test");
assert.equal("payload" in (diagnostics.at(-1) ?? {}), false);

const contextsBeforeReuse = contextInstances;
contexts[0].state = "suspended";
resumeMode = "success";
const resumed = await playStaffNotificationSound({
  eventId: "10000000-0000-4000-8000-000000000002",
  ownership: "winner",
  soundEnabled: true,
  eligible: true,
});
assert.equal(resumed.resume, "succeeded");
assert.equal(resumed.playback, "scheduled");
assert.equal(
  contextInstances,
  contextsBeforeReuse,
  "same audio context is reused",
);

contexts[0].state = "suspended";
resumeMode = "reject";
const scheduledBeforeRejectedResume = createdNodes.length;
const rejectedResume = await playStaffNotificationSound({
  eventId: "10000000-0000-4000-8000-000000000003",
  ownership: "winner",
  soundEnabled: true,
  eligible: true,
});
assert.equal(rejectedResume.resume, "failed");
assert.equal(rejectedResume.playback, "not-attempted");
assert.equal(createdNodes.length, scheduledBeforeRejectedResume);

contexts[0].state = "running";
failScheduling = true;
const schedulingFailure = await playStaffNotificationSound({
  eventId: "10000000-0000-4000-8000-000000000004",
  ownership: "winner",
  soundEnabled: true,
  eligible: true,
});
assert.equal(schedulingFailure.playback, "failed");
assert.equal(schedulingFailure.restriction, "schedule-failed");
assert.equal(
  createdNodes.slice(-2).every((node) => node.disconnected),
  true,
);
assert.equal(
  diagnostics.every(
    (record) =>
      !Object.keys(record).some((key) =>
        /staff|customer|payload|token|url|message/i.test(key),
      ),
  ),
  true,
  "audio diagnostics contain no sensitive record fields",
);

const resumeTestPath = readFileSync(
  resolve("src/foundation/staff/staff-notification-sound.ts"),
  "utf8",
);
assert.match(resumeTestPath, /audio\.resume\(\)/);
assert.match(resumeTestPath, /Promise\.race/);
assert.match(resumeTestPath, /context\.state === "closed"/);
assert.doesNotMatch(resumeTestPath, /setInterval|while\s*\(/);
console.info = originalInfo;
console.log(
  "PASS staff notification Sound tranche 1: default-off, shared helper path, node routing, scheduling and sanitized diagnostics",
);
