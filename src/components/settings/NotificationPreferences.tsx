"use client";

import { useState } from "react";

import { saveStaffNotificationPreferenceAction } from "@/foundation/staff/notification-preferences-actions";
import {
  registerStaffPushSubscriptionAction,
  revokeStaffPushSubscriptionAction,
} from "@/foundation/staff/staff-notification-push-actions";
import {
  playStaffNotificationSound,
  primeStaffNotificationSound,
} from "@/foundation/staff/staff-notification-sound";
import {
  currentStaffDeviceEndpoint,
  subscribeCurrentStaffDevice,
  unsubscribeCurrentStaffDevice,
} from "@/foundation/staff/staff-notification-push-client";

import type {
  StaffNotificationDefinition,
  StaffNotificationPreference,
  StaffNotificationWebMode,
} from "@/foundation/staff/notification-preferences";

type NotificationPreferencesProps = {
  definitions: readonly StaffNotificationDefinition[];
  initialPreferences: StaffNotificationPreference[];
  emailNotificationsPaused: boolean;
  pushApplicationServerKey: string;
};

class PreferenceOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreferenceOperationError";
  }
}

export function NotificationPreferences({
  definitions,
  initialPreferences,
  emailNotificationsPaused,
  pushApplicationServerKey,
}: NotificationPreferencesProps) {
  const [preferences, setPreferences] =
    useState<StaffNotificationPreference[]>(initialPreferences);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundTestResult, setSoundTestResult] = useState<string | null>(null);

  async function savePreference(
    definition: StaffNotificationDefinition,
    patch: Partial<StaffNotificationPreference>,
  ) {
    if (patch.soundEnabled === true) {
      // Unlock iOS Web Audio in the same direct tap that enables Sound.
      primeStaffNotificationSound();
    }
    const previous = preferences;

    setError(null);
    setSaving(definition.code);

    const nextPreferences = preferences.map((preference) =>
      preference.code === definition.code
        ? { ...preference, ...patch }
        : preference,
    );

    setPreferences(nextPreferences);

    const next = nextPreferences.find(
      (preference) => preference.code === definition.code,
    );

    if (!next) {
      setSaving(null);
      return;
    }

    let registeredPushEndpoint: string | null = null;
    let createdBrowserSubscription = false;
    let registrationAttempted = false;
    let preferenceSaved = false;
    try {
      if (patch.pushEnabled === true) {
        let subscribed = await subscribeCurrentStaffDevice({
          applicationServerKey: pushApplicationServerKey,
        });

        if (subscribed.errorCode === "vapid_key_mismatch") {
          const staleEndpoint = subscribed.staleEndpoint;
          if (!staleEndpoint) {
            throw new PreferenceOperationError(
              "This device's old Push registration could not be safely identified. Turn Push off for this device, then enable it again.",
            );
          }

          let revoked: { error: string | null };
          try {
            revoked = await revokeStaffPushSubscriptionAction(staleEndpoint);
          } catch {
            throw new PreferenceOperationError(
              "The Preview could not retire this device's old Push registration. No replacement was created; refresh and try again.",
            );
          }
          if (revoked.error) {
            throw new PreferenceOperationError(revoked.error);
          }

          const removed = await unsubscribeCurrentStaffDevice();
          if (!removed.success) {
            throw new PreferenceOperationError(
              "The old device registration was retired, but iPhone could not remove it locally. Close and reopen the Home Screen app, then try again.",
            );
          }

          subscribed = await subscribeCurrentStaffDevice({
            applicationServerKey: pushApplicationServerKey,
          });
        }

        if (!subscribed.subscription) {
          throw new PreferenceOperationError(subscribed.error);
        }

        createdBrowserSubscription = subscribed.created;
        registrationAttempted = true;
        let registered: { error: string | null };
        try {
          registered = await registerStaffPushSubscriptionAction(
            subscribed.subscription,
          );
        } catch {
          throw new PreferenceOperationError(
            "The Preview could not complete the device registration request. Confirm you are signed in, refresh, and try again.",
          );
        }
        if (registered.error) {
          throw new PreferenceOperationError(registered.error);
        }
        registeredPushEndpoint = subscribed.subscription.endpoint;
      }

      const formData = new FormData();
      formData.set("notification_code", definition.code);
      formData.set("web_enabled", String(next.webEnabled));
      formData.set("web_mode", next.webMode);
      formData.set("sound_enabled", String(next.soundEnabled));
      formData.set("push_enabled", String(next.pushEnabled));
      if (!emailNotificationsPaused) {
        formData.set("email_enabled", String(next.emailEnabled));
      }

      let result: { error: string | null };
      try {
        result = await saveStaffNotificationPreferenceAction(formData);
      } catch {
        throw new PreferenceOperationError(
          "The preference save result could not be confirmed. Refresh the Home Screen app to check the saved setting before retrying.",
        );
      }
      if (result.error) {
        throw new PreferenceOperationError(result.error);
      }
      preferenceSaved = true;

      if (
        patch.pushEnabled === false &&
        !nextPreferences.some((preference) => preference.pushEnabled)
      ) {
        const endpoint = await currentStaffDeviceEndpoint();
        if (endpoint) {
          const revoked = await revokeStaffPushSubscriptionAction(endpoint);
          if (revoked.error) {
            throw new PreferenceOperationError(revoked.error);
          }
          const removed = await unsubscribeCurrentStaffDevice();
          if (!removed.success) {
            throw new PreferenceOperationError(
              "Push was turned off, but iPhone could not remove its local registration. Reopen the Home Screen app and check the setting.",
            );
          }
        }
      }
    } catch (error) {
      if (!preferenceSaved) setPreferences(previous);
      const safeMessage =
        error instanceof PreferenceOperationError
          ? error.message
          : "Push settings could not be saved because the request did not complete. Refresh the Home Screen app, confirm you are signed in, and try again.";

      let cleanupFailed = false;
      try {
        if (createdBrowserSubscription) {
          const endpoint =
            registeredPushEndpoint ?? (await currentStaffDeviceEndpoint());
          if (endpoint && registrationAttempted) {
            const revoked = await revokeStaffPushSubscriptionAction(endpoint);
            if (revoked.error) cleanupFailed = true;
          }
          const removed = await unsubscribeCurrentStaffDevice();
          if (!removed.success) cleanupFailed = true;
        }
      } catch {
        cleanupFailed = true;
      }

      setError(
        cleanupFailed
          ? `${safeMessage} The device registration could not be fully cleaned up; refresh before trying again.`
          : safeMessage,
      );
    } finally {
      setSaving(null);
    }
  }

  function updateWebMode(
    definition: StaffNotificationDefinition,
    mode: StaffNotificationWebMode,
  ) {
    void savePreference(definition, { webMode: mode });
  }

  async function testSound() {
    setSoundTestResult("Playing test cue…");
    const result = await playStaffNotificationSound({ eventId: "manual-test" });
    setSoundTestResult(
      result.playback === "scheduled"
        ? `Audio check: context ${result.contextStateBefore} → ${result.contextState}; resume ${result.resume}; cue ${result.playback}. Confirm that you can hear it.`
        : `Audio check: context ${result.contextStateBefore} → ${result.contextState}; resume ${result.resume}; cue ${result.playback}; restriction ${result.restriction}.`,
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="border-fog flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3">
        <div>
          <p className="text-ink text-sm font-medium">Sound check</p>
          <p className="text-skyline mt-0.5 text-xs">
            Play one manual cue without changing preferences or sending a
            notification.
          </p>
          {soundTestResult ? (
            <p className="text-skyline mt-1 text-xs" role="status">
              {soundTestResult}
            </p>
          ) : null}
        </div>
        <button
          className="border-fog rounded-md border px-3 py-2 text-xs font-medium"
          onClick={() => void testSound()}
          type="button"
        >
          Test Sound
        </button>
      </div>
      {definitions.map((definition) => {
        const preference = preferences.find(
          (item) => item.code === definition.code,
        );

        const webEnabled = preference?.webEnabled ?? true;
        const webMode = preference?.webMode ?? "transient";
        const emailEnabled = preference?.emailEnabled ?? true;
        const soundEnabled = preference?.soundEnabled ?? false;
        const pushEnabled = preference?.pushEnabled ?? false;
        const isSaving = saving === definition.code;

        return (
          <div
            className="border-fog bg-mist rounded-lg border px-4 py-3"
            key={definition.code}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-ink text-sm font-medium">
                  {definition.label}
                </p>
                <p className="text-skyline mt-0.5 text-xs">
                  {definition.description}
                </p>
              </div>

              {isSaving ? (
                <span className="text-skyline shrink-0 text-[11px]">
                  Saving…
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                aria-checked={webEnabled}
                aria-label={`${webEnabled ? "Disable" : "Enable"} ${definition.label} web notifications`}
                className={[
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
                  webEnabled
                    ? "border-signal bg-signal"
                    : "border-fog bg-white",
                  isSaving ? "cursor-wait opacity-60" : "cursor-pointer",
                ].join(" ")}
                disabled={isSaving}
                onClick={() =>
                  void savePreference(definition, {
                    webEnabled: !webEnabled,
                  })
                }
                role="switch"
                type="button"
              >
                <span
                  className={[
                    "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition",
                    webEnabled ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>

              <span className="text-ink text-xs font-medium">Web</span>

              {webEnabled ? (
                <div
                  className="border-fog ml-1 flex rounded-md border bg-white p-0.5"
                  role="radiogroup"
                  aria-label={`${definition.label} web notification behaviour`}
                >
                  <button
                    aria-checked={webMode === "transient"}
                    className={[
                      "rounded px-2 py-1 text-[11px] font-medium transition",
                      webMode === "transient"
                        ? "bg-signal/10 text-ink"
                        : "text-skyline hover:text-ink",
                    ].join(" ")}
                    disabled={isSaving}
                    onClick={() => updateWebMode(definition, "transient")}
                    role="radio"
                    type="button"
                  >
                    Transient
                  </button>

                  <button
                    aria-checked={webMode === "persistent"}
                    className={[
                      "rounded px-2 py-1 text-[11px] font-medium transition",
                      webMode === "persistent"
                        ? "bg-signal/10 text-ink"
                        : "text-skyline hover:text-ink",
                    ].join(" ")}
                    disabled={isSaving}
                    onClick={() => updateWebMode(definition, "persistent")}
                    role="radio"
                    type="button"
                  >
                    Persistent
                  </button>
                </div>
              ) : null}

              <span className="text-fog mx-1">|</span>

              <button
                aria-checked={soundEnabled}
                aria-label={`${soundEnabled ? "Disable" : "Enable"} ${definition.label} sound notifications`}
                className={[
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
                  soundEnabled
                    ? "border-signal bg-signal"
                    : "border-fog bg-white",
                  isSaving ? "cursor-wait opacity-60" : "cursor-pointer",
                ].join(" ")}
                disabled={isSaving}
                onClick={() =>
                  void savePreference(definition, {
                    soundEnabled: !soundEnabled,
                  })
                }
                role="switch"
                type="button"
              >
                <span
                  className={[
                    "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition",
                    soundEnabled ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>

              <span className="text-ink text-xs font-medium">Sound</span>

              <span className="text-fog mx-1">|</span>

              {pushApplicationServerKey ? (
                <>
                  <button
                    aria-checked={pushEnabled}
                    aria-label={`${pushEnabled ? "Disable" : "Enable"} ${definition.label} push notifications`}
                    className={[
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
                      pushEnabled
                        ? "border-signal bg-signal"
                        : "border-fog bg-white",
                      isSaving ? "cursor-wait opacity-60" : "cursor-pointer",
                    ].join(" ")}
                    disabled={isSaving}
                    onClick={() =>
                      void savePreference(definition, {
                        pushEnabled: !pushEnabled,
                      })
                    }
                    role="switch"
                    type="button"
                  >
                    <span
                      className={[
                        "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition",
                        pushEnabled ? "translate-x-6" : "translate-x-1",
                      ].join(" ")}
                    />
                  </button>
                  <span className="text-ink text-xs font-medium">Push</span>
                </>
              ) : (
                <span className="text-skyline text-xs">Push setup needed</span>
              )}

              {!emailNotificationsPaused ? (
                <>
                  <span className="text-fog mx-1">|</span>

                  <button
                    aria-checked={emailEnabled}
                    aria-label={`${emailEnabled ? "Disable" : "Enable"} ${definition.label} email notifications`}
                    className={[
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
                      emailEnabled
                        ? "border-signal bg-signal"
                        : "border-fog bg-white",
                      isSaving ? "cursor-wait opacity-60" : "cursor-pointer",
                    ].join(" ")}
                    disabled={isSaving}
                    onClick={() =>
                      void savePreference(definition, {
                        emailEnabled: !emailEnabled,
                      })
                    }
                    role="switch"
                    type="button"
                  >
                    <span
                      className={[
                        "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition",
                        emailEnabled ? "translate-x-6" : "translate-x-1",
                      ].join(" ")}
                    />
                  </button>

                  <span className="text-ink text-xs font-medium">Email</span>
                </>
              ) : null}
            </div>
          </div>
        );
      })}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
