"use client";

import { useState } from "react";

import { saveStaffNotificationPreferenceAction } from "@/foundation/staff/notification-preferences-actions";
import type {
  StaffNotificationDefinition,
  StaffNotificationPreference,
} from "@/foundation/staff/notification-preferences";

type NotificationPreferencesProps = {
  definitions: readonly StaffNotificationDefinition[];
  initialPreferences: StaffNotificationPreference[];
};

export function NotificationPreferences({
  definitions,
  initialPreferences,
}: NotificationPreferencesProps) {
  const [preferences, setPreferences] =
    useState<StaffNotificationPreference[]>(initialPreferences);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function togglePreference(
    definition: StaffNotificationDefinition,
    enabled: boolean,
  ) {
    const previous = preferences;

    setError(null);
    setSaving(definition.code);
    setPreferences((current) =>
      current.map((preference) =>
        preference.code === definition.code
          ? { ...preference, emailEnabled: enabled }
          : preference,
      ),
    );

    const formData = new FormData();
    formData.set("notification_code", definition.code);
    formData.set("email_enabled", String(enabled));

    const result = await saveStaffNotificationPreferenceAction(formData);

    if (result.error) {
      setPreferences(previous);
      setError(result.error);
    }

    setSaving(null);
  }

  return (
    <div className="mt-4 space-y-2">
      {definitions.map((definition) => {
        const preference = preferences.find(
          (item) => item.code === definition.code,
        );
        const enabled = preference?.emailEnabled ?? true;
        const isSaving = saving === definition.code;

        return (
          <div
            className="border-fog flex items-center justify-between gap-4 rounded-lg border bg-mist px-4 py-3"
            key={definition.code}
          >
            <div className="min-w-0">
              <p className="text-ink text-sm font-medium">
                {definition.label}
              </p>
              <p className="text-skyline mt-0.5 text-xs">
                {definition.description}
              </p>
            </div>

            <button
              aria-checked={enabled}
              aria-label={`${enabled ? "Disable" : "Enable"} ${definition.label} email notifications`}
              className={[
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
                enabled
                  ? "border-signal bg-signal"
                  : "border-fog bg-white",
                isSaving ? "cursor-wait opacity-60" : "cursor-pointer",
              ].join(" ")}
              disabled={isSaving}
              onClick={() => togglePreference(definition, !enabled)}
              role="switch"
              type="button"
            >
              <span
                className={[
                  "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition",
                  enabled ? "translate-x-6" : "translate-x-1",
                ].join(" ")}
              />
            </button>
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
