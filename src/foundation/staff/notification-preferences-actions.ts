"use server";

import { requireStaff } from "@/foundation/auth/session";
import {
  STAFF_NOTIFICATION_DEFINITIONS,
  type StaffNotificationCode,
  type StaffNotificationWebMode,
} from "@/foundation/staff/notification-preferences";
import { createClient } from "@/lib/supabase/server";

function isNotificationCode(
  value: string,
): value is StaffNotificationCode {
  return STAFF_NOTIFICATION_DEFINITIONS.some(
    (definition) => definition.code === value,
  );
}

function isWebMode(
  value: string,
): value is StaffNotificationWebMode {
  return value === "transient" || value === "persistent";
}

export async function saveStaffNotificationPreferenceAction(
  formData: FormData,
): Promise<{ error: string | null }> {
  const staff = await requireStaff();

  const code = String(formData.get("notification_code") ?? "").trim();

  if (!isNotificationCode(code)) {
    return { error: "Choose a valid notification." };
  }

  const webEnabled =
    String(formData.get("web_enabled") ?? "") === "true";

  const emailEnabled =
    String(formData.get("email_enabled") ?? "") === "true";

  const webModeValue = String(
    formData.get("web_mode") ?? "transient",
  );

  if (!isWebMode(webModeValue)) {
    return { error: "Choose a valid web notification mode." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("staff_notification_preferences")
    .upsert(
      {
        staff_id: staff.id,
        notification_code: code,
        web_enabled: webEnabled,
        web_mode: webModeValue,
        email_enabled: emailEnabled,
      },
      {
        onConflict: "staff_id,notification_code",
      },
    );

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
