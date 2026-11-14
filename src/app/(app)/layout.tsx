import { redirect } from "next/navigation";
import { AppShellFrame } from "@/components/shell/AppShellFrame";
import { requireStaff } from "@/foundation/auth/session";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";
import { STAFF_FORCED_PASSWORD_CHANGE_PATH } from "@/foundation/staff/forced-password-change";
import { loadStaffNotificationPreferences } from "@/foundation/staff/notification-preferences-queries";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staff = await requireStaff();
  if (staff.mustChangePassword) {
    redirect(STAFF_FORCED_PASSWORD_CHANGE_PATH);
  }

  const navigation = getNavigationForRole(staff.role.code);

  const notificationPreferences =
    await loadStaffNotificationPreferences(staff.id);

  if (notificationPreferences.length === 0) {
    throw new Error("Staff notification preferences are unavailable.");
  }

  return (
    <AppShellFrame
      navigation={navigation}
      staff={staff}
      notificationPreferences={notificationPreferences}
    >
      {children}
    </AppShellFrame>
  );
}
