import { requireStaff } from "@/foundation/auth/session";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";
import { loadStaffNotificationPreferences } from "@/foundation/staff/notification-preferences-queries";
import { AppShellFrame } from "@/components/shell/AppShellFrame";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staff = await requireStaff();
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
