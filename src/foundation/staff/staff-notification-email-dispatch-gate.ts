import { createServiceClient } from "@/lib/supabase/admin";

/** Fail closed if the database master email gate is absent or unreadable. */
export async function isStaffNotificationEmailDispatchEnabled(): Promise<boolean> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.rpc(
      "staff_notification_email_dispatch_is_enabled",
    );

    return !error && data === true;
  } catch {
    return false;
  }
}
