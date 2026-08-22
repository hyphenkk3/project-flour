"use server";

import { requireStaff } from "@/foundation/auth/session";
import {
  STAFF_NOTIFICATION_DEFINITIONS,
  type StaffNotificationCode,
} from "@/foundation/staff/notification-preferences";
import { createClient } from "@/lib/supabase/server";

function isNotificationCode(
  value: string,
): value is StaffNotificationCode {
  return STAFF_NOTIFICATION_DEFINITIONS.some(
    (definition) => definition.code === value,
  );
}

export async function saveStaffNotificationPreferenceAction(
  formData: FormData,
): Promise<{ error: string | null }> {
  const staff = await requireStaff();

  const code = String(formData.get("notification_code") ?? "").trim();

  if (!isNotificationCode(code)) {
    return { error: "Choose a valid notification." };
  }

  const emailEnabled = String(formData.get("email_enabled") ?? "") === "true";

  const supabase = await createClient();

  const { error } = await supabase
    .from("staff_notification_preferences")
    .upsert(
      {
        staff_id: staff.id,
        notification_code: code,
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
