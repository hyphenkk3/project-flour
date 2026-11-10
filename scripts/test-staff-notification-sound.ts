import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  playStaffNotificationSound,
  primeStaffNotificationSound,
  shouldPlayStaffNotificationSound,
} from "../src/foundation/staff/staff-notification-sound";
import { STAFF_NOTIFICATION_DEFAULT_SOUND_ENABLED } from "../src/foundation/staff/notification-preferences";

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
  false,
);

const scheduledFrequencies: number[] = [];
const scheduledStarts: number[] = [];
let resumeCalls = 0;

class FakeAudioContext {
  state: AudioContextState = "suspended";
  currentTime = 12;
  destination = {} as AudioDestinationNode;

  async resume() {
    resumeCalls += 1;
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
        scheduledStarts.push(time);
      },
      stop() {},
    } as unknown as OscillatorNode;
  }

  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
    } as unknown as GainNode;
  }
}

async function main() {
  const listener = readFileSync(
    resolve("src/components/shell/StaffNotificationListener.tsx"),
    "utf8",
  );
  assert.match(listener, /tryClaimStaffNotification\(event\.id\)/);
  assert.match(listener, /playStaffNotificationSound\(\)/);
  const notificationEngine = readFileSync(
    resolve("src/foundation/staff/staff-notification-engine.ts"),
    "utf8",
  );
  assert.match(notificationEngine, /new BroadcastChannel\(/);
  assert.match(notificationEngine, /claimedWebEventIds\.has\(eventId\)/);

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });

  primeStaffNotificationSound();
  await playStaffNotificationSound();

  assert.equal(resumeCalls, 1);
  assert.deepEqual(scheduledFrequencies, [880, 660]);
  assert.deepEqual(scheduledStarts, [12, 12.14]);

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: undefined,
  });
  await playStaffNotificationSound();

  console.log(
    "Staff new-order sound preference and browser-failure fallback: PASS",
  );
}

void main();
