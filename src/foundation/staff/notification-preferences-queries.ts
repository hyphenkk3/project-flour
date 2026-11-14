import { createClient } from "@/lib/supabase/server";

import {
  STAFF_NOTIFICATION_DEFINITIONS,
  STAFF_NOTIFICATION_DEFAULT_ENABLED,
  STAFF_NOTIFICATION_DEFAULT_WEB_MODE,
  STAFF_NOTIFICATION_DEFAULT_SOUND_ENABLED,
  STAFF_NOTIFICATION_DEFAULT_PUSH_ENABLED,
  type StaffNotificationCode,
  type StaffNotificationPreference,
  type StaffNotificationWebMode,
} from "@/foundation/staff/notification-preferences";

type NotificationPreferenceRow = {
  notification_code: string;
  web_enabled: boolean;
  web_mode: string;
  email_enabled: boolean;
  sound_enabled: boolean;
  push_enabled: boolean;
};

function isNotificationCode(value: string): value is StaffNotificationCode {
  return STAFF_NOTIFICATION_DEFINITIONS.some(
    (definition) => definition.code === value,
  );
}

function isWebMode(value: string): value is StaffNotificationWebMode {
  return value === "transient" || value === "persistent";
}

export async function loadStaffNotificationPreferences(
  staffId: string,
): Promise<StaffNotificationPreference[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("staff_notification_preferences")
    .select(
      "notification_code, web_enabled, web_mode, email_enabled, sound_enabled, push_enabled",
    )
    .eq("staff_id", staffId);

  if (error) {
    throw new Error(error.message);
  }

  const saved = new Map<
    StaffNotificationCode,
    {
      webEnabled: boolean;
      webMode: StaffNotificationWebMode;
      emailEnabled: boolean;
      soundEnabled: boolean;
      pushEnabled: boolean;
    }
  >();

  for (const row of (data ?? []) as NotificationPreferenceRow[]) {
    if (!isNotificationCode(row.notification_code)) continue;

    saved.set(row.notification_code, {
      webEnabled: Boolean(row.web_enabled),
      webMode: isWebMode(row.web_mode)
        ? row.web_mode
        : STAFF_NOTIFICATION_DEFAULT_WEB_MODE,
      emailEnabled: Boolean(row.email_enabled),
      soundEnabled: Boolean(row.sound_enabled),
      pushEnabled: Boolean(row.push_enabled),
    });
  }

  return STAFF_NOTIFICATION_DEFINITIONS.map((definition) => {
    const savedPreference = saved.get(definition.code);

    return {
      code: definition.code,
      webEnabled:
        savedPreference?.webEnabled ?? STAFF_NOTIFICATION_DEFAULT_ENABLED,
      webMode: savedPreference?.webMode ?? STAFF_NOTIFICATION_DEFAULT_WEB_MODE,
      emailEnabled:
        savedPreference?.emailEnabled ?? STAFF_NOTIFICATION_DEFAULT_ENABLED,
      soundEnabled:
        savedPreference?.soundEnabled ??
        STAFF_NOTIFICATION_DEFAULT_SOUND_ENABLED,
      pushEnabled:
        savedPreference?.pushEnabled ?? STAFF_NOTIFICATION_DEFAULT_PUSH_ENABLED,
    };
  });
}
