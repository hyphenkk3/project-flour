import { createClient } from "@/lib/supabase/server";
import {
  STAFF_NOTIFICATION_DEFINITIONS,
  STAFF_NOTIFICATION_DEFAULT_ENABLED,
  type StaffNotificationCode,
  type StaffNotificationPreference,
} from "@/foundation/staff/notification-preferences";

type NotificationPreferenceRow = {
  notification_code: string;
  email_enabled: boolean;
};

function isNotificationCode(
  value: string,
): value is StaffNotificationCode {
  return STAFF_NOTIFICATION_DEFINITIONS.some(
    (definition) => definition.code === value,
  );
}

export async function loadStaffNotificationPreferences(
  staffId: string,
): Promise<StaffNotificationPreference[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("staff_notification_preferences")
    .select("notification_code, email_enabled")
    .eq("staff_id", staffId);

  if (error) {
    throw new Error(error.message);
  }

  const saved = new Map<StaffNotificationCode, boolean>();

  for (const row of (data ?? []) as NotificationPreferenceRow[]) {
    if (isNotificationCode(row.notification_code)) {
      saved.set(row.notification_code, Boolean(row.email_enabled));
    }
  }

  return STAFF_NOTIFICATION_DEFINITIONS.map((definition) => ({
    code: definition.code,
    emailEnabled:
      saved.get(definition.code) ?? STAFF_NOTIFICATION_DEFAULT_ENABLED,
  }));
}
