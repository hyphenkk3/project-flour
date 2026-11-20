"use client";

import { useState } from "react";

import { saveStaffNotificationPreferenceAction } from "@/foundation/staff/notification-preferences-actions";
import {
  registerStaffPushSubscriptionAction,
  revokeStaffPushSubscriptionAction,
} from "@/foundation/staff/staff-notification-push-actions";
import { playStaffNotificationSound } from "@/foundation/staff/staff-notification-sound";
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
    const previouslyPushEnabled = previous.some(
      (preference) => preference.pushEnabled,
    );
    if (patch.pushEnabled === true) {
      const subscribed = await subscribeCurrentStaffDevice({
        applicationServerKey: pushApplicationServerKey,
      });
      if (!subscribed.subscription) {
        setPreferences(previous);
        setError(subscribed.error);
        setSaving(null);
        return;
      }

      const registered = await registerStaffPushSubscriptionAction(
        subscribed.subscription,
      );
      if (registered.error) {
        setPreferences(previous);
        setError(registered.error);
        if (!previouslyPushEnabled) {
          await unsubscribeCurrentStaffDevice();
        }
        setSaving(null);
        return;
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

    const result = await saveStaffNotificationPreferenceAction(formData);

    if (result.error) {
      setPreferences(previous);
      setError(result.error);
      if (registeredPushEndpoint && !previouslyPushEnabled) {
        await revokeStaffPushSubscriptionAction(registeredPushEndpoint);
        await unsubscribeCurrentStaffDevice();
      }
    } else if (
      patch.pushEnabled === false &&
      !nextPreferences.some((preference) => preference.pushEnabled)
    ) {
      const endpoint = await currentStaffDeviceEndpoint();
      if (endpoint) {
        const revoked = await revokeStaffPushSubscriptionAction(endpoint);
        if (revoked.error) {
          setError(revoked.error);
        } else {
          await unsubscribeCurrentStaffDevice();
        }
      }
    }

    setSaving(null);
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
        ? "Cue scheduled. Confirm that you can hear it."
        : `Sound unavailable (${result.restriction}).`,
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
