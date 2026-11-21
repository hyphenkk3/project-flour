"use client";

export type BrowserStaffPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

export type StaffPushEnableFailureCode =
  | "push_unsupported"
  | "permission_denied"
  | "permission_not_granted"
  | "service_worker_registration_failed"
  | "subscription_lookup_failed"
  | "subscription_key_unavailable"
  | "vapid_key_mismatch"
  | "subscription_create_failed"
  | "subscription_incomplete"
  | "push_configuration_invalid";

function applicationServerKeyBytes(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer as ArrayBuffer;
}

export function matchesApplicationServerKey(
  existingValue: BufferSource | null,
  expectedValue: BufferSource,
): boolean {
  if (!existingValue) return false;
  const toBytes = (value: BufferSource) =>
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const existing = toBytes(existingValue);
  const expected = toBytes(expectedValue);
  if (existing.byteLength !== expected.byteLength) return false;
  return existing.every((value, index) => value === expected[index]);
}

type SubscribeResult =
  | {
      subscription: BrowserStaffPushSubscription;
      error: null;
      errorCode: null;
      created: boolean;
    }
  | {
      subscription: null;
      error: string;
      errorCode: StaffPushEnableFailureCode;
      staleEndpoint?: string;
      created: false;
    };

function failed(
  errorCode: StaffPushEnableFailureCode,
  error: string,
  staleEndpoint?: string,
): SubscribeResult {
  return {
    subscription: null,
    error,
    errorCode,
    staleEndpoint,
    created: false,
  };
}

export async function subscribeCurrentStaffDevice(input: {
  applicationServerKey: string;
}): Promise<SubscribeResult> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return failed(
      "push_unsupported",
      "Push is not supported in this browser. Open the installed Home Screen app on a supported iPhone or browser.",
    );
  }
  let stage:
    | "permission"
    | "service_worker"
    | "subscription_lookup"
    | "subscription_create" = "permission";
  try {
    if (!input.applicationServerKey.trim()) {
      return failed(
        "push_configuration_invalid",
        "Push is not configured for this Preview. Contact the project owner.",
      );
    }
    let expectedKey: ArrayBuffer;
    try {
      expectedKey = applicationServerKeyBytes(input.applicationServerKey);
    } catch {
      return failed(
        "push_configuration_invalid",
        "The Push key configured for this Preview is invalid. Contact the project owner.",
      );
    }
    if (expectedKey.byteLength !== 65 || new Uint8Array(expectedKey)[0] !== 4) {
      return failed(
        "push_configuration_invalid",
        "The Push key configured for this Preview is invalid. Contact the project owner.",
      );
    }

    // Request permission directly in response to the staff member's click.
    const permissionPromise =
      Notification.permission === "granted"
        ? Promise.resolve<NotificationPermission>("granted")
        : Notification.requestPermission();
    const permission = await permissionPromise;
    if (permission !== "granted") {
      return permission === "denied"
        ? failed(
            "permission_denied",
            "Notifications are blocked for this Preview. Allow them in iPhone Settings, then try again.",
          )
        : failed(
            "permission_not_granted",
            "Allow notifications for this Preview, then try again.",
          );
    }

    stage = "service_worker";
    const registration =
      (await navigator.serviceWorker.getRegistration("/")) ??
      (await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }));
    await navigator.serviceWorker.ready;

    stage = "subscription_lookup";
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const existingKey = existing.options.applicationServerKey;
      if (!existingKey) {
        return failed(
          "subscription_key_unavailable",
          "This device has an older Push registration that cannot be verified. Turn Push off for this device, then enable it again.",
        );
      }
      if (!matchesApplicationServerKey(existingKey, expectedKey)) {
        return failed(
          "vapid_key_mismatch",
          "This device's Push registration uses an older key and must be replaced. The old device registration will be retired before creating a new one.",
          existing.endpoint,
        );
      }
    }

    let created = false;
    let subscription = existing;
    if (!subscription) {
      stage = "subscription_create";
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey as BufferSource,
      });
      created = true;
    }
    const serialized = subscription.toJSON();
    if (
      !serialized.endpoint ||
      !serialized.keys?.p256dh ||
      !serialized.keys.auth
    ) {
      return failed(
        "subscription_incomplete",
        "The browser returned incomplete Push details. Refresh the Home Screen app and try again.",
      );
    }

    return {
      subscription: {
        endpoint: serialized.endpoint,
        expirationTime: subscription.expirationTime,
        keys: {
          p256dh: serialized.keys.p256dh,
          auth: serialized.keys.auth,
        },
      },
      error: null,
      errorCode: null,
      created,
    };
  } catch {
    if (stage === "permission") {
      return failed(
        "permission_not_granted",
        "iPhone could not request notification permission. Check Safari notification settings and try again.",
      );
    }
    if (stage === "service_worker") {
      return failed(
        "service_worker_registration_failed",
        "The Preview could not start its notification worker. Close and reopen the Home Screen app, then try again.",
      );
    }
    if (stage === "subscription_lookup") {
      return failed(
        "subscription_lookup_failed",
        "The Preview could not check this device's Push registration. Refresh the Home Screen app and try again.",
      );
    }
    return failed(
      "subscription_create_failed",
      "The browser could not create a Push registration. Check notification permission and try again.",
    );
  }
}

export async function unsubscribeCurrentStaffDevice(): Promise<{
  endpoint: string | null;
  success: boolean;
}> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { endpoint: null, success: true };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return { endpoint: null, success: true };
    const endpoint = subscription.endpoint;
    const success = await subscription.unsubscribe();
    return { endpoint, success };
  } catch {
    return { endpoint: null, success: false };
  }
}

export async function currentStaffDeviceEndpoint(): Promise<string | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

export async function currentStaffDeviceSubscription(): Promise<BrowserStaffPushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    const serialized = subscription?.toJSON();
    if (
      !serialized?.endpoint ||
      !serialized.keys?.p256dh ||
      !serialized.keys.auth
    ) {
      return null;
    }
    return {
      endpoint: serialized.endpoint,
      expirationTime: subscription?.expirationTime ?? null,
      keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
    };
  } catch {
    return null;
  }
}
