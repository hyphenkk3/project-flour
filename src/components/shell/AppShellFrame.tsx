"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";
import type { StaffProfile } from "@/types/staff";
import { AppShell } from "@/components/shell/AppShell";
import { ToastProvider } from "@/components/ui/Toast";

type AppShellFrameProps = {
  staff: StaffProfile;
  navigation: WorkspaceNavItem[];
  title?: string;
  children: ReactNode;
};

function titleForPath(pathname: string): string {
  if (pathname.startsWith("/customer-operations")) {
    return "Customer Operations";
  }
  return "Home";
}

export function AppShellFrame({
  staff,
  navigation,
  title,
  children,
}: AppShellFrameProps) {
  const pathname = usePathname();

  return (
    <ToastProvider>
      <AppShell
        currentPath={pathname}
        navigation={navigation}
        staff={staff}
        title={title ?? titleForPath(pathname)}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
