"use client";

export type BrowserStaffPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

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

export async function subscribeCurrentStaffDevice(input: {
  applicationServerKey: string;
}): Promise<
  | { subscription: BrowserStaffPushSubscription; error: null }
  | { subscription: null; error: string }
> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return {
      subscription: null,
      error: "Push is not supported by this browser.",
    };
  }
  if (!input.applicationServerKey.trim()) {
    return {
      subscription: null,
      error: "Push is not configured for this site yet.",
    };
  }

  try {
    // Request permission directly in response to the staff member's click.
    const permissionPromise =
      Notification.permission === "granted"
        ? Promise.resolve<NotificationPermission>("granted")
        : Notification.requestPermission();
    const permission = await permissionPromise;
    if (permission !== "granted") {
      return {
        subscription: null,
        error:
          permission === "denied"
            ? "Notifications are blocked in this browser's site settings."
            : "Allow notifications to enable staff push.",
      };
    }

    const registration =
      (await navigator.serviceWorker.getRegistration("/")) ??
      (await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }));
    await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKeyBytes(
          input.applicationServerKey,
        ) as BufferSource,
      }));
    const serialized = subscription.toJSON();
    if (
      !serialized.endpoint ||
      !serialized.keys?.p256dh ||
      !serialized.keys.auth
    ) {
      return {
        subscription: null,
        error: "The browser returned an incomplete push subscription.",
      };
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
    };
  } catch {
    return {
      subscription: null,
      error: "This device could not subscribe to staff push notifications.",
    };
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
