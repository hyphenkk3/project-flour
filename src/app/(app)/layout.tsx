import { requireStaff } from "@/foundation/auth/session";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";
import { AppShellFrame } from "@/components/shell/AppShellFrame";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staff = await requireStaff();
  const navigation = getNavigationForRole(staff.role.code);

  return (
    <AppShellFrame navigation={navigation} staff={staff}>
      {children}
    </AppShellFrame>
  );
}
