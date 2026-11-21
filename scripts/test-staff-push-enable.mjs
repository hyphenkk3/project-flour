import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  matchesApplicationServerKey,
  subscribeCurrentStaffDevice,
} from "../src/foundation/staff/staff-notification-push-client.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientSource = readFileSync(
  resolve(root, "src/foundation/staff/staff-notification-push-client.ts"),
  "utf8",
);
const preferencesSource = readFileSync(
  resolve(root, "src/components/settings/NotificationPreferences.tsx"),
  "utf8",
);
const preferenceActionSource = readFileSync(
  resolve(root, "src/foundation/staff/notification-preferences-actions.ts"),
  "utf8",
);

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function appKey(seed) {
  return Uint8Array.from({ length: 65 }, (_, index) =>
    index === 0 ? 4 : (seed + index) % 256,
  );
}

function subscription(keyBytes, endpointSuffix = "device") {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${"x".repeat(80)}-${endpointSuffix}`,
    expirationTime: null,
    options: { applicationServerKey: keyBytes.buffer },
    async unsubscribe() {
      this.unsubscribed = true;
      return true;
    },
    toJSON() {
      return {
        endpoint: this.endpoint,
        keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
      };
    },
  };
}

function installBrowser({
  permission = "granted",
  existing = null,
  workerError = null,
  subscribeError = null,
} = {}) {
  let subscribeCalls = 0;
  const registration = {
    pushManager: {
      async getSubscription() {
        return existing;
      },
      async subscribe(options) {
        subscribeCalls += 1;
        if (subscribeError) throw subscribeError;
        assert.equal(options.userVisibleOnly, true);
        assert.equal(
          matchesApplicationServerKey(options.applicationServerKey, expected),
          true,
        );
        return subscription(expected, "new");
      },
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { PushManager: {}, Notification: {}, atob: globalThis.atob },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: {
        async getRegistration() {
          return workerError ? null : registration;
        },
        async register() {
          if (workerError) throw workerError;
          return registration;
        },
        ready: Promise.resolve(registration),
      },
    },
  });
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: {
      permission,
      async requestPermission() {
        return permission;
      },
    },
  });
  return { registration, getSubscribeCalls: () => subscribeCalls };
}

const expected = appKey(9);
const stale = appKey(44);
assert.equal(
  matchesApplicationServerKey(expected.buffer, expected.buffer),
  true,
);
assert.equal(matchesApplicationServerKey(stale.buffer, expected.buffer), false);
assert.equal(matchesApplicationServerKey(null, expected.buffer), false);

// New device: creates exactly one subscription with the configured key.
let browser = installBrowser();
let result = await subscribeCurrentStaffDevice({
  applicationServerKey: toBase64Url(expected),
});
assert.equal(result.error, null);
assert.equal(result.created, true);
assert.equal(browser.getSubscribeCalls(), 1);

// Invalid deployment key is classified as configuration, not permission.
browser = installBrowser();
result = await subscribeCurrentStaffDevice({
  applicationServerKey: "not-a-key",
});
assert.equal(result.errorCode, "push_configuration_invalid");
assert.equal(browser.getSubscribeCalls(), 0);

// Compatible device: preserves and reuses the existing subscription.
browser = installBrowser({ existing: subscription(expected, "compatible") });
result = await subscribeCurrentStaffDevice({
  applicationServerKey: toBase64Url(expected),
});
assert.equal(result.error, null);
assert.equal(result.created, false);
assert.match(result.subscription.endpoint, /compatible$/);
assert.equal(browser.getSubscribeCalls(), 0);

// Stale VAPID key: identifies only this browser endpoint; no silent reuse or mutation.
const staleDevice = subscription(stale, "stale");
browser = installBrowser({ existing: staleDevice });
result = await subscribeCurrentStaffDevice({
  applicationServerKey: toBase64Url(expected),
});
assert.equal(result.errorCode, "vapid_key_mismatch");
assert.equal(result.staleEndpoint, staleDevice.endpoint);
assert.equal(staleDevice.unsubscribed, undefined);
assert.equal(browser.getSubscribeCalls(), 0);

// Denied permission and service-worker/subscription failures have distinct safe outcomes.
installBrowser({ permission: "denied" });
result = await subscribeCurrentStaffDevice({
  applicationServerKey: toBase64Url(expected),
});
assert.equal(result.errorCode, "permission_denied");
assert.match(result.error, /iPhone Settings/);

installBrowser({ workerError: new Error("private path must not escape") });
result = await subscribeCurrentStaffDevice({
  applicationServerKey: toBase64Url(expected),
});
assert.equal(result.errorCode, "service_worker_registration_failed");
assert.doesNotMatch(result.error, /private path/);

installBrowser({
  subscribeError: new Error("subscription secret must not escape"),
});
result = await subscribeCurrentStaffDevice({
  applicationServerKey: toBase64Url(expected),
});
assert.equal(result.errorCode, "subscription_create_failed");
assert.doesNotMatch(result.error, /subscription secret/);

// Preference failure restores the previous UI state and always clears Saving.
assert.match(
  preferencesSource,
  /if \(!preferenceSaved\) setPreferences\(previous\)/,
);
assert.match(preferencesSource, /finally\s*\{\s*setSaving\(null\);/);
assert.match(
  preferencesSource,
  /The preference save result could not be confirmed/,
);
assert.match(
  preferencesSource,
  /if \(subscribed\.errorCode === "vapid_key_mismatch"\)/,
);
assert.match(
  preferencesSource,
  /revokeStaffPushSubscriptionAction\(staleEndpoint\)/,
);
assert.match(preferencesSource, /await unsubscribeCurrentStaffDevice\(\)/);
assert.match(
  preferenceActionSource,
  /The notification preference was not saved/,
);
assert.doesNotMatch(preferenceActionSource, /error\.message/);

console.log("PUSH_ENABLE_COMPATIBILITY_TESTS=PASS cases=8");
