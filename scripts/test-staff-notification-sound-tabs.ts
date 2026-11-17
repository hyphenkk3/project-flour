import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const storage = new Map<string, string>();
const lockTails = new Map<string, Promise<void>>();
const createdContexts: FakeAudioContext[] = [];
const scheduledEventIds: string[] = [];
const nextStates: Array<"running" | "suspended"> = [];

class SharedLocalStorage {
  getItem(key: string) {
    return storage.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    storage.set(key, value);
  }
}

class FakeAudioNode {
  onended?: () => void;
  frequency = { setValueAtTime: () => undefined };
  gain = {
    setValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  };

  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}

class FakeAudioContext {
  state: "running" | "suspended" | "closed" = nextStates.shift() ?? "running";
  currentTime = 1;
  destination = {};

  constructor() {
    createdContexts.push(this);
  }

  resume() {
    this.state = "running";
    return Promise.resolve();
  }

  createOscillator() {
    return new FakeAudioNode();
  }

  createGain() {
    return new FakeAudioNode();
  }
}

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    AudioContext: FakeAudioContext,
    localStorage: new SharedLocalStorage(),
    crypto: { randomUUID: () => "tab-test" },
    setTimeout,
    clearTimeout,
  },
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { visibilityState: "visible" },
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    locks: {
      async request(name: string, callback: () => unknown) {
        const previous = lockTails.get(name) ?? Promise.resolve();
        let release!: () => void;
        const next = new Promise<void>((resolveNext) => {
          release = resolveNext;
        });
        const tail = previous.then(() => next);
        lockTails.set(name, tail);
        await previous;
        try {
          return await callback();
        } finally {
          release();
          if (lockTails.get(name) === tail) lockTails.delete(name);
        }
      },
    },
  },
});

const [engineA, engineB] = await Promise.all([
  import("../src/foundation/staff/staff-notification-engine.ts?tab-a"),
  import("../src/foundation/staff/staff-notification-engine.ts?tab-b"),
]);
const [soundA, soundB] = await Promise.all([
  import("../src/foundation/staff/staff-notification-sound.ts?tab-a"),
  import("../src/foundation/staff/staff-notification-sound.ts?tab-b"),
]);

// A user gesture (the Settings Test Sound action) unlocks each tab's own
// AudioContext. Clear those manual test cues before event assertions.
await soundA.playStaffNotificationSound({ eventId: "manual-tab-a" });
await soundB.playStaffNotificationSound({ eventId: "manual-tab-b" });
scheduledEventIds.length = 0;

const attempt = (
  engine: typeof engineA,
  sound: typeof soundA,
  eventId: string,
) =>
  engine.claimStaffNotificationForStaff(
    "owner-staff",
    `sound:${eventId}`,
    () => {
      const result = sound.scheduleStaffNotificationSoundIfReady({
        eventId,
        ownership: "winner",
        soundEnabled: true,
        eligible: true,
      });
      if (result.playback !== "scheduled") throw new Error("sound_not_ready");
      scheduledEventIds.push(eventId);
    },
  );

const oneTabFirst = await attempt(engineA, soundA, "event-one-tab");
const oneTabDuplicate = await attempt(engineA, soundA, "event-one-tab");
assert.equal(oneTabFirst.claimed, true);
assert.equal(oneTabDuplicate.claimed, false);
assert.equal(scheduledEventIds.length, 1, "one two-note cue is scheduled");
scheduledEventIds.length = 0;

const twoReady = await Promise.all([
  attempt(engineA, soundA, "event-two-ready-tabs"),
  attempt(engineB, soundB, "event-two-ready-tabs"),
]);
assert.equal(twoReady.filter((result) => result.claimed).length, 1);
assert.equal(
  scheduledEventIds.length,
  1,
  "exactly one two-note cue is scheduled across two tabs",
);
scheduledEventIds.length = 0;

createdContexts[0].state = "suspended";
createdContexts[1].state = "running";
const fallback = await Promise.all([
  attempt(engineA, soundA, "event-fallback-tab"),
  attempt(engineB, soundB, "event-fallback-tab"),
]);
assert.equal(fallback[0].presentationFailed, true);
assert.equal(fallback[1].claimed, true);
assert.equal(
  scheduledEventIds.length,
  1,
  "an unready first tab releases the event for the ready tab",
);
scheduledEventIds.length = 0;

createdContexts[0].state = "suspended";
createdContexts[1].state = "suspended";
const blocked = await Promise.all([
  attempt(engineA, soundA, "event-unready-tabs"),
  attempt(engineB, soundB, "event-unready-tabs"),
]);
assert.equal(
  blocked.every((result) => result.presentationFailed),
  true,
);
assert.equal(scheduledEventIds.length, 0);
createdContexts[1].state = "running";
const laterReady = await attempt(engineB, soundB, "event-unready-tabs");
assert.equal(laterReady.claimed, true);
assert.equal(scheduledEventIds.length, 1);

const listener = readFileSync(
  resolve("src/components/shell/StaffNotificationListener.tsx"),
  "utf8",
);
const preferences = readFileSync(
  resolve("src/foundation/staff/notification-preferences.ts"),
  "utf8",
);
assert.match(listener, /scheduleStaffNotificationSoundIfReady/);
assert.match(listener, /`sound:\$\{event\.id\}`/);
assert.match(
  preferences,
  /STAFF_NOTIFICATION_DEFAULT_SOUND_ENABLED\s*=\s*false/,
);

console.log(
  "PASS Sound tab claims: single-tab, two-tab duplicate suppression, unready-tab fallback, retry after unlock, and default OFF",
);
